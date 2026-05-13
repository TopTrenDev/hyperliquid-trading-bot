import "dotenv/config";
import { isAddress, type Address } from "viem";
import { z } from "zod";

const networkSchema = z.enum(["mainnet", "testnet"]);

function envBool(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return defaultValue;
      const s = v.toLowerCase();
      if (["1", "true", "yes", "on"].includes(s)) return true;
      if (["0", "false", "no", "off"].includes(s)) return false;
      return defaultValue;
    });
}

const schema = z
  .object({
    HL_PRIVATE_KEY: z
      .string()
      .optional()
      .transform((k) => {
        if (!k) return undefined;
        const t = k.trim();
        return t.startsWith("0x") ? t : `0x${t}`;
      }),
    HL_USER_ADDRESS: z
      .string()
      .optional()
      .superRefine((val, ctx) => {
        if (!val?.trim()) return;
        if (!isAddress(val.trim() as `0x${string}`)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "HL_USER_ADDRESS must be a valid 0x address" });
        }
      })
      .transform((val): Address | undefined => {
        if (!val?.trim()) return undefined;
        return val.trim() as Address;
      }),
    HL_NETWORK: networkSchema.default("mainnet"),
    HL_COIN: z.string().min(1).default("BTC"),
    TRADING_ENABLED: envBool(false),
    HL_CROSS_MARGIN: envBool(true),
    HL_LEVERAGE: z.coerce.number().int().min(1).max(125).default(3),
    MAX_POSITION_USD: z.coerce.number().positive().default(500),
    ORDER_NOTIONAL_USD: z.coerce.number().positive().default(50),
    ORDER_COOLDOWN_MS: z.coerce.number().int().nonnegative().default(15_000),
    IOC_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5000).default(50),
    STRATEGY: z.enum(["noop", "dual_ma"]).default("noop"),
    DUAL_MA_FAST: z.coerce.number().int().min(2).default(12),
    DUAL_MA_SLOW: z.coerce.number().int().min(3).default(48),
    DUAL_MA_BAND_BPS: z.coerce.number().int().min(0).default(8),
    TICK_INTERVAL_MS: z.coerce.number().int().min(500).default(2000),
  })
  .superRefine((data, ctx) => {
    if (data.TRADING_ENABLED && !data.HL_PRIVATE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["HL_PRIVATE_KEY"],
        message: "HL_PRIVATE_KEY is required when TRADING_ENABLED is true",
      });
    }
    if (data.DUAL_MA_SLOW <= data.DUAL_MA_FAST) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DUAL_MA_SLOW"],
        message: "DUAL_MA_SLOW must be greater than DUAL_MA_FAST",
      });
    }
  });

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid configuration:\n${msg}`);
  }
  return parsed.data;
}
