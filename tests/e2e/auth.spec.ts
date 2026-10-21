import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";
import { Client } from "pg";
import { hasTestSupabase, signInCookies, testSupabase } from "../fixtures/supabase-test-project";

test("CT-15: /admin sem sessão redireciona para /login guardando a origem", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Entrar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com GitHub" })).toBeVisible();

  const { violations } = await new AxeBuilder({ page }).analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious).toEqual([]);
});

test("/login valida o e-mail antes de chamar o Supabase", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("não é e-mail");
  await page.getByRole("button", { name: "Receber link por e-mail" }).click();
  await expect(page.getByText("Informe um e-mail válido.")).toBeVisible();
});

test.describe("com sessão real do projeto de teste", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  // O callback cria o User no login de verdade; aqui o login é por senha, então o
  // teste espelha o User direto no banco, com o mesmo papel que o callback daria.
  async function loginAs(context: BrowserContext, account: { email?: string; password?: string }) {
    const session = await signInCookies(account);
    const role = session.email === testSupabase.admin.email?.toLowerCase() ? "ADMIN" : "USER";
    const db = new Client({ connectionString: process.env.DATABASE_URL });
    await db.connect();
    await db.query(
      `INSERT INTO "User" (id, email, role) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = $2, role = $3`,
      [session.userId, session.email, role],
    );
    await db.end();
    await context.addCookies(
      session.cookies.map((c) => ({ ...c, domain: "localhost", path: "/", sameSite: "Lax" })),
    );
  }

  test("CT-19: usuário comum recebe a página 404 em /admin", async ({ page, context }) => {
    await loginAs(context, testSupabase.user);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByText("Administração")).toHaveCount(0);
  });

  test("administrador entra em /admin e, ao sair, a área volta a ser protegida", async ({
    page,
    context,
  }) => {
    await loginAs(context, testSupabase.admin);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Administração" })).toBeVisible();

    await page.getByRole("button", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  });
});
