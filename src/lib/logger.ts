// Logs em JSON, uma linha por evento. Nunca registrar conteúdo de respostas nem dados pessoais.

type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): Level {
  if (process.env.NODE_ENV === "test") return "error";
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serialize(value: unknown): unknown {
  if (value instanceof Error)
    return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

function write(level: Level, msg: string, fields: Fields = {}) {
  if (rank[level] < rank[minLevel()]) return;
  const entry: Fields = { level, time: new Date().toISOString(), msg };
  for (const [key, value] of Object.entries(fields)) entry[key] = serialize(value);
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
