import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { createE2ESurvey, withDb } from "./survey-data";

async function listedSurvey() {
  const survey = await createE2ESurvey();
  const title = `Vitrine E2E ${survey.slug}`;
  await withDb((db) =>
    db.query(`UPDATE "Survey" SET "isListed" = true, title = $1 WHERE id = $2`, [title, survey.id]),
  );
  return { ...survey, title };
}

test("T01: a vitrine mostra a pesquisa aberta e leva para responder ou entrar", async ({
  page,
}) => {
  const survey = await listedSurvey();
  try {
    await page.goto("/");
    const card = page.getByRole("article", { name: survey.title });
    await expect(card).toBeVisible();
    await expect(card.getByText("4 perguntas")).toBeVisible();
    await expect(card.getByRole("link", { name: /^Ver resultados/ })).toHaveAttribute(
      "href",
      `/s/${survey.slug}/results`,
    );

    await card.getByRole("link", { name: /^Responder/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: survey.title })).toBeVisible();
    await expect(page.getByText("Responder é anônimo.")).toBeVisible();

    // Login opcional: volta para a pesquisa depois de entrar.
    await page.getByRole("link", { name: "Entrar para responder com a sua conta" }).click();
    await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fs%2F${survey.slug}$`));
  } finally {
    await survey.cleanup();
  }
});

test.describe("com sessão real do projeto de teste", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("CT-17: com login, a mesma conta não responde de novo em outro navegador", async ({
    page,
    context,
    browser,
  }) => {
    const survey = await listedSurvey();
    try {
      await loginAs(context, testSupabase.user);
      await page.goto(`/s/${survey.slug}`);
      await expect(page.getByText("Você está respondendo com a sua conta.")).toBeVisible();
      await page.getByRole("radio", { name: "React" }).check();
      await page.getByRole("checkbox", { name: "Vite" }).check();
      await page.getByRole("textbox", { name: /nome do seu projeto/ }).fill("Poll");
      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page.getByRole("heading", { name: "Obrigado!" })).toBeVisible();

      const other = await browser.newContext(); // outro navegador, mesma conta
      await loginAs(other, testSupabase.user);
      const second = await other.newPage();
      await second.goto(`/s/${survey.slug}`);
      await expect(second.getByText("Você já respondeu esta pesquisa.")).toBeVisible();
      await expect(second.getByRole("button", { name: "Salvar" })).toHaveCount(0);
      await other.close();
    } finally {
      await survey.cleanup();
    }
  });
});
