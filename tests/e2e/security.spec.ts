import { expect, test, type Page } from "@playwright/test";
import { createE2ESurvey } from "./survey-data";

// US-8.1, spec 10.2: cabeçalhos de segurança, CSP sem bloquear o app e XSS por comentário.

/** Junta violações de CSP e erros de script da página. */
function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy|Refused to/i.test(msg.text())) {
      problems.push(msg.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

test("cabeçalhos de segurança em páginas e na API", async ({ request }) => {
  for (const path of ["/", "/login", "/api/health"]) {
    const response = await request.get(path);
    const headers = response.headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["x-powered-by"], path).toBeUndefined();
    const csp = headers["content-security-policy"] ?? "";
    for (const directive of [
      "default-src 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ]) {
      expect(csp, `${path}: ${directive}`).toContain(directive);
    }
  }
});

test("XSS: comentário com <script> aparece como texto nos resultados públicos, sem violar a CSP", async ({
  page,
}) => {
  const survey = await createE2ESurvey();
  const problems = watchProblems(page);
  const attack = `<script>window.__xss = 1</script><img src=x onerror="window.__xss = 2">`;
  try {
    await page.goto("/");
    await page.goto(`/s/${survey.slug}`);
    await page.getByRole("radio", { name: "React" }).check();
    await page.getByRole("checkbox", { name: "Vite" }).check();
    await page.getByRole("textbox", { name: /nome do seu projeto/ }).fill("Poll");
    await page.getByRole("textbox", { name: /Comentário/ }).fill(attack);
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page).toHaveURL(new RegExp(`/s/${survey.slug}/thanks$`));

    await page.goto(`/s/${survey.slug}/results`);
    await expect(page.getByText(attack, { exact: true })).toBeVisible();
    await expect(page.locator("main img[src='x']")).toHaveCount(0);
    expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
    // Os gráficos (Chart.js) carregam com a CSP ativa.
    await expect(page.locator("canvas").first()).toBeVisible();
    expect(problems).toEqual([]);
  } finally {
    await survey.cleanup();
  }
});
