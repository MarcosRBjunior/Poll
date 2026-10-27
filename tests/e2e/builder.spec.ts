import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { deleteSurvey, withDb } from "./survey-data";

const question = (page: Page, n: number) =>
  page.getByRole("article", { name: `Pergunta ${n}`, exact: true });

test.describe("construtor de pesquisas (T06)", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("cria com 3 tipos sem código, com preview ao vivo, e edita em modo restrito", async ({
    page,
    context,
    browser,
  }) => {
    await loginAs(context, testSupabase.admin);
    await page.goto("/admin");
    await page.getByRole("link", { name: "Nova pesquisa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Nova pesquisa" })).toBeVisible();
    await expect(page.getByText("Adicione a primeira pergunta.")).toBeVisible();

    // RF-05 (3): o erro aparece junto do campo.
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Título" })).toHaveAccessibleDescription(
      "Use pelo menos 3 caracteres.",
    );

    const title = `Construtor E2E ${Date.now()}`;
    await page.getByRole("textbox", { name: "Título" }).fill(title);

    // Pergunta 1: escolha única (padrão), com valor numérico nas opções.
    await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
    await question(page, 1)
      .getByLabel("Enunciado", { exact: true })
      .fill("Qual framework você usa?");
    await question(page, 1).getByLabel("Opção 1", { exact: true }).fill("React");
    await question(page, 1).getByLabel("Opção 2", { exact: true }).fill("Vue");

    // Pergunta 2: texto curto.
    await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
    await question(page, 2).getByLabel("Tipo", { exact: true }).selectOption("SHORT_TEXT");
    await question(page, 2).getByLabel("Enunciado", { exact: true }).fill("Nome do projeto");

    // Pergunta 3: múltipla escolha com limites.
    await page.getByRole("button", { name: "+ Adicionar pergunta" }).click();
    await question(page, 3).getByLabel("Tipo", { exact: true }).selectOption("MULTIPLE_CHOICE");
    await question(page, 3).getByLabel("Enunciado", { exact: true }).fill("Quais ferramentas?");
    await question(page, 3).getByLabel("Opção 1", { exact: true }).fill("Vite");
    await question(page, 3).getByLabel("Opção 2", { exact: true }).fill("Jest");
    await question(page, 3).getByRole("button", { name: "+ Adicionar opção" }).click();
    await question(page, 3).getByLabel("Opção 3", { exact: true }).fill("Bun");

    // RF-06 (3): limite incoerente impede salvar.
    await question(page, 3).getByLabel("Máximo de opções (opcional)", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(
      question(page, 3).getByText("O máximo não pode passar do número de opções."),
    ).toBeVisible();
    await question(page, 3).getByLabel("Máximo de opções (opcional)", { exact: true }).fill("2");

    // RF-05 (2): o preview usa os componentes do formulário público.
    const preview = page.locator("#builder-preview");
    await expect(preview.getByRole("heading", { name: title })).toBeVisible();
    await expect(preview.getByRole("radio", { name: "React" })).toBeVisible();
    await expect(preview.getByRole("checkbox", { name: "Bun" })).toBeVisible();
    await expect(preview.getByText("Escolha até 2 opções.")).toBeVisible();

    // RF-06 (1): reordenar atualiza o preview na hora.
    const order = async () => {
      const text = await preview.innerText();
      return text.indexOf("Quais ferramentas?") < text.indexOf("Nome do projeto");
    };
    expect(await order()).toBe(false);
    await question(page, 3).getByRole("button", { name: "Subir a pergunta 3" }).click();
    await expect.poll(order).toBe(true);

    // RF-06 (2): trocar escolha por texto pede confirmação.
    await question(page, 1).getByLabel("Tipo", { exact: true }).selectOption("LONG_TEXT");
    await expect(question(page, 1).getByRole("alert")).toContainText("descarta as 2 opções");
    await question(page, 1).getByRole("button", { name: "Cancelar" }).click();
    await expect(question(page, 1).getByLabel("Opção 1", { exact: true })).toHaveValue("React");

    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/surveys\/[^/]+\/edit$/);
    const surveyId = page.url().split("/").at(-2)!;
    try {
      await expect(page.getByRole("heading", { level: 1, name: "Editar pesquisa" })).toBeVisible();
      await expect(question(page, 2).getByLabel("Enunciado", { exact: true })).toHaveValue(
        "Quais ferramentas?",
      );

      // Com respostas: modo restrito (RN-11).
      await withDb(async (db) => {
        await db.query(
          `UPDATE "Survey" SET status = 'PUBLISHED', "publishedAt" = now() WHERE id = $1`,
          [surveyId],
        );
        await db.query(
          `INSERT INTO "SurveyResponse" (id, "surveyId", "idempotencyKey") VALUES ($1, $2, gen_random_uuid())`,
          [`e2e-${surveyId}`, surveyId],
        );
      });
      await page.reload();
      await expect(page.getByRole("note")).toContainText("Modo restrito");
      await expect(question(page, 1).getByLabel("Tipo", { exact: true })).toBeDisabled();
      await expect(
        question(page, 1).getByLabel("Valor", { exact: true }).first(),
      ).not.toBeEditable();

      // Corrigir texto pode.
      await question(page, 1)
        .getByLabel("Enunciado", { exact: true })
        .fill("Qual framework você mais usa?");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(page.getByText("Alterações salvas.")).toBeVisible();

      // RF-09 (4): outra aba com versão velha recebe o diálogo de recarregar.
      const other = await browser.newContext();
      await loginAs(other, testSupabase.admin);
      const stale = await other.newPage();
      await stale.goto(`/admin/surveys/${surveyId}/edit`);
      await question(page, 2)
        .getByLabel("Enunciado", { exact: true })
        .fill("Quais ferramentas você usa?");
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(page.getByText("Alterações salvas.")).toBeVisible();

      await question(stale, 3).getByLabel("Enunciado", { exact: true }).fill("Nome do seu projeto");
      await stale.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(stale.getByRole("alertdialog", { name: "Esta pesquisa mudou" })).toBeVisible();
      await other.close();
    } finally {
      await deleteSurvey(surveyId);
    }
  });
});
