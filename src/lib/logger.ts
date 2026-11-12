// Logs em JSON, uma linha por evento. Nunca registrar conteúdo de respostas nem dados pessoais.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Campos que nunca vão para o log, mesmo se alguém os passar por engano (US-8.2).
 * Comparação sem maiúsculas, hífen ou sublinhado: `x-forwarded-for` vira `xforwardedfor`.
 */
const SENSITIVE_KEYS = new Set([
  "email",
  "name",
  "ip",
  "xforwardedfor",
  "xrealip",
  "cookie",
  "setcookie",
  "authorization",
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "code",
  "respondentkey",
  "answers",
  "text",
  "textvalue",
  "body",
]);
export const REDACTED = "[removido]";

function minLevel(): Level {
  if (process.env.NODE_ENV === "test") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

const isSensitive = (key: string) => SENSITIVE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ""));

function serialize(value: unknown, depth = 0): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  if (depth >= 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => serialize(item, depth + 1));
  const out: Fields = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isSensitive(key) ? REDACTED : serialize(item, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, fields: Fields = {}) {
  if (rank[level] < rank[minLevel()]) return;
  const entry = { level, time: new Date().toISOString(), msg, ...(serialize(fields) as Fields) };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Fields) => write("debug", msg, fields),
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
