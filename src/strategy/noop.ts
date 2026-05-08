import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { Strategy, StrategyContext, StrategyDecision } from "./types.js";

export class NoopStrategy implements Strategy {
  readonly name = "noop";

  onMidSample(_ctx: StrategyContext, _config: AppConfig, _log: Logger): StrategyDecision {
    return { type: "none", reason: "noop" };
  }
}
