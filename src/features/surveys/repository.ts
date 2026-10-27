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

type SurveyStatus = EditSurveyRecord["status"];

/**
 * Muda o status só se ele ainda for um dos `from` (RN-15). Devolve `false` se outra
 * requisição mudou antes: o serviço responde 409 em vez de sobrescrever.
 */
export async function changeStatus(
  surveyId: string,
  from: SurveyStatus[],
  data: { status: SurveyStatus; publishedAt?: Date; closedAt?: Date | null },
): Promise<boolean> {
  const { count } = await getDb().survey.updateMany({
    where: { id: surveyId, status: { in: from }, deletedAt: null },
    data,
  });
  return count === 1;
}

/** Exclusão lógica (RN-19). */
export async function softDeleteSurvey(surveyId: string): Promise<boolean> {
  const { count } = await getDb().survey.updateMany({
    where: { id: surveyId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return count === 1;
}

export type SurveyListFilters = {
  ownerId: string;
  status?: SurveyStatus;
  groupId?: string;
  q?: string;
  skip: number;
  take: number;
};

export type SurveyListRow = {
  id: string;
  title: string;
  slug: string;
  status: SurveyStatus;
  groupId: string | null;
  groupName: string | null;
  responseCount: number;
  lastResponseAt: Date | null;
  updatedAt: Date;
};

/**
 * Pesquisas não excluídas do dono, da última alteração para a mais antiga (RF-08).
 * Três consultas: página, total e a última resposta das pesquisas da página.
 */
export async function findSurveyPage(
  filters: SurveyListFilters,
): Promise<{ data: SurveyListRow[]; total: number }> {
  const where: Prisma.SurveyWhereInput = {
    ownerId: filters.ownerId,
    deletedAt: null,
    ...(filters.status && { status: filters.status }),
    ...(filters.groupId && { groupId: filters.groupId }),
    ...(filters.q && { title: { contains: filters.q, mode: "insensitive" } }),
  };
  const [rows, total] = await Promise.all([
    getDb().survey.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: filters.skip,
      take: filters.take,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        groupId: true,
        updatedAt: true,
        group: { select: { name: true } },
        _count: { select: { responses: true } },
      },
    }),
    getDb().survey.count({ where }),
  ]);

  const last = rows.length
    ? await getDb().surveyResponse.groupBy({
        by: ["surveyId"],
        where: { surveyId: { in: rows.map((r) => r.id) } },
        _max: { submittedAt: true },
      })
    : [];
  const lastBySurvey = new Map(last.map((l) => [l.surveyId, l._max.submittedAt]));

  return {
    total,
    data: rows.map(({ group, _count, ...row }) => ({
      ...row,
      groupName: group?.name ?? null,
      responseCount: _count.responses,
      lastResponseAt: lastBySurvey.get(row.id) ?? null,
    })),
  };
}

/** Grupos do dono, para o filtro da lista (a gestão de grupos chega na F8). */
export function findOwnGroups(ownerId: string): Promise<{ id: string; name: string }[]> {
  return getDb().surveyGroup.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
