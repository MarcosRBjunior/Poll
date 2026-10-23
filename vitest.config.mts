import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

// Testes de integração usam Postgres real (banco poll_test do docker compose; serviço no CI).
// Credenciais do projeto Supabase de teste: .env.test.local (local) ou secrets (CI).
// Sem elas, só os testes com sessão real ficam de fora (no CI eles falham, não pulam).
const localFile = ".env.test.local";
const testEnv = {
  ...pick(existsSync(localFile) ? parse(readFileSync(localFile)) : {}, "TEST_"),
  ...pick(process.env, "TEST_"),
};
const testDatabaseUrl =
  testEnv.TEST_DATABASE_URL ?? "postgresql://poll:poll@localhost:5440/poll_test";

function pick(source: Record<string, string | undefined>, prefix: string) {
  return Object.fromEntries(
    Object.entries(source).filter(([key, value]) => key.startsWith(prefix) && value),
  ) as Record<string, string>;
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/{unit,integration,api}/**/*.test.ts", "tests/components/**/*.test.tsx"],
    env: {
      ...testEnv,
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: testDatabaseUrl,
      // Sem projeto de teste, aponta para um endereço que não responde.
      NEXT_PUBLIC_SUPABASE_URL: testEnv.TEST_SUPABASE_URL ?? "http://127.0.0.1:1",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        testEnv.TEST_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_test",
      ADMIN_EMAIL: testEnv.TEST_ADMIN_EMAIL ?? "admin@example.com",
      RESPONDENT_KEY_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
    },
    globalSetup: ["tests/setup/global-db.ts"],
    // Os arquivos compartilham o mesmo banco e limpam as tabelas entre testes.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/features/*/service.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 80 },
    },
  },
});
