import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { createSurvey, db } from "./db";

type Reply = { questionId: string; optionIds?: string[]; text?: string };

async function respond(surveyId: string, at: string, replies: Reply[]) {
  await db.surveyResponse.create({
    data: {
      surveyId,
      respondentKey: randomUUID().replaceAll("-", ""),
      idempotencyKey: randomUUID(),
      submittedAt: new Date(at),
      answers: {
        create: replies.map((r) => ({
          question: { connect: { id: r.questionId } },
          textValue: r.text ?? null,
          selections: { create: (r.optionIds ?? []).map((optionId) => ({ optionId })) },
        })),
      },
    },
  });
}

async function choiceQuestion(
  surveyId: string,
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE",
  title: string,
  position: number,
  labels: string[],
  archived: string[] = [],
) {
  const question = await db.question.create({ data: { surveyId, type, title, position } });
  const options: Record<string, string> = {};
  for (const [i, label] of labels.entries()) {
    const option = await db.questionOption.create({
      data: {
        questionId: question.id,
        label,
        position: i,
        archivedAt: archived.includes(label) ? new Date() : null,
      },
    });
    options[label] = option.id;
  }
  return { id: question.id, o: options };
}

/**
 * Conjunto fixo do US-7.2 (critério 2), com os números esperados calculados à mão.
 * Período do teste: 01/10 a 31/10/2026; semanas começam na segunda (28/09, 05/10, 12/10,
 * 19/10 e 26/10), no fuso America/Sao_Paulo (UTC-3).
 *
 * Grupo "JS":
 * - S1 "Bundlers de outubro" (publicada):
 *   - Q1 escolha única: Vite, Webpack e Rollup (removida);
 *   - Q2 múltipla: Jest, Vitest;
 *   - comentário em texto, que fica fora das tendências.
 *   Respostas (UTC → semana local):
 *   - r1 05/10 12h → 05/10: Vite; Jest e Vitest
 *   - r2 06/10 12h → 05/10: Webpack; Vitest
 *   - r3 07/10 12h → 05/10: Vite; sem Q2
 *   - r4 12/10 02h → domingo 11/10 23h local → 05/10: Rollup; Jest
 *   - r5 13/10 12h → 12/10: Webpack; Vitest
 *   - r6 20/10 12h → 19/10: Vite; Jest e Vitest
 *   - r7 30/09 12h → antes do período: fica de fora
 *   - r8 01/11 02h → 31/10 23h local → 26/10: Webpack; sem Q2
 *   Participação: [0, 4, 1, 1, 1] = 7.
 *   Q1 com 7 respostas: Vite 3 (42,9%), Webpack 3 (42,9%); Rollup removida não entra.
 *   Q2 com 5 respostas: Vitest 4 (80%), Jest 3 (60%). A soma passa de 100%.
 *   Evolução de Vite: 05/10 2 de 4 (50%), 12/10 0 de 1 (0%), 19/10 1 de 1 (100%),
 *   26/10 0 de 1 (0%), 28/09 sem respostas (null).
 * - S2 "Bundlers de novembro" (encerrada), Q escolha única Vite e Webpack:
 *   06/10 Vite · 20/10 Vite · 21/10 Webpack → participação [0, 1, 0, 2, 0] = 3;
 *   Vite 2 de 3 (66,7%), Webpack 1 de 3 (33,3%).
 * - S3 excluída, com uma resposta em 06/10: fica de fora.
 * - S4 rascunho no grupo, sem respostas: fica de fora.
 *
 * Fora do grupo:
 * - S5 sem grupo (publicada), uma resposta em 13/10: entra só em "todos".
 * - Pesquisa de outro administrador, uma resposta em 06/10: nunca entra.
 *
 * Grupo JS: 10 respostas, 2 pesquisas com respostas, semana mais movimentada 05/10 (5).
 */
export async function createTrendsDataset(ownerId: string) {
  const group = await db.surveyGroup.create({ data: { ownerId, name: "JS" } });
  const survey = (data: Partial<Prisma.SurveyUncheckedCreateInput>) =>
    createSurvey({ ownerId, groupId: group.id, status: "PUBLISHED", ...data });

  const s1 = await survey({
    title: "Bundlers de outubro",
    publishedAt: new Date("2026-09-01T00:00:00Z"),
  });
  const q1 = await choiceQuestion(
    s1.id,
    "SINGLE_CHOICE",
    "Bundler?",
    0,
    ["Vite", "Webpack", "Rollup"],
    ["Rollup"],
  );
  const q2 = await choiceQuestion(s1.id, "MULTIPLE_CHOICE", "Testes?", 1, ["Jest", "Vitest"]);
  const comment = await db.question.create({
    data: { surveyId: s1.id, type: "LONG_TEXT", title: "Comentário", position: 2, required: false },
  });

  const answer = (bundler: string, tests?: string[]): Reply[] => [
    { questionId: q1.id, optionIds: [q1.o[bundler]!] },
    ...(tests ? [{ questionId: q2.id, optionIds: tests.map((t) => q2.o[t]!) }] : []),
  ];
  await respond(s1.id, "2026-10-05T12:00:00Z", [
    ...answer("Vite", ["Jest", "Vitest"]),
    { questionId: comment.id, text: "Bom" },
  ]);
  await respond(s1.id, "2026-10-06T12:00:00Z", answer("Webpack", ["Vitest"]));
  await respond(s1.id, "2026-10-07T12:00:00Z", answer("Vite"));
  await respond(s1.id, "2026-10-12T02:00:00Z", answer("Rollup", ["Jest"]));
  await respond(s1.id, "2026-10-13T12:00:00Z", answer("Webpack", ["Vitest"]));
  await respond(s1.id, "2026-10-20T12:00:00Z", answer("Vite", ["Jest", "Vitest"]));
  await respond(s1.id, "2026-09-30T12:00:00Z", answer("Vite"));
  await respond(s1.id, "2026-11-01T02:00:00Z", answer("Webpack"));

  const s2 = await survey({
    title: "Bundlers de novembro",
    status: "CLOSED",
    publishedAt: new Date("2026-09-02T00:00:00Z"),
  });
  const q3 = await choiceQuestion(s2.id, "SINGLE_CHOICE", "Bundler?", 0, ["Vite", "Webpack"]);
  for (const [at, label] of [
    ["2026-10-06T15:00:00Z", "Vite"],
    ["2026-10-20T15:00:00Z", "Vite"],
    ["2026-10-21T15:00:00Z", "Webpack"],
  ] as const) {
    await respond(s2.id, at, [{ questionId: q3.id, optionIds: [q3.o[label]!] }]);
  }

  const s3 = await survey({ title: "Excluída", deletedAt: new Date() });
  const q4 = await choiceQuestion(s3.id, "SINGLE_CHOICE", "Bundler?", 0, ["Vite", "Webpack"]);
  await respond(s3.id, "2026-10-06T15:00:00Z", [{ questionId: q4.id, optionIds: [q4.o.Vite!] }]);

  await survey({ title: "Rascunho", status: "DRAFT" });

  const s5 = await createSurvey({
    ownerId,
    title: "Filmes",
    status: "PUBLISHED",
    publishedAt: new Date("2026-09-03T00:00:00Z"),
  });
  const q5 = await choiceQuestion(s5.id, "SINGLE_CHOICE", "Filme?", 0, ["A", "B"]);
  await respond(s5.id, "2026-10-13T15:00:00Z", [{ questionId: q5.id, optionIds: [q5.o.A!] }]);

  const foreign = await createSurvey({ title: "De outro dono", status: "PUBLISHED" });
  const q6 = await choiceQuestion(foreign.id, "SINGLE_CHOICE", "Bundler?", 0, ["Vite", "Webpack"]);
  await respond(foreign.id, "2026-10-06T15:00:00Z", [
    { questionId: q6.id, optionIds: [q6.o.Vite!] },
  ]);

  return { group, s1, s2, s5, q1, q2, q3, q5 };
}
