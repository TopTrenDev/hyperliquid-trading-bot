import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";

export type OrderIntent = {
  assetIndex: number;
  isBuy: boolean;
  price: string;
  size: string;
  reduceOnly: boolean;
  tif: "Gtc" | "Ioc" | "Alo" | "FrontendMarket";
};

export type StrategyDecision =
  | { type: "none"; reason?: string }
  | { type: "place_orders"; orders: OrderIntent[]; note?: string };

export type StrategyContext = {
  coin: string;
  assetId: number;
  szDecimals: number;
  mid: number;
  midHistory: number[];
  positionSizeBase: number;
  accountValueUsd: number;
};

export interface Strategy {
  readonly name: string;
  onMidSample(ctx: StrategyContext, config: AppConfig, log: Logger): StrategyDecision;
}
