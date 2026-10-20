import { beforeEach, describe, expect, it } from "vitest";
import { runSeed, SeedError } from "../../prisma/seed/run";
import { createUser, db, resetDatabase } from "../fixtures/db";

const ADMIN_EMAIL = "admin@example.com";

beforeEach(resetDatabase);

async function snapshot() {
  return db.survey.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      status: true,
      isListed: true,
      group: { select: { name: true } },
      questions: {
        orderBy: { position: "asc" },
        select: {
          type: true,
          title: true,
          required: true,
          position: true,
          options: { orderBy: { position: "asc" }, select: { label: true, value: true } },
        },
      },
    },
  });
}

describe("runSeed (RF-19)", () => {
  it("cria a pesquisa do Nível 1 com as 6 perguntas, publicada no grupo certo", async () => {
    await createUser({ email: ADMIN_EMAIL, role: "ADMIN" });
    await runSeed(db, ADMIN_EMAIL);

    const survey = (await snapshot()).find((s) => s.slug === "ferramentas-javascript-favoritas");
    expect(survey).toMatchObject({
      status: "PUBLISHED",
      isListed: true,
      group: { name: "Ecossistema JavaScript" },
    });
    expect(survey!.questions.map((q) => q.type)).toEqual([
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "MULTIPLE_CHOICE",
      "SINGLE_CHOICE",
      "SINGLE_CHOICE",
      "LONG_TEXT",
    ]);
    const comment = survey!.questions.at(-1)!;
    expect(comment).toMatchObject({ required: false, options: [] });
    expect(survey!.questions[4]!.options.map((o) => Number(o.value))).toEqual([1, 2, 3, 4, 5]);
  });

  it("cria as três pesquisas e os dois grupos de D-12", async () => {
    await createUser({ email: ADMIN_EMAIL, role: "ADMIN" });
    const result = await runSeed(db, ADMIN_EMAIL);

    expect(result.created).toEqual([
      "ferramentas-javascript-favoritas",
      "como-voce-trabalha-com-javascript",
      "entretenimento-favorito",
    ]);
    expect(await db.surveyGroup.count()).toBe(2);
  });

  it("rodar duas vezes deixa o banco no mesmo estado", async () => {
    await createUser({ email: ADMIN_EMAIL, role: "ADMIN" });
    await runSeed(db, ADMIN_EMAIL);
    const first = await snapshot();

    const second = await runSeed(db, ADMIN_EMAIL);
    expect(second.created).toEqual([]);
    expect(await snapshot()).toEqual(first);
    expect(await db.surveyGroup.count()).toBe(2);
  });

  it("para com mensagem clara quando o administrador não existe", async () => {
    await expect(runSeed(db, ADMIN_EMAIL)).rejects.toThrow(SeedError);
    await expect(runSeed(db, ADMIN_EMAIL)).rejects.toThrow(/Entre no app uma vez/);
    expect(await db.survey.count()).toBe(0);
  });

  it("para quando ADMIN_EMAIL não está definida", async () => {
    await expect(runSeed(db, undefined)).rejects.toThrow(/ADMIN_EMAIL/);
  });
});
