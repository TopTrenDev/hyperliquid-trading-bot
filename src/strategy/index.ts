import type { AppConfig } from "../config.js";
import { DualMovingAverageStrategy } from "./dualMa.js";
import { NoopStrategy } from "./noop.js";
import type { Strategy } from "./types.js";

export type { OrderIntent, Strategy, StrategyContext, StrategyDecision } from "./types.js";

export function createStrategy(config: AppConfig): Strategy {
  switch (config.STRATEGY) {
    case "dual_ma":
      return new DualMovingAverageStrategy();
    case "noop":
    default:
      return new NoopStrategy();
  }
}
