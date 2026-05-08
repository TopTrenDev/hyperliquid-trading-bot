import { HyperliquidBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const cfg = loadConfig();
const log = createLogger(cfg.LOG_LEVEL);

const bot = new HyperliquidBot(cfg, log);

async function shutdown(signal: string) {
  log.warn({ signal }, "shutdown");
  await bot.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await bot.start();
} catch (e) {
  log.fatal({ err: e }, "bot_failed_to_start");
  process.exit(1);
}
