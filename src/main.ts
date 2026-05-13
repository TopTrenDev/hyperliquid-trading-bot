import { HyperliquidBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const cfg = loadConfig();
const logger = createLogger({ app: "hyperliquid-bot" });

const bot = new HyperliquidBot(cfg, logger);

async function shutdown(signal: string) {
  logger.warn({ signal }, "shutdown");
  await bot.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await bot.start();
} catch (e) {
  logger.fatal({ err: e }, "bot_failed_to_start");
  process.exit(1);
}
