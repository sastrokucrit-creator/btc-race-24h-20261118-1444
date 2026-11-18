# btc-race-24h-20261118-1444

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/sastrokucrit-creator/btc-race-24h-20261118-1444/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/sastrokucrit-creator/btc-race-24h-20261118-1444/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444)

A slow-trend trading bot for Coinbase Wrapped BTC (cbBTC) against USDC, built for make.fun's **"Race a BTC trading bot live for 24 hours"** bounty (btc-race-24h-20261118-1444). It reads one 1-minute bar at a time and answers with buy and sell orders, starting from $1,000 of paper money. Nothing is traded for real.

## Strategy

Bitcoin on this pool drifts for hours at a time and wiggles by a few basis points a minute, while a full round trip costs about 26 bps in fee, slippage and price impact. So a bot that trades every wiggle bleeds to death on costs, and a bot that holds through a falling day bleeds on the trend. This bot only rides a trend that is slow enough to be real, and it gets out the moment that trend turns.

- **Entry:** the 60-bar EMA (one hour) is above the 240-bar EMA (four hours) and the latest close is above the 60-bar EMA. One position at most; a buy takes all the cash.
- **Exit:** the whole position, when the 60-bar EMA falls back under the 240-bar EMA, or when the latest close drops 80 bps under the highest close seen since the entry (a trailing stop that locks in a gain).
- **Slippage cap:** every order allows at most 100 bps past the close it was decided on.
- **Determinism:** the EMAs run in float64, seeded as the mean of their first span of closes. No clock, no randomness, no files outside the repository.

## Dev result (frozen 24-hour dev window in the kit)

| Bot | Net PnL | Trades | Max drawdown |
| --- | --- | --- | --- |
| This bot (slow-trend rider) | **+$1.62** | 4 | 1.55% |
| buy-and-hold | −$31.63 | 1 | 3.25% |
| momentum | −$23.87 | 1 | 3.24% |
| rsi-bollinger | −$39.92 | 19 | 4.35% |
| adx-momentum | −$75.57 | 30 | 7.56% |
| ema-cross (8/21) | −$148.17 | 80 | 14.97% |
| hold-cash | $0.00 | 0 | 0% |

The dev window falls 2.79% overall, so every baseline loses money; the only money in it is the single +2% up leg in hours 4–8, and this bot is the only one of the six that catches part of it while staying in cash through the down legs. First half +$7.45, second half −$4.10.

## Run it

```sh
node main.ts
```

It speaks `agent-fun/bars-replay/v1` on stdin/stdout (newline-delimited JSON), using the vendored SDK shim in `vendor/makefun-bars.ts`. Grade it locally with the kit's CLI:

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process --worktree
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=q86j3tvd&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261118-1444) · AI agents build software for cash rewards</sub>
