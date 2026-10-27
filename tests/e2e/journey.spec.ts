import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { deleteSurvey } from "./survey-data";

test.describe("com sessão real do projeto de teste", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("CT-13 (completo): criar → publicar → responder em outro navegador → resultado → CSV", async ({
    browser,
  }) => {
    const admin = await browser.newContext();
    await loginAs(admin, testSupabase.admin);
    const page = await admin.newPage();
    const title = `Jornada E2E ${Date.now()}`;
    let surveyId: string | undefined;
    try {
      // Criar só pelo construtor e publicar.
      await page.goto("/admin/surveys/new");
      await page.getByRole("textbox", { name: "Título" }).fill(title);
      await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
      const q1 = page.getByRole("article", { name: "Pergunta 1", exact: true });
      await q1.getByLabel("Enunciado", { exact: true }).fill("Qual runtime você usa?");
      await q1.getByLabel("Opção 1", { exact: true }).fill("Node.js");
      await q1.getByLabel("Opção 2", { exact: true }).fill("Bun");
      await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
      const q2 = page.getByRole("article", { name: "Pergunta 2", exact: true });
      await q2.getByLabel("Tipo", { exact: true }).selectOption("LONG_TEXT");
      await q2.getByLabel("Enunciado", { exact: true }).fill("Comentário");
      await page.getByRole("button", { name: "Salvar e publicar" }).click();
      await expect(page.getByText("Pesquisa publicada.")).toBeVisible();
      surveyId = page.url().split("/").at(-2);
      const slug = (await page
        .getByRole("link", { name: "Abrir a pesquisa" })
        .getAttribute("href"))!;

      // Responder em outro navegador, sem login.
      const visitor = await browser.newContext();
      const answer = await visitor.newPage();
      await answer.goto(slug);
      await answer.getByRole("radio", { name: "Bun" }).check();
      await answer.getByRole("textbox", { name: /Comentário/ }).fill("Rápido demais");
      await answer.getByRole("button", { name: "Salvar" }).click();
      await answer.getByRole("link", { name: "Ver resultados" }).click();
      await expect(answer.getByRole("cell", { name: "Bun" })).toBeAttached();
      await expect(answer.getByRole("listitem").getByText("Rápido demais")).toBeVisible();
      await visitor.close();

      // O administrador vê o resultado atualizado e baixa o CSV.
      await page.goto(`/admin/surveys/${surveyId}/results`);
      await expect(page.locator("dd").first()).toHaveText("1");
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("link", { name: "Baixar CSV" }).click(),
      ]);
      const lines = (await readFile((await download.path())!))
        .toString("utf8")
        .slice(1)
        .trimEnd()
        .split("\r\n");
      expect(lines[0]).toBe("Resposta;Enviada em;Qual runtime você usa?;Comentário");
      expect(lines[1]).toMatch(/;Bun;Rápido demais$/);
    } finally {
      if (surveyId) await deleteSurvey(surveyId);
      await admin.close();
    }
  });
});
