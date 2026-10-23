import { describe, expect, it } from "vitest";
import { z } from "zod";
import { EnvError, parseEnv, serverEnvSchema } from "@/lib/env";

describe("parseEnv", () => {
  const schema = z.object({ DATABASE_URL: z.url(), OPTIONAL: z.string().optional() });

  it("devolve os valores validados", () => {
    expect(parseEnv(schema, { DATABASE_URL: "postgres://localhost/db" })).toEqual({
      DATABASE_URL: "postgres://localhost/db",
    });
  });

  it("diz qual variável obrigatória falta", () => {
    expect(() => parseEnv(schema, {})).toThrow(EnvError);
    expect(() => parseEnv(schema, {})).toThrow(/DATABASE_URL: obrigatória e não definida/);
  });

  it("trata variável vazia como ausente", () => {
    expect(() => parseEnv(schema, { DATABASE_URL: "" })).toThrow(/DATABASE_URL: obrigatória/);
  });

  it("aponta valor inválido sem chamar de ausente", () => {
    expect(() => parseEnv(schema, { DATABASE_URL: "não é url" })).toThrow(
      /DATABASE_URL: (?!obrigatória)/,
    );
  });
});

describe("serverEnvSchema", () => {
  const minimal = {
    DATABASE_URL: "postgresql://poll:poll@localhost:5440/poll",
    NEXT_PUBLIC_SUPABASE_URL: "https://exemplo.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    ADMIN_EMAIL: "admin@example.com",
  };

  it("exige DATABASE_URL", () => {
    expect(() => parseEnv(serverEnvSchema, {})).toThrow(/DATABASE_URL: obrigatória/);
  });

  it("exige as variáveis do Supabase e o ADMIN_EMAIL (F3)", () => {
    expect(() => parseEnv(serverEnvSchema, { DATABASE_URL: minimal.DATABASE_URL })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY[\s\S]*ADMIN_EMAIL/,
    );
  });

  it("aceita o ambiente mínimo da F3", () => {
    expect(parseEnv(serverEnvSchema, minimal)).toEqual({ NODE_ENV: "development", ...minimal });
  });

  it("normaliza o ADMIN_EMAIL para comparar sem diferença de caixa", () => {
    const env = parseEnv(serverEnvSchema, { ...minimal, ADMIN_EMAIL: "Admin@Example.COM" });
    expect(env.ADMIN_EMAIL).toBe("admin@example.com");
  });

  it("recusa URL opcional malformada", () => {
    expect(() => parseEnv(serverEnvSchema, { ...minimal, SENTRY_DSN: "x" })).toThrow(/SENTRY_DSN/);
  });
});
