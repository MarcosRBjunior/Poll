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
  const DATABASE_URL = "postgresql://poll:poll@localhost:5440/poll";

  it("exige DATABASE_URL", () => {
    expect(() => parseEnv(serverEnvSchema, {})).toThrow(/DATABASE_URL: obrigatória/);
  });

  it("aceita o ambiente mínimo da F2", () => {
    expect(parseEnv(serverEnvSchema, { DATABASE_URL })).toEqual({
      NODE_ENV: "development",
      DATABASE_URL,
    });
  });

  it("recusa URL opcional malformada", () => {
    expect(() => parseEnv(serverEnvSchema, { DATABASE_URL, SENTRY_DSN: "x" })).toThrow(
      /SENTRY_DSN/,
    );
  });
});
