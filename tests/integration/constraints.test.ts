import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createQuestion, createSurvey, db, resetDatabase } from "../fixtures/db";

// Uma prova de recusa para cada regra da migração escrita à mão (spec 6.8).

beforeEach(resetDatabase);

describe("survey_title_min (RN-01)", () => {
  it.each([
    ["espaços", "  ab  "],
    ["Tab e quebra de linha", "\t\nab\r\n"],
  ])("recusa título com menos de 3 caracteres úteis (%s)", async (_, title) => {
    await expect(createSurvey({ title })).rejects.toThrow(/survey_title_min/);
  });

  it("preserva a letra v nas pontas", async () => {
    await expect(createSurvey({ title: "vav" })).resolves.toBeDefined();
  });

  it("aceita título com 3 caracteres úteis", async () => {
    await expect(createSurvey({ title: " abc " })).resolves.toBeDefined();
  });
});

describe("question_selection_bounds (RF-06)", () => {
  it.each([
    ["mínimo negativo", { minSelections: -1 }],
    ["máximo zero", { maxSelections: 0 }],
    ["mínimo maior que o máximo", { minSelections: 3, maxSelections: 2 }],
  ])("recusa %s", async (_, bounds) => {
    await expect(createQuestion({ type: "MULTIPLE_CHOICE", ...bounds })).rejects.toThrow(
      /question_selection_bounds/,
    );
  });

  it("aceita limites coerentes", async () => {
    await expect(
      createQuestion({ type: "MULTIPLE_CHOICE", minSelections: 1, maxSelections: 3 }),
    ).resolves.toBeDefined();
  });
});

describe("question_option_label_active_uq (RN-03)", () => {
  it("recusa rótulo repetido sem diferenciar maiúsculas nem espaços nas pontas", async () => {
    const question = await createQuestion();
    await db.questionOption.create({
      data: { questionId: question.id, label: "React", position: 0 },
    });
    await expect(
      db.questionOption.create({
        data: { questionId: question.id, label: " react ", position: 1 },
      }),
    ).rejects.toThrow(/question_option_label_active_uq|Unique constraint/);
  });

  it("aceita o mesmo rótulo quando a opção anterior está arquivada", async () => {
    const question = await createQuestion();
    await db.questionOption.create({
      data: { questionId: question.id, label: "React", position: 0, archivedAt: new Date() },
    });
    await expect(
      db.questionOption.create({ data: { questionId: question.id, label: "React", position: 0 } }),
    ).resolves.toBeDefined();
  });

  it("aceita o mesmo rótulo em outra pergunta", async () => {
    const [a, b] = [await createQuestion(), await createQuestion()];
    await db.questionOption.create({ data: { questionId: a.id, label: "React", position: 0 } });
    await expect(
      db.questionOption.create({ data: { questionId: b.id, label: "React", position: 0 } }),
    ).resolves.toBeDefined();
  });
});

describe("answer_text_not_blank (RN-07)", () => {
  async function createAnswer(textValue: string | null) {
    const question = await createQuestion({ type: "LONG_TEXT", required: false });
    const response = await db.surveyResponse.create({
      data: { surveyId: question.surveyId, idempotencyKey: randomUUID() },
    });
    return db.answer.create({
      data: { responseId: response.id, questionId: question.id, textValue },
    });
  }

  it.each([
    ["espaços", "    "],
    ["Tab e quebra de linha", " \t\n\r\n "],
  ])("recusa texto só com espaço em branco (%s)", async (_, text) => {
    await expect(createAnswer(text)).rejects.toThrow(/answer_text_not_blank/);
  });

  it("aceita texto com conteúdo e texto nulo", async () => {
    await expect(createAnswer(" ok ")).resolves.toBeDefined();
    await expect(createAnswer(null)).resolves.toBeDefined();
  });
});
