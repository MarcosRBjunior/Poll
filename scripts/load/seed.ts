// Gera o volume do teste de carga (US-8.4): uma pesquisa com 10 mil respostas para o painel
// de resultados e várias pesquisas vazias para o teste de envio.
//
// Uso: LOAD_DATABASE_URL=... npx tsx scripts/load/seed.ts [--responses 10000] [--submit-surveys 40]
//
// Só roda num banco sem pesquisas de outros donos: nunca aponte para a produção.
import { createHash, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { LOAD } from "./config.mjs";

const { values } = parseArgs({
  options: {
    responses: { type: "string", default: "10000" },
    "submit-surveys": { type: "string", default: String(LOAD.submitSurveys) },
  },
});
const RESPONSES = Number(values.responses);
const SUBMIT_SURVEYS = Number(values["submit-surveys"]);
const BATCH = 1000;
const DAY = 24 * 60 * 60 * 1000;

const url = process.env.LOAD_DATABASE_URL;
if (!url) {
  console.error("Defina LOAD_DATABASE_URL com a URL do banco do teste de carga.");
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 3 }) });

/** Estrutura das pesquisas de carga: os quatro tipos de pergunta, como uma pesquisa real. */
const QUESTIONS = [
  {
    type: "SINGLE_CHOICE",
    title: "Qual framework você mais usa?",
    options: ["React", "Vue", "Svelte", "Angular", "Solid"],
  },
  {
    type: "MULTIPLE_CHOICE",
    title: "Quais ferramentas de teste você usa?",
    options: ["Vitest", "Jest", "Playwright", "Cypress", "Testing Library", "Mocha"],
    maxSelections: 3,
  },
  {
    type: "SINGLE_CHOICE",
    title: "De 1 a 5, quanto você gosta de TypeScript?",
    options: ["1", "2", "3", "4", "5"],
    values: [1, 2, 3, 4, 5],
  },
  { type: "SHORT_TEXT", title: "Qual seu editor?" },
  { type: "LONG_TEXT", title: "Comentário", required: false },
] as const;

type Created = { id: string; type: string; options: string[] };

async function createSurvey(ownerId: string, slug: string, title: string): Promise<Created[]> {
  const survey = await db.survey.create({
    data: { ownerId, slug, title, status: "PUBLISHED", publishedAt: new Date() },
  });
  const created: Created[] = [];
  for (const [position, q] of QUESTIONS.entries()) {
    const question = await db.question.create({
      data: {
        surveyId: survey.id,
        type: q.type,
        title: q.title,
        position,
        required: "required" in q ? q.required : true,
        ...(q.type === "MULTIPLE_CHOICE"
          ? { minSelections: 1, maxSelections: q.maxSelections }
          : {}),
      },
    });
    const options: string[] = [];
    if ("options" in q) {
      await db.questionOption.createMany({
        data: q.options.map((label, i) => ({
          id: randomUUID(),
          questionId: question.id,
          label,
          position: i,
          value: "values" in q ? q.values[i] : null,
        })),
      });
      const rows = await db.questionOption.findMany({
        where: { questionId: question.id },
        orderBy: { position: "asc" },
      });
      options.push(...rows.map((o) => o.id));
    }
    created.push({ id: question.id, type: q.type, options });
  }
  return created;
}

/** Escolha com viés, para o gráfico não sair plano: a primeira opção é a mais escolhida. */
const pick = (options: string[]) => options[Math.floor(Math.random() ** 1.6 * options.length)]!;

async function insertResponses(surveyId: string, questions: Created[], total: number) {
  const editors = ["VS Code", "Neovim", "WebStorm", "Zed", "Cursor"];
  for (let start = 0; start < total; start += BATCH) {
    const responses: Prisma.SurveyResponseCreateManyInput[] = [];
    const answers: Prisma.AnswerCreateManyInput[] = [];
    const selections: Prisma.AnswerSelectionCreateManyInput[] = [];

    for (let i = start; i < Math.min(start + BATCH, total); i++) {
      const responseId = randomUUID();
      responses.push({
        id: responseId,
        surveyId,
        respondentKey: createHash("sha256").update(`carga-${surveyId}-${i}`).digest("hex"),
        idempotencyKey: randomUUID(),
        // Espalhadas pelos últimos 90 dias, como uma pesquisa que ficou aberta um trimestre.
        submittedAt: new Date(Date.now() - Math.random() * 90 * DAY),
      });
      for (const q of questions) {
        if (q.type === "LONG_TEXT" && i % 10 !== 0) continue; // 1 em 10 comenta
        const answerId = randomUUID();
        const text =
          q.type === "SHORT_TEXT"
            ? pick(editors)
            : q.type === "LONG_TEXT"
              ? `Comentário de carga número ${i}.`
              : null;
        answers.push({ id: answerId, responseId, questionId: q.id, textValue: text });
        if (q.type === "SINGLE_CHOICE") selections.push({ answerId, optionId: pick(q.options) });
        if (q.type === "MULTIPLE_CHOICE") {
          const chosen = new Set([pick(q.options), pick(q.options), pick(q.options)]);
          for (const optionId of chosen) selections.push({ answerId, optionId });
        }
      }
    }

    // Três operações por lote no Prisma Postgres.
    await db.surveyResponse.createMany({ data: responses });
    await db.answer.createMany({ data: answers });
    await db.answerSelection.createMany({ data: selections });
    process.stdout.write(`\r  ${Math.min(start + BATCH, total)} de ${total} respostas`);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(`Banco: ${new URL(url!).host}`);
  // Antes de qualquer escrita: banco com pesquisas de outros donos não é banco de carga.
  const foreign = await db.survey.count({ where: { owner: { email: { not: LOAD.ownerEmail } } } });
  if (foreign > 0) {
    throw new Error(
      `o banco tem ${foreign} pesquisa(s) de outros donos. Use um banco só para o teste de carga.`,
    );
  }

  const owner = await db.user.upsert({
    where: { email: LOAD.ownerEmail },
    create: { id: randomUUID(), email: LOAD.ownerEmail, name: "Teste de carga" },
    update: {},
  });
  // Respostas antes das pesquisas: Answer → Question não apaga em cascata.
  await db.surveyResponse.deleteMany({ where: { survey: { ownerId: owner.id } } });
  const existing = await db.survey.deleteMany({ where: { ownerId: owner.id } });
  if (existing.count) console.log(`Removidas ${existing.count} pesquisas de carga anteriores.`);

  console.log(`Pesquisa de resultados (${LOAD.resultsSlug}):`);
  const questions = await createSurvey(owner.id, LOAD.resultsSlug, "Carga: ferramentas JavaScript");
  const surveyId = (await db.survey.findUniqueOrThrow({ where: { slug: LOAD.resultsSlug } })).id;
  await insertResponses(surveyId, questions, RESPONSES);

  for (let i = 1; i <= SUBMIT_SURVEYS; i++) {
    await createSurvey(owner.id, LOAD.submitSlug(i), `Carga: envio ${i}`);
  }
  console.log(`Pesquisas de envio: ${SUBMIT_SURVEYS} (${LOAD.submitSlug(1)} …).`);
}

main()
  .catch((error: unknown) => {
    console.error(`Carga interrompida: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
