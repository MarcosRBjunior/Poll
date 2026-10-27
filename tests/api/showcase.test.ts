import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/public/surveys/route";
import { createQuestion, createSurvey, db, resetDatabase } from "../fixtures/db";

const list = (query = "") =>
  GET(new Request(`http://localhost/api/v1/public/surveys${query}`), undefined);

beforeEach(resetDatabase);

describe("GET /api/v1/public/surveys (RF-20)", () => {
  it("só publicadas e marcadas para a vitrine, da publicação mais recente para a mais antiga", async () => {
    const older = await createSurvey({
      title: "Mais antiga",
      status: "PUBLISHED",
      isListed: true,
      publishedAt: new Date("2026-10-01T00:00:00Z"),
      description: "Descrição",
    });
    await createQuestion({ surveyId: older.id });
    await createQuestion({ surveyId: older.id, position: 1 });
    await createQuestion({ surveyId: older.id, position: 2, archivedAt: new Date() });
    await createSurvey({
      title: "Mais nova",
      status: "PUBLISHED",
      isListed: true,
      publishedAt: new Date("2026-10-20T00:00:00Z"),
    });
    // RF-20 (2): encerradas, rascunhos, fora da vitrine e excluídas nunca aparecem.
    await createSurvey({
      title: "Encerrada",
      status: "CLOSED",
      isListed: true,
      publishedAt: new Date(),
    });
    await createSurvey({ title: "Rascunho", status: "DRAFT", isListed: true });
    await createSurvey({ title: "Fora da vitrine", status: "PUBLISHED", publishedAt: new Date() });
    await createSurvey({
      title: "Excluída",
      status: "PUBLISHED",
      isListed: true,
      publishedAt: new Date(),
      deletedAt: new Date(),
    });

    const response = await list();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ page: 1, pageSize: 12, total: 2 });
    expect(body.data).toEqual([
      { slug: expect.any(String), title: "Mais nova", description: null, questionCount: 0 },
      { slug: older.slug, title: "Mais antiga", description: "Descrição", questionCount: 2 },
    ]);
  });

  it("pagina e não expõe ids nem dados do dono", async () => {
    for (let i = 0; i < 3; i++) {
      await createSurvey({ status: "PUBLISHED", isListed: true, publishedAt: new Date() });
    }
    const body = await (await list("?page=2&pageSize=2")).json();
    expect(body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(body.data).toHaveLength(1);
    expect(Object.keys(body.data[0]).sort()).toEqual([
      "description",
      "questionCount",
      "slug",
      "title",
    ]);
    expect(await db.survey.count()).toBe(3);
  });
});
