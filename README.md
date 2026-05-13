# Hyperliquid Trading Bot 🤖

TypeScript bot for [Hyperliquid](https://hyperliquid.gitbook.io/hyperliquid-docs) perpetuals: live mid prices over WebSocket, periodic account polling, pluggable strategy, risk checks, and optional order submission via [`@nktkas/hyperliquid`](https://www.npmjs.com/package/@nktkas/hyperliquid) and [viem](https://viem.sh/).

Trading is **off by default** (`TRADING_ENABLED=false`). Treat live perps and private keys as high risk. ⚠️

[![Telegram](https://img.shields.io/badge/Telegram-@toptrendev_66-2CA5E0?style=for-the-badge&logo=telegram)](https://t.me/TopTrenDev_66)
[![Twitter](https://img.shields.io/badge/Twitter-@toptrendev-1DA1F2?style=for-the-badge&logo=x)](https://x.com/intent/follow?screen_name=toptrendev)
[![Gmail](https://img.shields.io/badge/Gmail-marekdvojak146%40gmail.com-D14836?style=for-the-badge&logo=gmail)](mailto:marekdvojak146@gmail.com)


## Setup 🚀

```bash
cd hyperliquid-trading-bot
npm install
cp .env.example .env
```

On Windows, use `copy .env.example .env` instead of `cp`.

Edit `.env`. See [.env.example](.env.example) for every variable and short descriptions.

## Scripts 🛠️

| Command | Description |
|--------|-------------|
| `npm run dev` | Run with `tsx watch` (reload on file changes) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled output (`node dist/main.js`) |
| `npm run typecheck` | Typecheck without emitting files |

## Configuration ⚙️

All settings come from environment variables (loaded with [dotenv](https://github.com/motdotla/dotenv)). Important groups:

- **Network:** `HL_NETWORK` (`mainnet` \| `testnet`)
- **Market:** `HL_COIN` (e.g. `BTC` on the main DEX)
- **Trading:** `TRADING_ENABLED`, `HL_PRIVATE_KEY` (required when trading is on)
- **Read-only watch:** optional `HL_USER_ADDRESS` when not trading, to poll positions
- **Risk:** `MAX_POSITION_USD`, `ORDER_NOTIONAL_USD`, `ORDER_COOLDOWN_MS`, `IOC_SLIPPAGE_BPS`
- **Strategy:** `STRATEGY` (`noop` \| `dual_ma`) and `DUAL_MA_*` when using `dual_ma`
- **Loop:** `TICK_INTERVAL_MS`

On startup with trading enabled, the bot sets leverage with `updateLeverage`, using `HL_LEVERAGE` capped by the coin’s maximum from exchange metadata.

## Project Layout 🗂️

```
src/
  main.ts           # Entry, signals
  bot.ts            # WS mids, tick loop, risk, execution
  config.ts         # Zod-validated env
  logger.ts         # custom console JSON logger
  account.ts        # Clearinghouse helpers
  risk.ts           # Pre-trade limits
  execute.ts        # Order placement
  strategy/
    types.ts        # Strategy interface
    noop.ts         # No orders
    dualMa.ts       # Example long-only dual MA on mids
    index.ts        # Strategy factory
```

## Strategies 📈

- **`noop`** — Default. Connects and runs the loop but never submits orders.
- **`dual_ma`** — Example only: long-only signals from fast vs slow average of **mid** samples. Not financial advice; replace with your own logic in `src/strategy/`.

### How `dual_ma` Works 🧠

The included trading strategy is a simple **long-only dual moving average crossover** built on Hyperliquid mid prices:

1. The bot collects recent mid-price samples from the WebSocket stream.
2. It computes a **fast** moving average using the last `DUAL_MA_FAST` samples.
3. It computes a **slow** moving average using the last `DUAL_MA_SLOW` samples.
4. If the bot is flat and the fast average rises above the slow average by `DUAL_MA_BAND_BPS`, it submits an IOC buy order sized from `ORDER_NOTIONAL_USD`.
5. If the bot is already long and the fast average drops below the slow average by the same band, it submits a reduce-only IOC sell order to exit.

Notes:

- The strategy is **long-only**. It does not open short positions.
- It uses **mid prices**, not candle closes or external indicators.
- Entry and exit prices are offset by `IOC_SLIPPAGE_BPS` to improve the chance of immediate fills.
- The bot now serializes its async tick loop so a slow cycle cannot overlap with the next one.

