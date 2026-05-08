import type { ExchangeClient } from "@nktkas/hyperliquid";
import type { Logger } from "./logger.js";
import type { OrderIntent } from "./strategy/types.js";

export async function placeOrders(exchange: ExchangeClient, orders: OrderIntent[], log: Logger) {
  if (orders.length === 0) return;

  const payload = {
    orders: orders.map((o) => ({
      a: o.assetIndex,
      b: o.isBuy,
      p: o.price,
      s: o.size,
      r: o.reduceOnly,
      t: { limit: { tif: o.tif } } as const,
    })),
    grouping: "na" as const,
  };

  log.info({ count: orders.length, payload }, "submitting_orders");
  const res = await exchange.order(payload);
  log.info({ res }, "order_response");
}
