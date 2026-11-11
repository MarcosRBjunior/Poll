import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { createE2ESurvey, withDb } from "./survey-data";

test.describe("grupos (T08, RF-16)", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("cria, renomeia, liga uma pesquisa pelo construtor e exclui sem apagar a pesquisa", async ({
    page,
    context,
  }) => {
    const adminId = await loginAs(context, testSupabase.admin);
    const survey = await createE2ESurvey("PUBLISHED", adminId);
    const name = `Grupo E2E ${survey.slug}`;
    const renamed = `${name} (renomeado)`;
    try {
      await page.goto("/admin");
      await page
        .getByRole("navigation", { name: "Principal" })
        .getByRole("link", { name: "Grupos" })
        .click();
      await expect(page.getByRole("heading", { level: 1, name: "Grupos" })).toBeVisible();

      // Criar.
      await page.getByRole("button", { name: "Novo grupo" }).click();
      const dialog = page.getByRole("dialog", { name: "Novo grupo" });
      await dialog.getByLabel("Nome").fill(name);
      await dialog.getByLabel("Descrição (opcional)").fill("Criado pelo teste.");
      await dialog.getByRole("button", { name: "Criar grupo" }).click();
      await expect(page.getByRole("status")).toHaveText("Grupo criado.");
      const item = page.getByRole("listitem", { name });
      await expect(item).toContainText("0 pesquisas");

      // Nome repetido aparece no campo.
      await page.getByRole("button", { name: "Novo grupo" }).click();
      await page.getByRole("dialog", { name: "Novo grupo" }).getByLabel("Nome").fill(name);
      await page.getByRole("button", { name: "Criar grupo" }).click();
      await expect(page.getByText("Já existe um grupo com esse nome.")).toBeVisible();
      await page.getByRole("button", { name: "Cancelar" }).click();

      // Renomear.
      await item.getByRole("button", { name: "Renomear" }).click();
      const edit = page.getByRole("dialog", { name: "Renomear grupo" });
      await edit.getByLabel("Nome").fill(renamed);
      await edit.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByRole("status")).toHaveText("Grupo atualizado.");
      const renamedItem = page.getByRole("listitem", { name: renamed });
      await expect(renamedItem).toBeVisible();

      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
        [],
      );

      // Ligar a pesquisa ao grupo pelo construtor (critério 1).
      await page.goto(`/admin/surveys/${survey.id}/edit`);
      // Escolher antes da hidratação se perde: repete até o construtor marcar a alteração.
      await expect(async () => {
        await page.getByLabel("Grupo (opcional)").selectOption({ label: renamed });
        await expect(page.getByText("Há alterações não salvas.")).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await expect(page.getByText("Alterações salvas.")).toBeVisible();
      await page.goto("/admin/groups");
      await expect(renamedItem).toContainText("1 pesquisa");

      // Excluir avisa que a pesquisa fica sem grupo (critério 2).
      await renamedItem.getByRole("button", { name: "Excluir" }).click();
      const confirm = page.getByRole("alertdialog");
      await expect(confirm).toContainText(
        "1 pesquisa(s) dele continuam existindo, só que sem grupo",
      );
      await confirm.getByRole("button", { name: "Excluir" }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Grupo excluído. As pesquisas dele ficaram sem grupo.",
      );
      await expect(renamedItem).toHaveCount(0);

      const row = await withDb(async (db) =>
        db.query(`SELECT "groupId", "deletedAt" FROM "Survey" WHERE id = $1`, [survey.id]),
      );
      expect(row.rows[0]).toEqual({ groupId: null, deletedAt: null });
    } finally {
      await withDb((db) => db.query(`DELETE FROM "SurveyGroup" WHERE name LIKE $1`, [`${name}%`]));
      await survey.cleanup();
    }
  });
});
