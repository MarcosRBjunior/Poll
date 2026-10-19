import { z } from "zod";

// Só entram aqui as variáveis que a fase em curso usa. Cada fase acrescenta as suas:
// banco na F2, Supabase e ADMIN_EMAIL na F3, RESPONDENT_KEY_SECRET na F4 (spec, US-0.1).
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SENTRY_DSN: z.url().optional(),
  RATE_LIMIT_REDIS_URL: z.url().optional(),
});

export type ServerEnv = z.output<typeof serverEnvSchema>;

type EnvSource = Record<string, string | undefined>;

export class EnvError extends Error {
  override readonly name = "EnvError";
}

/** Valida `source` contra `schema`. Variável vazia conta como ausente. */
export function parseEnv<S extends z.ZodType>(schema: S, source: EnvSource): z.output<S> {
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const lines = result.error.issues.map((issue) => {
    const name = issue.path.join(".");
    const missing = cleaned[name] === undefined;
    return `- ${name}: ${missing ? "obrigatória e não definida" : issue.message}`;
  });
  throw new EnvError(`Variáveis de ambiente inválidas:\n${lines.join("\n")}`);
}

let cached: ServerEnv | undefined;

export function getEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env);
  return cached;
}
