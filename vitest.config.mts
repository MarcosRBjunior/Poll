import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Testes de integração usam Postgres real (banco poll_test do docker compose; serviço no CI).
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://poll:poll@localhost:5440/poll_test";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/{unit,integration,api}/**/*.test.ts"],
    env: { DATABASE_URL: testDatabaseUrl, DIRECT_URL: testDatabaseUrl },
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
