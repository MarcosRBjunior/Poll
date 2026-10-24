import { randomUUID } from "node:crypto";
import { Client } from "pg";

// Pesquisa criada direto no banco para o E2E (o banco do CI começa vazio).

type Status = "PUBLISHED" | "CLOSED";

export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

export async function createE2ESurvey(status: Status = "PUBLISHED") {
  const ownerId = randomUUID();
  const surveyId = `e2e-${randomUUID()}`;
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  const id = () => `e2e-${randomUUID()}`;
  const q = { framework: id(), tools: id(), project: id(), comment: id() };

  await withDb(async (db) => {
    await db.query(`INSERT INTO "User" (id, email, role) VALUES ($1, $2, 'ADMIN')`, [
      ownerId,
      `${ownerId}@e2e.test`,
    ]);
    await db.query(
      `INSERT INTO "Survey" (id, "ownerId", title, description, slug, status, "publishedAt", "updatedAt")
       VALUES ($1, $2, 'Ferramentas JavaScript (E2E)', 'Pesquisa criada pelo teste.', $3, $4, now(), now())`,
      [surveyId, ownerId, slug, status],
    );
    const question = (
      qid: string,
      type: string,
      title: string,
      position: number,
      required: boolean,
      max: number | null = null,
    ) =>
      db.query(
        `INSERT INTO "Question" (id, "surveyId", type, title, required, position, "maxSelections", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [qid, surveyId, type, title, required, position, max],
      );
    await question(
      q.framework,
      "SINGLE_CHOICE",
      "Qual framework de interface você mais usa?",
      0,
      true,
    );
    await question(q.tools, "MULTIPLE_CHOICE", "Quais ferramentas de build você usa?", 1, true, 2);
    await question(q.project, "SHORT_TEXT", "Qual é o nome do seu projeto?", 2, true);
    await question(q.comment, "LONG_TEXT", "Comentário", 3, false);
    const options: [string, string[]][] = [
      [q.framework, ["React", "Vue", "Svelte"]],
      [q.tools, ["Vite", "webpack", "esbuild"]],
    ];
    for (const [questionId, labels] of options) {
      for (const [position, label] of labels.entries()) {
        await db.query(
          `INSERT INTO "QuestionOption" (id, "questionId", label, position, "updatedAt") VALUES ($1, $2, $3, $4, now())`,
          [id(), questionId, label, position],
        );
      }
    }
  });

  return {
    slug,
    /** Apaga a pesquisa (respostas e perguntas vão em cascata) e o dono. */
    cleanup: () =>
      withDb(async (db) => {
        await db.query(
          `DELETE FROM "Answer" WHERE "responseId" IN (SELECT id FROM "SurveyResponse" WHERE "surveyId" = $1)`,
          [surveyId],
        );
        await db.query(`DELETE FROM "Survey" WHERE id = $1`, [surveyId]);
        await db.query(`DELETE FROM "User" WHERE id = $1`, [ownerId]);
      }),
  };
}
