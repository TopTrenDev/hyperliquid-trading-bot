import type { AppConfig } from "./config.js";
import type { Logger } from "./logger.js";
import type { OrderIntent } from "./strategy/types.js";

export type RiskContext = {
  mid: number;
  positionSizeBase: number;
  maxPositionUsd: number;
  orderNotionalUsd: number;
  lastOrderTs: number;
  cooldownMs: number;
};

export type RiskResult =
  | { ok: true; orders: OrderIntent[] }
  | { ok: false; reason: string };

export function applyRisk(
  intents: OrderIntent[],
  ctx: RiskContext,
  _config: AppConfig,
  log: Logger,
): RiskResult {
  if (intents.length === 0) {
    return { ok: false, reason: "no_intents" };
  }

  const now = Date.now();
  if (now - ctx.lastOrderTs < ctx.cooldownMs) {
    return { ok: false, reason: `cooldown:${ctx.cooldownMs - (now - ctx.lastOrderTs)}ms_remaining` };
  }

  const next = [...intents];

  for (const o of next) {
    const sz = Number(o.size);
    const px = Number(o.price);
    if (!Number.isFinite(sz) || !Number.isFinite(px) || sz <= 0 || px <= 0) {
      return { ok: false, reason: "invalid_order_fields" };
    }

    const deltaBase = o.isBuy ? sz : -sz;
    const projectedBase = ctx.positionSizeBase + deltaBase;
    const projectedUsd = Math.abs(projectedBase * ctx.mid);

    if (projectedUsd > ctx.maxPositionUsd + 1e-6) {
      log.warn(
        { projectedUsd, max: ctx.maxPositionUsd, positionSizeBase: ctx.positionSizeBase, deltaBase },
        "risk_block_max_position",
      );
      return { ok: false, reason: "would_exceed_max_position_usd" };
    }

    const orderUsd = sz * ctx.mid;
    if (!o.reduceOnly && orderUsd > ctx.orderNotionalUsd * 1.05) {
      log.warn({ orderUsd, cap: ctx.orderNotionalUsd }, "risk_block_order_notional");
      return { ok: false, reason: "order_notional_too_large" };
    }
  }

  return { ok: true, orders: next };
}
