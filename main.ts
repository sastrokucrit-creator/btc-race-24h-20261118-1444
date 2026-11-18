// Slow-trend rider for cbBTC/USDC on 1-minute bars.
//
// The idea, in one paragraph: Bitcoin on this pool drifts for hours at a time
// and wiggles by a few basis points a minute, while a full round trip costs
// about 26 bps in fee, slippage and price impact. So a bot that trades every
// wiggle bleeds to death on costs, and a bot that holds through a falling day
// bleeds on the trend. This bot only rides a trend that is slow enough to be
// real — a 1-hour average above a 4-hour average — and it gets out the moment
// that trend turns, or when the price gives back 80 bps from its best close
// since entry. It trades rarely, in full size, and spends most of a falling
// day in cash.
//
//   - Entry: the 60-bar EMA is above the 240-bar EMA and the latest close is
//     above the 60-bar EMA. One position at most; a buy takes all the cash.
//   - Exit: the whole position, when the 60-bar EMA falls back under the
//     240-bar EMA, or when the latest close drops 80 bps under the highest
//     close seen since the entry (a trailing stop that locks in a gain).
//   - Slippage cap: every order allows at most 100 bps past the close it was
//     decided on, so a fill into a sudden gap is refused rather than filled
//     for almost nothing; the signal is simply re-sent on the next bar.
//   - Warm-up: while the harness says the batches are warm-up, no order is
//     sent (the replay would reject it), but the EMAs still read the bars.
//   - Determinism: the EMAs run in float64 on + - * / alone, seeded as the
//     mean of their first span of closes. No clock, no randomness, no files
//     outside the repository, so the same bars always give the same orders.

import { BPS, runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

/** Bars in the fast and the slow average: one hour and four hours. */
const FAST_SPAN = 60;
const SLOW_SPAN = 240;
/** The trailing stop: how far, in basis points, the close may fall from the best close since entry. */
const TRAIL_BPS = 80;
/** The most any order may slip past the close it was decided on, in basis points. */
const MAX_SLIPPAGE_BPS = 100;

/** One exponential average: it gathers its first span of closes, then moves a fixed step toward each new close. */
class Average {
  readonly span: number;
  readonly step: number;
  private warm: number[] = [];
  value: number | null = null;

  constructor(span: number) {
    this.span = span;
    this.step = 2 / (span + 1);
  }

  add(close: number): void {
    if (this.value !== null) {
      this.value += this.step * (close - this.value);
      return;
    }
    this.warm.push(close);
    if (this.warm.length === this.span) {
      this.value = this.warm.reduce((sum, x) => sum + x, 0) / this.span;
    }
  }
}

/** The trend state of one symbol: its two averages and the best close since the current entry. */
class Trend {
  readonly fast = new Average(FAST_SPAN);
  readonly slow = new Average(SLOW_SPAN);
  /** Highest close since the position was opened; 0 while flat. */
  peak = 0;

  /** Fold a bar in and report whether the fast average is above the slow one. */
  update(bar: Bar): boolean {
    const close = Number(bar.c);
    this.fast.add(close);
    this.slow.add(close);
    return this.fast.value !== null && this.slow.value !== null && this.fast.value > this.slow.value;
  }

  /** The latest close, or null before the first bar. */
  close(state: BarsState, symbol: string): number | null {
    const c = state.close(symbol);
    return c === null ? null : Number(c);
  }
}

const trends = new Map<string, Trend>();

function trendOf(symbol: string): Trend {
  let t = trends.get(symbol);
  if (t === undefined) {
    t = new Trend();
    trends.set(symbol, t);
  }
  return t;
}

await runBars({
  onBatch(state, batch) {
    // Read every bar first, so the averages see this minute before any decision.
    const fresh = new Set<string>();
    for (const bar of batch.bars) {
      trendOf(bar.symbol).update(bar);
      fresh.add(bar.symbol);
    }
    if (state.warmingUp) return [];

    const { caps, fees } = state.hello;
    const orders: (SellInput | BuyInput)[] = [];

    for (const { symbol } of state.hello.symbols) {
      if (!fresh.has(symbol)) continue;
      const trend = trendOf(symbol);
      const held = state.positions.get(symbol);
      const close = trend.close(state, symbol);
      if (close === null || trend.fast.value === null || trend.slow.value === null) continue;
      const rising = trend.fast.value > trend.slow.value;

      if (held !== undefined) {
        // Track the best close since entry, then decide the exit.
        if (close > trend.peak) trend.peak = close;
        // Out: the trend turned, or the price gave back TRAIL_BPS from its best close since entry.
        const gaveBack = close <= trend.peak * (1 - TRAIL_BPS / 10_000);
        if (!rising || gaveBack) {
          orders.push({ side: 'sell', symbol, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        }
        continue;
      }
      // Flat: the peak belongs to no position, so it starts over at the next entry.
      trend.peak = 0;

      // In: the fast average rides above the slow one and the price sits above the fast one.
      if (!rising || close <= trend.fast.value) continue;
      const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
      let stake = state.cash < byWeight ? state.cash : byWeight;
      if (stake < BigInt(fees.min_notional_quote_units)) continue;
      orders.push({ side: 'buy', symbol, notional_quote_units: stake, max_slippage_bps: MAX_SLIPPAGE_BPS });
      // One open position at most: a buy here fills the single slot.
      break;
    }

    return orders.slice(0, caps.max_orders_per_bar);
  },
});
