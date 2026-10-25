import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { createE2ESurvey, withDb } from "./survey-data";

test.describe("gerenciamento de pesquisas (T05)", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("filtra, encerra, reabre, copia o link e exclui com o número de respostas", async ({
    page,
    context,
  }) => {
    const adminId = await loginAs(context, testSupabase.admin);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const survey = await createE2ESurvey("PUBLISHED", adminId);
    const title = `Gerenciar E2E ${survey.slug}`;
    await withDb(async (db) => {
      await db.query(`UPDATE "Survey" SET title = $1 WHERE id = $2`, [title, survey.id]);
      await db.query(
        `INSERT INTO "SurveyResponse" (id, "surveyId", "idempotencyKey") VALUES ($1, $2, gen_random_uuid())`,
        [`e2e-r-${survey.id}`, survey.id],
      );
    });
    try {
      await page.goto("/admin");
      await page
        .getByRole("navigation", { name: "Principal" })
        .getByRole("link", { name: "Pesquisas" })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Pesquisas" })).toBeVisible();

      await page.getByLabel("Buscar pelo título").fill(survey.slug);
      const card = page.getByRole("article", { name: title });
      await expect(card).toBeVisible();
      await expect(card.getByText("Publicada")).toBeVisible();
      await expect(card.getByText("Respostas:").locator("..")).toContainText("1");

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
        [],
      );

      // Filtros combinados: publicada + título encontra; rascunho + título não.
      await page.getByLabel("Status").selectOption("DRAFT");
      await expect(page.getByText("Nenhuma pesquisa com esses filtros.")).toBeVisible();
      await page.getByLabel("Status").selectOption("PUBLISHED");
      await expect(card).toBeVisible();

      await card.getByRole("button", { name: "Copiar link" }).click();
      await expect(card.getByText("Link copiado.")).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
        new RegExp(`/s/${survey.slug}$`),
      );

      await page.getByLabel("Status").selectOption("");
      await card.getByRole("button", { name: "Encerrar" }).click();
      await expect(card.getByText("Encerrada")).toBeVisible();
      await expect(card.getByRole("button", { name: "Reabrir" })).toBeVisible();
      await card.getByRole("button", { name: "Reabrir" }).click();
      await expect(card.getByRole("button", { name: "Encerrar" })).toBeVisible();

      // RF-10 (1): o diálogo mostra quantas respostas serão perdidas.
      await card.getByRole("button", { name: "Excluir" }).click();
      const dialog = page.getByRole("alertdialog", { name: `Excluir “${title}”?` });
      await expect(dialog).toContainText("As 1 resposta(s) deixarão de aparecer");
      await dialog.getByRole("button", { name: "Excluir" }).click();
      await expect(page.getByText(`“${title}” foi excluída.`)).toBeVisible();
      await expect(card).toHaveCount(0);

      // RF-10 (2): o link público passa a 404.
      await page.goto(`/s/${survey.slug}`);
      await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    } finally {
      await survey.cleanup();
    }
  });

  test("construtor: publicar lista o que falta e, depois de corrigir, mostra o link", async ({
    page,
    context,
  }) => {
    await loginAs(context, testSupabase.admin);
    await page.goto("/admin/surveys/new");
    const title = `Publicar E2E ${Date.now()}`;
    await page.getByRole("textbox", { name: "Título" }).fill(title);
    await page.getByRole("button", { name: "Salvar e publicar" }).click();

    // RF-11 (1): sem perguntas não publica; o rascunho fica salvo.
    await expect(page.getByText("A pesquisa ainda não pode ser publicada.")).toBeVisible();
    await expect(page.getByText("Adicione pelo menos uma pergunta.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/surveys\/[^/]+\/edit$/);
    const surveyId = page.url().split("/").at(-2)!;
    try {
      await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
      const question = page.getByRole("article", { name: "Pergunta 1", exact: true });
      await question.getByLabel("Enunciado", { exact: true }).fill("Qual framework?");
      await question.getByLabel("Opção 1", { exact: true }).fill("React");
      await question.getByLabel("Opção 2", { exact: true }).fill("Vue");
      await page.getByRole("button", { name: "Salvar e publicar" }).click();

      // RF-11 (2): publicada, o link aparece com botão de copiar.
      await expect(page.getByText("Pesquisa publicada.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Copiar link" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Salvar e publicar" })).toHaveCount(0);
      await page.getByRole("link", { name: "Abrir a pesquisa" }).click();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByRole("radio", { name: "React" })).toBeVisible();
    } finally {
      await withDb((db) => db.query(`DELETE FROM "Survey" WHERE id = $1`, [surveyId]));
    }
  });
});
