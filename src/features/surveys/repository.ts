import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";

// Estrutura completa para edição: inclui itens arquivados e quantas respostas cada um tem,
// para o serviço decidir entre apagar e arquivar (RN-11).
const editSelect = {
  id: true,
  ownerId: true,
  title: true,
  description: true,
  slug: true,
  status: true,
  groupId: true,
  isListed: true,
  version: true,
  publishedAt: true,
  closedAt: true,
  deletedAt: true,
  request: { select: { id: true } },
  _count: { select: { responses: true } },
  questions: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      helpText: true,
      required: true,
      minSelections: true,
      maxSelections: true,
      archivedAt: true,
      _count: { select: { answers: true } },
      options: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          label: true,
          value: true,
          archivedAt: true,
          _count: { select: { selections: true } },
        },
      },
    },
  },
} satisfies Prisma.SurveySelect;

type EditRow = Prisma.SurveyGetPayload<{ select: typeof editSelect }>;

export type EditOption = {
  id: string;
  label: string;
  value: number | null;
  archivedAt: Date | null;
  selectionCount: number;
};

export type EditQuestion = Omit<EditRow["questions"][number], "_count" | "options"> & {
  answerCount: number;
  options: EditOption[];
};

export type EditSurveyRecord = Omit<EditRow, "_count" | "questions" | "request"> & {
  requestId: string | null;
  responseCount: number;
  questions: EditQuestion[];
};

export async function findSurveyForEdit(id: string): Promise<EditSurveyRecord | null> {
  const row = await getDb().survey.findUnique({ where: { id }, select: editSelect });
  if (!row) return null;
  const { _count, request, questions, ...survey } = row;
  return {
    ...survey,
    requestId: request?.id ?? null,
    responseCount: _count.responses,
    questions: questions.map(({ _count: q, options, ...question }) => ({
      ...question,
      answerCount: q.answers,
      options: options.map(({ _count: o, value, ...option }) => ({
        ...option,
        value: value?.toNumber() ?? null,
        selectionCount: o.selections,
      })),
    })),
  };
}

/** Slugs já usados que começam com `base` (para escolher o sufixo -2, -3…, RN-20). */
export async function findSlugsStartingWith(base: string): Promise<string[]> {
  const rows = await getDb().survey.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

export async function groupBelongsTo(groupId: string, ownerId: string): Promise<boolean> {
  const group = await getDb().surveyGroup.findFirst({
    where: { id: groupId, ownerId },
    select: { id: true },
  });
  return group !== null;
}

type OptionData = { label: string; value: number | null; position: number };
type QuestionData = {
  type: EditQuestion["type"];
  title: string;
  helpText: string | null;
  required: boolean;
  minSelections: number | null;
  maxSelections: number | null;
  position: number;
};
type SurveyData = {
  title: string;
  description: string | null;
  groupId: string | null;
  isListed: boolean;
  slug: string;
};

export type NewSurvey = SurveyData & {
  ownerId: string;
  questions: (QuestionData & { options: OptionData[] })[];
};

/** Cria o rascunho com perguntas e opções numa escrita aninhada (uma transação). */
export async function insertSurvey(data: NewSurvey): Promise<string> {
  const { questions, ...survey } = data;
  const created = await getDb().survey.create({
    data: {
      ...survey,
      questions: {
        create: questions.map(({ options, ...question }) => ({
          ...question,
          options: { create: options },
        })),
      },
    },
    select: { id: true },
  });
  return created.id;
}

/** Plano de edição montado pelo serviço; aqui só é executado (RN-11, RN-13, RN-17). */
export type SurveyUpdatePlan = {
  surveyId: string;
  expectedVersion: number;
  survey: SurveyData;
  archiveQuestionIds: string[];
  deleteQuestionIds: string[];
  archiveOptionIds: string[];
  deleteOptionIds: string[];
  /** Opções mantidas cujo rótulo muda: passam por um rótulo provisório (índice único, RN-03). */
  relabelOptionIds: string[];
  questions: (QuestionData & {
    id?: string;
    options: (OptionData & { id?: string })[];
  })[];
};

// Edições maiores fazem dezenas de comandos; contra o banco remoto, 5 s não bastam.
const updateTransactionOptions = { maxWait: 5_000, timeout: 30_000 };

/**
 * Aplica o plano numa transação. Devolve `false` se a `version` mudou nesse meio-tempo
 * (outra aba salvou primeiro) e nada é gravado.
 */
export function applySurveyUpdate(plan: SurveyUpdatePlan): Promise<boolean> {
  return getDb().$transaction(async (tx) => {
    const updated = await tx.survey.updateMany({
      where: { id: plan.surveyId, version: plan.expectedVersion, deletedAt: null },
      data: { ...plan.survey, version: { increment: 1 } },
    });
    if (updated.count === 0) return false;

    const now = new Date();
    if (plan.archiveOptionIds.length) {
      await tx.questionOption.updateMany({
        where: { id: { in: plan.archiveOptionIds } },
        data: { archivedAt: now },
      });
    }
    if (plan.deleteOptionIds.length) {
      await tx.questionOption.deleteMany({ where: { id: { in: plan.deleteOptionIds } } });
    }
    if (plan.archiveQuestionIds.length) {
      await tx.question.updateMany({
        where: { id: { in: plan.archiveQuestionIds } },
        data: { archivedAt: now },
      });
    }
    if (plan.deleteQuestionIds.length) {
      await tx.question.deleteMany({ where: { id: { in: plan.deleteQuestionIds } } });
    }
    for (const optionId of plan.relabelOptionIds) {
      await tx.questionOption.update({
        where: { id: optionId },
        data: { label: `~${optionId}` },
      });
    }

    for (const { id, options, ...question } of plan.questions) {
      let questionId = id;
      if (questionId) {
        await tx.question.update({ where: { id: questionId }, data: question });
      } else {
        questionId = (
          await tx.question.create({
            data: { ...question, surveyId: plan.surveyId },
            select: { id: true },
          })
        ).id;
      }
      for (const { id: optionId, ...option } of options) {
        if (optionId) await tx.questionOption.update({ where: { id: optionId }, data: option });
        else await tx.questionOption.create({ data: { ...option, questionId } });
      }
    }
    return true;
  }, updateTransactionOptions);
}

/** O slug pedido já foi usado por outra pesquisa (corrida entre dois salvamentos). */
export function isSlugConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta ?? {}).includes("slug")
  );
}
