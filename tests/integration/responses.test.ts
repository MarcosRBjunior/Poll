import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { insertResponse } from "@/features/responses/repository";
import { getSurveyForRespondent, submitResponse } from "@/features/responses/service";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db, resetDatabase } from "../fixtures/db";
import { createPublishedSurvey, validBody } from "../fixtures/surveys";

beforeEach(resetDatabase);

describe("CT-01: gravação atômica (RF-04)", () => {
  it("envio válido grava a resposta inteira", async () => {
    const s = await createPublishedSurvey();
    const result = await submitResponse({
      slug: s.survey.slug,
      body: validBody(s),
      respondentToken: randomUUID(),
      ip: "198.51.100.1",
    });
    expect(result.created).toBe(true);
    expect(await db.answer.count({ where: { responseId: result.id } })).toBe(4);
    expect(await db.answerSelection.count()).toBe(3);
  });

  it("falha no meio da gravação não deixa resposta, respostas nem seleções", async () => {
    const s = await createPublishedSurvey();
    // A segunda resposta aponta para uma opção inexistente: a FK falha depois da primeira.
    await expect(
      insertResponse({
        surveyId: s.survey.id,
        respondentKey: "a".repeat(64),
        idempotencyKey: randomUUID(),
        answers: [
          { questionId: s.q.project.id, text: "Poll" },
          { questionId: s.q.framework.id, optionIds: ["opcao-que-nao-existe"] },
        ],
      }),
    ).rejects.toThrow();
    expect(await db.surveyResponse.count()).toBe(0);
    expect(await db.answer.count()).toBe(0);
    expect(await db.answerSelection.count()).toBe(0);
  });
});

describe("getSurveyForRespondent", () => {
  it("avisa quando este cookie já respondeu", async () => {
    const s = await createPublishedSurvey();
    const token = randomUUID();
    expect((await getSurveyForRespondent(s.survey.slug, token)).alreadyResponded).toBe(false);
    await submitResponse({
      slug: s.survey.slug,
      body: validBody(s),
      respondentToken: token,
      ip: "x",
    });
    expect((await getSurveyForRespondent(s.survey.slug, token)).alreadyResponded).toBe(true);
    expect((await getSurveyForRespondent(s.survey.slug, randomUUID())).alreadyResponded).toBe(
      false,
    );
  });
});

describe("enforceRateLimit", () => {
  const rule = { limit: 2, windowMs: 60_000 };
  const t = (seconds: number) => new Date(Date.UTC(2026, 9, 23, 12, 0, seconds));

  it("conta por janela, recusa acima do limite e zera na janela seguinte", async () => {
    await enforceRateLimit("k", rule, t(1));
    await enforceRateLimit("k", rule, t(2));
    await expect(enforceRateLimit("k", rule, t(45))).rejects.toMatchObject({
      code: "RATE_LIMITED",
      meta: { retryAfter: 15 },
    });
    await expect(enforceRateLimit("k", rule, t(61))).resolves.toBeUndefined();
    await expect(enforceRateLimit("outra", rule, t(45))).resolves.toBeUndefined();
  });

  it("apaga janelas com mais de um dia", async () => {
    await db.rateLimitBucket.create({
      data: { key: "velha", windowStart: new Date(Date.UTC(2026, 9, 21)), count: 3 },
    });
    await enforceRateLimit("nova", rule, t(1));
    expect((await db.rateLimitBucket.findMany()).map((b) => b.key)).toEqual(["nova"]);
  });
});
