import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { createE2ESurvey, withDb } from "./survey-data";

async function respond(page: Page, slug: string, comment: string) {
  await page.goto(`/s/${slug}`);
  await page.getByRole("radio", { name: "React" }).check();
  await page.getByRole("checkbox", { name: "Vite" }).check();
  await page.getByRole("checkbox", { name: "esbuild" }).check();
  await page.getByRole("textbox", { name: /nome do seu projeto/ }).fill("Poll");
  await page.getByRole("textbox", { name: /Comentário/ }).fill(comment);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("heading", { name: "Obrigado!" })).toBeVisible();
}

test.describe("resultados públicos (T10)", () => {
  test("CT-16: sem tabela individual, download nem dado de quem respondeu", async ({ page }) => {
    const survey = await createE2ESurvey();
    try {
      await respond(page, survey.slug, "Faltam exemplos.");
      // Uma resposta com login (F7) também não pode expor a conta.
      const email = `respondente-${survey.slug}@e2e.test`;
      await withDb(async (db) => {
        const { rows } = await db.query(
          `INSERT INTO "User" (id, email) VALUES (gen_random_uuid(), $1) RETURNING id`,
          [email],
        );
        await db.query(`UPDATE "SurveyResponse" SET "userId" = $1 WHERE "surveyId" = $2`, [
          rows[0].id,
          survey.id,
        ]);
      });

      await page.getByRole("link", { name: "Ver resultados" }).click();
      await expect(page).toHaveURL(new RegExp(`/s/${survey.slug}/results$`));
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(
        "Ferramentas JavaScript (E2E)",
      );
      // A página anterior fica oculta no DOM (Activity do cacheComponents): olha só a lista.
      await expect(page.getByRole("listitem").getByText("Faltam exemplos.")).toBeVisible();
      await expect(page.getByRole("cell", { name: "React" })).toBeAttached();
      await expect(page.locator("canvas").first()).toBeVisible(); // gráfico só no navegador

      await expect(page.getByRole("link", { name: "Baixar CSV" })).toHaveCount(0);
      await expect(page.getByText("Respostas individuais")).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toContain(email);
      expect(html).not.toMatch(/respondentKey|idempotencyKey|userId/);

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
        [],
      );

      await withDb((db) => db.query(`DELETE FROM "User" WHERE email = $1`, [email]));
    } finally {
      await survey.cleanup();
    }
  });

  test("pesquisa inexistente mostra a página 404", async ({ page }) => {
    await page.goto("/s/nao-existe-mesmo/results");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });
});

test.describe("com sessão real do projeto de teste", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("CT-13 (MVP): responder → ver o resultado público → baixar o CSV como administrador", async ({
    browser,
  }) => {
    const adminContext = await browser.newContext();
    const adminId = await loginAs(adminContext, testSupabase.admin);
    const survey = await createE2ESurvey("PUBLISHED", adminId);
    try {
      // Outro navegador, sem login, responde.
      const respondent = await browser.newContext();
      const page = await respondent.newPage();
      await respond(page, survey.slug, "=cmd() vira texto no CSV");
      await page.getByRole("link", { name: "Ver resultados" }).click();
      await expect(page.getByRole("term").filter({ hasText: "Respostas" })).toBeVisible();
      await expect(page.locator("dd").first()).toHaveText("1");
      await respondent.close();

      // O administrador vê o painel completo e baixa o CSV.
      const admin = await adminContext.newPage();
      await admin.goto(`/admin/surveys/${survey.id}/results`);
      await expect(admin.getByRole("heading", { level: 1 })).toHaveText(
        "Ferramentas JavaScript (E2E)",
      );
      await expect(admin.getByRole("cell", { name: "Vite" })).toBeAttached();

      await admin.getByRole("link", { name: "Respostas individuais" }).click();
      await expect(admin.getByRole("cell", { name: "Vite; esbuild" })).toBeVisible();

      const [download] = await Promise.all([
        admin.waitForEvent("download"),
        admin.getByRole("link", { name: "Baixar CSV" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(
        new RegExp(`^pesquisa-${survey.slug}-\\d{4}-\\d{2}-\\d{2}\\.csv$`),
      );
      const bytes = await readFile((await download.path())!);
      expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const lines = bytes.toString("utf8").slice(1).trimEnd().split("\r\n");
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("Qual framework de interface você mais usa?");
      expect(lines[1]).toContain(';React;"Vite; esbuild";Poll;\'=cmd() vira texto no CSV');
    } finally {
      await adminContext.close();
      await survey.cleanup();
    }
  });
});
