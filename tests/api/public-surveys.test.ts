import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/public/surveys/[slug]/route";
import { db, resetDatabase } from "../fixtures/db";
import { createPublishedSurvey } from "../fixtures/surveys";

vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);

const get = (slug: string) =>
  GET(new Request(`http://localhost/api/v1/public/surveys/${slug}`), {
    params: Promise.resolve({ slug }),
  });

beforeEach(resetDatabase);

describe("GET /api/v1/public/surveys/{slug}", () => {
  it("devolve perguntas e opções ativas, na ordem, sem valores numéricos nem dados internos", async () => {
    const s = await createPublishedSurvey();
    await db.questionOption.update({ where: { id: s.o.react.id }, data: { value: "10" } });

    const response = await get(s.survey.slug);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      slug: s.survey.slug,
      title: s.survey.title,
      description: null,
      status: "PUBLISHED",
      questions: [
        expect.objectContaining({
          id: s.q.framework.id,
          type: "SINGLE_CHOICE",
          required: true,
          options: [
            { id: s.o.react.id, label: "React" },
            { id: s.o.vue.id, label: "Vue" },
          ],
        }),
        expect.objectContaining({ id: s.q.tools.id, minSelections: 1, maxSelections: 2 }),
        expect.objectContaining({ id: s.q.project.id, type: "SHORT_TEXT", options: [] }),
        expect.objectContaining({ id: s.q.comment.id, required: false }),
      ],
    });
    expect(Object.keys(body.questions[0]).sort()).toEqual(
      [
        "helpText",
        "id",
        "maxSelections",
        "minSelections",
        "options",
        "required",
        "title",
        "type",
      ].sort(),
    );
    expect(JSON.stringify(body)).not.toMatch(/value|ownerId|archived|position|"10"/);
  });

  it("encerrada responde 200 com status CLOSED e sem perguntas", async () => {
    const s = await createPublishedSurvey({ status: "CLOSED", closedAt: new Date() });
    expect(await (await get(s.survey.slug)).json()).toMatchObject({
      status: "CLOSED",
      questions: [],
    });
  });

  it.each([
    ["rascunho", { status: "DRAFT" as const }],
    ["excluída", { deletedAt: new Date() }],
  ])("%s responde 404", async (_, data) => {
    const s = await createPublishedSurvey(data);
    const response = await get(s.survey.slug);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
  });

  it("slug inexistente responde 404", async () => {
    expect((await get("nao-existe")).status).toBe(404);
  });
});
