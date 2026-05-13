export type LogMeta = Record<string, unknown>;

export type LoggerOptions = {
  level?: string;
  app?: string;
};

type LevelName = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LEVEL_VALUE: Record<LevelName, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function parseLevel(raw: string | undefined): LevelName {
  const s = (raw ?? "info").toLowerCase().trim();
  if (s in LEVEL_VALUE) return s as LevelName;
  return "info";
}

function resolveMinLevel(options?: LoggerOptions): LevelName {
  return parseLevel(options?.level?.trim() || process.env.LOG_LEVEL?.trim());
}

export class Logger {
  private readonly threshold: number;
  private readonly app?: string;

  constructor(options?: LoggerOptions) {
    this.threshold = LEVEL_VALUE[resolveMinLevel(options)];
    this.app = options?.app;
  }

  private enabled(level: LevelName): boolean {
    return LEVEL_VALUE[level] >= this.threshold;
  }

  private emit(level: LevelName, meta: LogMeta | undefined, message: string): void {
    if (!this.enabled(level)) return;

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      ...(this.app ? { app: this.app } : {}),
      msg: message,
      ...(meta ?? {}),
    });

    switch (level) {
      case "trace":
      case "debug":
        console.debug(line);
        break;
      case "info":
        console.info(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "error":
      case "fatal":
        console.error(line);
        break;
    }
  }

  trace(meta: LogMeta, message: string): void;
  trace(message: string): void;
  trace(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("trace", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("trace", metaOrMsg, message);
  }

  debug(meta: LogMeta, message: string): void;
  debug(message: string): void;
  debug(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("debug", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("debug", metaOrMsg, message);
  }

  info(meta: LogMeta, message: string): void;
  info(message: string): void;
  info(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("info", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("info", metaOrMsg, message);
  }

  warn(meta: LogMeta, message: string): void;
  warn(message: string): void;
  warn(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("warn", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("warn", metaOrMsg, message);
  }

  error(meta: LogMeta, message: string): void;
  error(message: string): void;
  error(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("error", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("error", metaOrMsg, message);
  }

  fatal(meta: LogMeta, message: string): void;
  fatal(message: string): void;
  fatal(metaOrMsg: LogMeta | string, message?: string): void {
    if (typeof metaOrMsg === "string") this.emit("fatal", undefined, metaOrMsg);
    else if (message !== undefined) this.emit("fatal", metaOrMsg, message);
  }
}

export function createLogger(options?: LoggerOptions): Logger {
  return new Logger(options);
}
