import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// .env (banco) e .env.test.local (projeto Supabase de teste). No CI vêm das variáveis do job.
config({ path: [".env.test.local", ".env"], quiet: true });

// O servidor do E2E usa o projeto Supabase de teste, quando configurado.
const supabaseTestEnv: Record<string, string> = process.env.TEST_SUPABASE_URL
  ? {
      NEXT_PUBLIC_SUPABASE_URL: process.env.TEST_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.TEST_SUPABASE_PUBLISHABLE_KEY ?? "",
      ADMIN_EMAIL: process.env.TEST_ADMIN_EMAIL ?? "",
    }
  : {};

const port = Number(process.env.PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

// E2E_PROD=1 (npm run test:e2e:prod) roda local contra o build de produção, como no CI.
// O build é feito aqui para os NEXT_PUBLIC_* do projeto de teste entrarem nele.
const localProd = !process.env.CI && !!process.env.E2E_PROD;
const serverCommand = process.env.CI
  ? `npm run start -- -p ${port}`
  : localProd
    ? `rm -rf .next && npm run build && npm run start -- -p ${port}`
    : `npm run dev -- -p ${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: serverCommand,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI && !localProd,
    timeout: localProd ? 300_000 : 60_000,
    env: supabaseTestEnv,
  },
});
