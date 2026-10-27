import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { deleteSurvey, withDb } from "./survey-data";

test("RF-21 (3): sem login, pedir uma pesquisa leva ao login e volta ao formulário", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Pedir uma pesquisa" }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Frequests%2Fnew$/);
});

test.describe("com sessão real do projeto de teste", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("solicitar → administrador cria e publica a partir dela → solicitante vê o link", async ({
    browser,
  }) => {
    const topic = `Pedido E2E ${Date.now()}`;
    const user = await browser.newContext();
    const admin = await browser.newContext();
    try {
      await loginAs(user, testSupabase.user);
      await loginAs(admin, testSupabase.admin);

      // Solicitante (T11 → T12).
      const userPage = await user.newPage();
      await userPage.goto("/requests/new");
      await userPage.getByLabel("Tema", { exact: true }).fill(topic);
      await userPage.getByLabel("Objetivo", { exact: true }).fill("Saber o que a turma usa.");
      await userPage
        .getByLabel("Sugestões de perguntas (opcional)")
        .fill("Qual editor de código você usa?");
      await userPage.getByRole("button", { name: "Enviar solicitação" }).click();
      await expect(userPage).toHaveURL(/\/requests\?enviada=1$/);
      const mine = userPage.getByRole("article", { name: topic });
      await expect(mine.getByText("Pendente")).toBeVisible();

      // Administrador (T13 → T06 preenchido → publicar).
      const adminPage = await admin.newPage();
      await adminPage.goto("/admin/requests");
      const queued = adminPage.getByRole("article", { name: topic });
      await expect(queued.getByText("Qual editor de código você usa?")).toBeVisible();
      await queued.getByRole("link", { name: "Criar pesquisa a partir desta" }).click();
      await expect(adminPage.getByRole("textbox", { name: "Título" })).toHaveValue(topic);
      await expect(
        adminPage.getByRole("complementary", { name: "Solicitação de origem" }),
      ).toContainText("Qual editor de código você usa?");
      await adminPage.getByRole("button", { name: "+ Adicionar pergunta" }).click();
      const question = adminPage.getByRole("article", { name: "Pergunta 1", exact: true });
      await question
        .getByLabel("Enunciado", { exact: true })
        .fill("Qual editor de código você usa?");
      await question.getByLabel("Opção 1", { exact: true }).fill("VS Code");
      await question.getByLabel("Opção 2", { exact: true }).fill("Neovim");
      await adminPage.getByRole("button", { name: "Salvar e publicar" }).click();
      await expect(adminPage.getByText("Pesquisa publicada.")).toBeVisible();

      // RF-22 (3): concluída, o solicitante vê o link.
      await userPage.goto("/requests");
      await expect(mine.getByText("Concluída")).toBeVisible();
      await mine.getByRole("link", { name: "Abrir a pesquisa" }).click();
      await expect(userPage.getByRole("radio", { name: "VS Code" })).toBeVisible();
    } finally {
      const { rows } = await withDb((db) =>
        db.query(`DELETE FROM "SurveyRequest" WHERE topic = $1 RETURNING "surveyId"`, [topic]),
      );
      for (const { surveyId } of rows) if (surveyId) await deleteSurvey(surveyId);
      await user.close();
      await admin.close();
    }
  });
});
