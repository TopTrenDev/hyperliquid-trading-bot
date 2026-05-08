import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { Strategy, StrategyContext, StrategyDecision } from "./types.js";

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export class DualMovingAverageStrategy implements Strategy {
  readonly name = "dual_ma";

  onMidSample(ctx: StrategyContext, config: AppConfig, log: Logger): StrategyDecision {
    const { midHistory, positionSizeBase, assetId, szDecimals } = ctx;
    const fastN = config.DUAL_MA_FAST;
    const slowN = config.DUAL_MA_SLOW;
    if (midHistory.length < slowN) {
      return { type: "none", reason: `warming_up:${midHistory.length}/${slowN}` };
    }

    const fast = avg(midHistory.slice(-fastN));
    const slow = avg(midHistory.slice(-slowN));
    const band = config.DUAL_MA_BAND_BPS / 10_000;
    const mid = ctx.mid;

    const flat = Math.abs(positionSizeBase) < 1e-12;

    if (positionSizeBase < 0) {
      return { type: "none", reason: "short_position_present_manual_review" };
    }

    if (flat && fast > slow * (1 + band)) {
      const rawSize = config.ORDER_NOTIONAL_USD / mid;
      let sizeStr: string;
      try {
        sizeStr = formatSize(rawSize, szDecimals);
      } catch (e) {
        log.warn({ err: e }, "formatSize failed for entry");
        return { type: "none", reason: "size_rounded_to_zero" };
      }
      let buyPx: string;
      try {
        buyPx = formatPrice(mid * (1 + config.IOC_SLIPPAGE_BPS / 10_000), szDecimals, "perp");
      } catch (e) {
        log.warn({ err: e }, "formatPrice failed for buy");
        return { type: "none", reason: "price_format_failed" };
      }
      log.info({ fast, slow, mid, buyPx, sizeStr }, "dual_ma long signal");
      return {
        type: "place_orders",
        note: "dual_ma_enter_long",
        orders: [
          {
            assetIndex: assetId,
            isBuy: true,
            price: buyPx,
            size: sizeStr,
            reduceOnly: false,
            tif: "Ioc",
          },
        ],
      };
    }

    if (positionSizeBase > 0 && fast < slow * (1 - band)) {
      const rawSize = positionSizeBase;
      let sizeStr: string;
      try {
        sizeStr = formatSize(rawSize, szDecimals);
      } catch (e) {
        log.warn({ err: e }, "formatSize failed for exit");
        return { type: "none", reason: "exit_size_rounded_to_zero" };
      }
      let sellPx: string;
      try {
        sellPx = formatPrice(mid * (1 - config.IOC_SLIPPAGE_BPS / 10_000), szDecimals, "perp");
      } catch (e) {
        log.warn({ err: e }, "formatPrice failed for sell");
        return { type: "none", reason: "exit_price_format_failed" };
      }
      log.info({ fast, slow, mid, sellPx, sizeStr }, "dual_ma exit signal");
      return {
        type: "place_orders",
        note: "dual_ma_exit_long",
        orders: [
          {
            assetIndex: assetId,
            isBuy: false,
            price: sellPx,
            size: sizeStr,
            reduceOnly: true,
            tif: "Ioc",
          },
        ],
      };
    }

    return { type: "none", reason: "no_signal" };
  }
}
