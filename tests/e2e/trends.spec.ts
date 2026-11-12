import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hasTestSupabase, testSupabase } from "../fixtures/supabase-test-project";
import { loginAs } from "./session";
import { createE2ESurvey, withDb } from "./survey-data";

const DAY = 24 * 60 * 60 * 1000;

/** Uma resposta à pergunta de framework, `daysAgo` dias atrás. */
async function respond(surveyId: string, label: string, daysAgo: number) {
  await withDb(async (db) => {
    const { rows } = await db.query<{ questionId: string; optionId: string }>(
      `SELECT q.id AS "questionId", o.id AS "optionId"
       FROM "Question" q JOIN "QuestionOption" o ON o."questionId" = q.id
       WHERE q."surveyId" = $1 AND q.type = 'SINGLE_CHOICE' AND o.label = $2`,
      [surveyId, label],
    );
    const { questionId, optionId } = rows[0]!;
    const responseId = `e2e-r-${randomUUID()}`;
    const answerId = `e2e-a-${randomUUID()}`;
    await db.query(
      `INSERT INTO "SurveyResponse" (id, "surveyId", "idempotencyKey", "submittedAt")
       VALUES ($1, $2, gen_random_uuid(), $3)`,
      [responseId, surveyId, new Date(Date.now() - daysAgo * DAY)],
    );
    await db.query(`INSERT INTO "Answer" (id, "responseId", "questionId") VALUES ($1, $2, $3)`, [
      answerId,
      responseId,
      questionId,
    ]);
    await db.query(`INSERT INTO "AnswerSelection" ("answerId", "optionId") VALUES ($1, $2)`, [
      answerId,
      optionId,
    ]);
  });
}

test.describe("painel de tendências (T09, RF-17)", () => {
  test.skip(!hasTestSupabase, "sem credenciais do projeto Supabase de teste");

  test("filtra por grupo, mostra as métricas e o estado vazio ao mudar o período", async ({
    page,
    context,
  }) => {
    const adminId = await loginAs(context, testSupabase.admin);
    const first = await createE2ESurvey("PUBLISHED", adminId);
    const second = await createE2ESurvey("CLOSED", adminId);
    const groupId = `e2e-g-${randomUUID()}`;
    const groupName = `Tendências E2E ${first.slug}`;
    await withDb(async (db) => {
      await db.query(
        `INSERT INTO "SurveyGroup" (id, "ownerId", name, "updatedAt") VALUES ($1, $2, $3, now())`,
        [groupId, adminId, groupName],
      );
      await db.query(`UPDATE "Survey" SET "groupId" = $1 WHERE id IN ($2, $3)`, [
        groupId,
        first.id,
        second.id,
      ]);
    });
    await respond(first.id, "React", 1);
    await respond(first.id, "React", 1);
    await respond(first.id, "Vue", 15);
    await respond(second.id, "Svelte", 1);

    try {
      await page.goto("/admin");
      await expect(
        page.getByRole("heading", { level: 1, name: "Painel de tendências" }),
      ).toBeVisible();

      const stat = (label: string) => page.locator("dl > div").filter({ hasText: label });
      // Os números chegam pela API depois da hidratação: só então o seletor reage.
      await expect(stat("Respostas no período")).toBeVisible();
      await page
        .getByRole("combobox", { name: "Grupo", exact: true })
        .selectOption({ label: groupName });
      await expect(stat("Respostas no período")).toContainText("4");
      await expect(stat("Pesquisas com respostas")).toContainText("2");
      await expect(stat("Semana mais movimentada")).toContainText("3 respostas");

      // RF-17 (3): cada métrica explica o cálculo.
      for (const name of ["Participação", "Opções mais escolhidas", "Evolução de uma opção"]) {
        await expect(
          page.getByRole("region", { name }).getByText("Como é calculado:"),
        ).toBeVisible();
      }

      // Ranking da primeira pesquisa: React 2 de 3 (66,7%), Vue 1 (33,3%), Svelte 0.
      const ranking = page.getByRole("region", { name: "Opções mais escolhidas" });
      await expect(ranking.getByRole("listitem")).toHaveCount(2);
      const firstRanking = ranking.getByRole("listitem").first();
      await firstRanking.getByRole("button", { name: /Ver tabela/ }).click();
      await expect(firstRanking.getByRole("row", { name: /React/ })).toContainText("66,7%");
      await expect(firstRanking.getByRole("row", { name: /Vue/ })).toContainText("33,3%");

      // Evolução: trocar a opção acompanhada.
      const evolution = page.getByRole("region", { name: "Evolução de uma opção" });
      await evolution.getByLabel("Opção acompanhada").selectOption({ label: "Vue" });
      await evolution.getByRole("button", { name: /Ver tabela/ }).click();
      await expect(evolution.getByRole("caption")).toContainText("Vue");

      const { violations } = await new AxeBuilder({ page }).analyze();
      const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious).toEqual([]);

      // RF-17 (1) e (2): mudar o período atualiza todos os blocos; sem respostas, estado vazio.
      const filters = page.getByRole("form", { name: "Filtros do painel" });
      await filters.getByLabel("De", { exact: true }).fill("2020-01-01");
      await filters.getByLabel("Até", { exact: true }).fill("2020-01-31");
      await expect(page.getByText("Sem respostas neste período")).toBeVisible();
      await expect(page.getByRole("region", { name: "Participação" })).toHaveCount(0);
    } finally {
      await first.cleanup();
      await second.cleanup();
      await withDb((db) => db.query(`DELETE FROM "SurveyGroup" WHERE id = $1`, [groupId]));
    }
  });
});
