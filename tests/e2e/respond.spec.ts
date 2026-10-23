import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createE2ESurvey } from "./survey-data";

test.describe("responder pesquisa", () => {
  test("CT-14: responde a 360 px, recarrega no meio e encontra as respostas", async ({ page }) => {
    const survey = await createE2ESurvey();
    try {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(`/s/${survey.slug}`);
      await expect(
        page.getByRole("heading", { level: 1, name: "Ferramentas JavaScript (E2E)" }),
      ).toBeVisible();

      // RF-01 (4): sem rolagem horizontal a 360 px.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      const { violations } = await new AxeBuilder({ page }).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual(
        [],
      );

      await page.getByRole("radio", { name: "Vue" }).check();
      await page.getByRole("checkbox", { name: "Vite" }).check();
      await page.getByRole("checkbox", { name: "esbuild" }).check();
      await page.getByRole("textbox", { name: /nome do seu projeto/ }).fill("Poll");
      await page.getByRole("textbox", { name: /Comentário/ }).fill("Faltam exemplos.");
      await page.waitForTimeout(800); // o rascunho é copiado 500 ms depois da última mudança

      await page.reload();
      await expect(page.getByRole("radio", { name: "Vue" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "Vite" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "esbuild" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "webpack" })).not.toBeChecked();
      await expect(page.getByRole("textbox", { name: /nome do seu projeto/ })).toHaveValue("Poll");
      await expect(page.getByText("16/2.000")).toBeVisible();

      await page.getByRole("button", { name: "Salvar" }).click();
      await expect(page).toHaveURL(new RegExp(`/s/${survey.slug}/thanks$`));
      await expect(page.getByRole("heading", { name: "Obrigado!" })).toBeVisible();

      // US-2.4 (3): o rascunho some depois do envio.
      expect(
        await page.evaluate((key) => localStorage.getItem(key), `poll:draft:${survey.slug}`),
      ).toBeNull();

      // RN-14: o mesmo navegador não responde de novo.
      await page.goto(`/s/${survey.slug}`);
      await expect(page.getByText("Você já respondeu esta pesquisa.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
    } finally {
      await survey.cleanup();
    }
  });

  test("RF-03 (2): obrigatória vazia bloqueia o envio e destaca o campo", async ({ page }) => {
    const survey = await createE2ESurvey();
    try {
      await page.goto(`/s/${survey.slug}`);
      await page.getByRole("radio", { name: "React" }).check();
      await page.getByRole("button", { name: "Salvar" }).click();

      const tools = page.getByRole("group", { name: /ferramentas de build/ });
      await expect(tools).toHaveAttribute("aria-invalid", "true");
      await expect(tools.getByText("Responda esta pergunta.")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: "Vite" })).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/s/${survey.slug}$`));
    } finally {
      await survey.cleanup();
    }
  });

  test("RF-01 (2): encerrada mostra o aviso sem formulário", async ({ page }) => {
    const survey = await createE2ESurvey("CLOSED");
    try {
      await page.goto(`/s/${survey.slug}`);
      await expect(page.getByText("Esta pesquisa não aceita mais respostas.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Salvar" })).toHaveCount(0);
    } finally {
      await survey.cleanup();
    }
  });

  test("RF-01 (3): slug inexistente mostra a página 404", async ({ page }) => {
    await page.goto("/s/pesquisa-que-nao-existe");
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("T14: a privacidade explica o que é coletado e tem contato", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1, name: "Privacidade" })).toBeVisible();
    await expect(page.getByRole("link", { name: /abra uma issue/ })).toHaveAttribute(
      "href",
      "https://github.com/MarcosRBjunior/Poll/issues",
    );
  });
});
