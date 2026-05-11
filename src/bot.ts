import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
  SubscriptionClient,
  WebSocketTransport,
} from "@nktkas/hyperliquid";
import { SymbolConverter } from "@nktkas/hyperliquid/utils";
import { privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { accountValueUsd, fetchClearinghouse, parsePositionForCoin } from "./account.js";
import type { AppConfig } from "./config.js";
import { placeOrders } from "./execute.js";
import type { Logger } from "./logger.js";
import { applyRisk } from "./risk.js";
import { createStrategy } from "./strategy/index.js";
import type { StrategyContext } from "./strategy/types.js";

export class HyperliquidBot {
  private midHistory: number[] = [];
  private lastOrderTs = 0;
  private latestMids: Record<string, string> = {};
  private timer: ReturnType<typeof setInterval> | undefined;
  private midSub: { unsubscribe: () => Promise<void> } | undefined;
  private tickInFlight: Promise<void> | undefined;

  constructor(
    private readonly cfg: AppConfig,
    private readonly log: Logger,
  ) {}

  async start(): Promise<void> {
    const isTestnet = this.cfg.HL_NETWORK === "testnet";
    const http = new HttpTransport({ isTestnet });
    const ws = new WebSocketTransport({ isTestnet });
    const info = new InfoClient({ transport: http });
    const subs = new SubscriptionClient({ transport: ws });

    const converter = await SymbolConverter.create({ transport: http });
    const assetId = converter.getAssetId(this.cfg.HL_COIN);
    if (assetId === undefined) {
      throw new Error(`Unknown perp symbol ${this.cfg.HL_COIN} (check HL_COIN / network)`);
    }
    const szDecimals = converter.getSzDecimals(this.cfg.HL_COIN);
    if (szDecimals === undefined) {
      throw new Error(`Missing size decimals for ${this.cfg.HL_COIN}`);
    }

    const meta = await info.meta();
    const uni = meta.universe.find((u) => u.name === this.cfg.HL_COIN);
    if (!uni) {
      throw new Error(`Coin ${this.cfg.HL_COIN} not listed in meta.universe`);
    }
    const leverage = Math.min(this.cfg.HL_LEVERAGE, uni.maxLeverage);

    let exchange: ExchangeClient | undefined;
    let user: Address | null = null;

    if (this.cfg.TRADING_ENABLED) {
      if (!this.cfg.HL_PRIVATE_KEY) {
        throw new Error("HL_PRIVATE_KEY required when TRADING_ENABLED=true");
      }
      const wallet = privateKeyToAccount(this.cfg.HL_PRIVATE_KEY as `0x${string}`);
      user = wallet.address;
      exchange = new ExchangeClient({ transport: http, wallet });
      await exchange.updateLeverage({
        asset: assetId,
        isCross: this.cfg.HL_CROSS_MARGIN,
        leverage,
      });
      this.log.info(
        { user, leverage, cross: this.cfg.HL_CROSS_MARGIN, coin: this.cfg.HL_COIN, assetId },
        "trading_enabled",
      );
    } else if (this.cfg.HL_USER_ADDRESS) {
      user = this.cfg.HL_USER_ADDRESS;
      this.log.info({ user, coin: this.cfg.HL_COIN }, "read_only_user_watch");
    } else {
      this.log.warn("No HL_USER_ADDRESS and TRADING_ENABLED=false — position fields stay zero");
    }

    const strategy = createStrategy(this.cfg);
    const historyCap = Math.max(this.cfg.DUAL_MA_SLOW + 50, 200);

    this.midSub = await subs.allMids((ev) => {
      this.latestMids = ev.mids as Record<string, string>;
    });

    const tickDeps = {
      info,
      exchange,
      user,
      assetId,
      szDecimals,
      strategy,
      historyCap,
    };

    this.launchTick(tickDeps);
    this.timer = setInterval(() => {
      this.launchTick(tickDeps);
    }, this.cfg.TICK_INTERVAL_MS);

    this.log.info(
      {
        strategy: strategy.name,
        tickMs: this.cfg.TICK_INTERVAL_MS,
        trading: this.cfg.TRADING_ENABLED,
      },
      "bot_started",
    );
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.tickInFlight) {
      await this.tickInFlight;
    }
    if (this.midSub) {
      await this.midSub.unsubscribe();
      this.midSub = undefined;
    }
  }

  private launchTick(deps: {
    info: InfoClient;
    exchange: ExchangeClient | undefined;
    user: Address | null;
    assetId: number;
    szDecimals: number;
    strategy: ReturnType<typeof createStrategy>;
    historyCap: number;
  }): void {
    if (this.tickInFlight) {
      this.log.warn("tick_skipped_previous_cycle_still_running");
      return;
    }

    this.tickInFlight = this.tick(deps)
      .catch((e) => {
        this.log.error({ err: e }, "tick_failed");
      })
      .finally(() => {
        this.tickInFlight = undefined;
      });
  }

  private async tick(deps: {
    info: InfoClient;
    exchange: ExchangeClient | undefined;
    user: Address | null;
    assetId: number;
    szDecimals: number;
    strategy: ReturnType<typeof createStrategy>;
    historyCap: number;
  }): Promise<void> {
    const { info, exchange, user, assetId, szDecimals, strategy, historyCap } = deps;
    const midStr = this.latestMids[this.cfg.HL_COIN];
    if (!midStr) {
      this.log.trace({ coin: this.cfg.HL_COIN }, "no_mid_yet");
      return;
    }
    const mid = Number(midStr);
    if (!Number.isFinite(mid) || mid <= 0) {
      this.log.warn({ midStr }, "invalid_mid");
      return;
    }

    this.midHistory.push(mid);
    if (this.midHistory.length > historyCap) {
      this.midHistory.splice(0, this.midHistory.length - historyCap);
    }

    let positionSizeBase = 0;
    let accountVal = 0;
    if (user) {
      try {
        const ch = await fetchClearinghouse(info, user);
        positionSizeBase = parsePositionForCoin(ch, this.cfg.HL_COIN).sizeBase;
        accountVal = accountValueUsd(ch);
      } catch (e) {
        this.log.error({ err: e }, "clearinghouse_poll_failed");
        return;
      }
    }

    const ctx: StrategyContext = {
      coin: this.cfg.HL_COIN,
      assetId,
      szDecimals,
      mid,
      midHistory: this.midHistory,
      positionSizeBase,
      accountValueUsd: accountVal,
    };

    const decision = strategy.onMidSample(ctx, this.cfg, this.log);
    if (decision.type !== "place_orders") {
      if (decision.reason && decision.reason !== "noop") {
        this.log.trace({ reason: decision.reason }, "strategy_noop");
      }
      return;
    }

    if (!this.cfg.TRADING_ENABLED || !exchange) {
      this.log.info({ note: decision.note, orders: decision.orders }, "would_trade_but_disabled");
      return;
    }

    const risk = applyRisk(
      decision.orders,
      {
        mid,
        positionSizeBase,
        maxPositionUsd: this.cfg.MAX_POSITION_USD,
        orderNotionalUsd: this.cfg.ORDER_NOTIONAL_USD,
        lastOrderTs: this.lastOrderTs,
        cooldownMs: this.cfg.ORDER_COOLDOWN_MS,
      },
      this.cfg,
      this.log,
    );

    if (!risk.ok) {
      this.log.info({ reason: risk.reason }, "risk_blocked");
      return;
    }

    try {
      await placeOrders(exchange, risk.orders, this.log);
      this.lastOrderTs = Date.now();
    } catch (e) {
      this.log.error({ err: e }, "order_submit_failed");
    }
  }
}
