import { AppError, type ErrorDetail } from "@/lib/errors";
import { pageQuerySchema, skipFor, type Page } from "@/lib/pagination";
import { slugify } from "@/lib/slug";
import {
  applySurveyUpdate,
  changeStatus,
  findListedSurveys,
  findOwnGroups,
  findSurveyPage,
  softDeleteSurvey,
  type ListedSurvey,
  type SurveyListRow,
  findSlugsStartingWith,
  findSurveyForEdit,
  groupBelongsTo,
  insertSurvey,
  isSlugConflict,
  publishDraft,
  RequestUnavailableError,
  type EditSurveyRecord,
  type SurveyUpdatePlan,
} from "./repository";
import {
  isChoiceType,
  surveyCreateSchema,
  surveyListQuerySchema,
  surveyUpdateSchema,
  type QuestionInput,
  type SurveyInput,
} from "./schemas";

type QuestionType = QuestionInput["type"];

/** `SurveyDetail` (spec 8.4): o que o construtor abre, com itens arquivados marcados. */
export type SurveyDetail = {
  id: string;
  slug: string;
  status: EditSurveyRecord["status"];
  version: number;
  title: string;
  description: string | null;
  groupId: string | null;
  isListed: boolean;
  hasResponses: boolean;
  responseCount: number;
  publishedAt: Date | null;
  closedAt: Date | null;
  requestId: string | null;
  questions: {
    id: string;
    type: QuestionType;
    title: string;
    helpText: string | null;
    required: boolean;
    minSelections: number | null;
    maxSelections: number | null;
    archivedAt: Date | null;
    options: { id: string; label: string; value: number | null; archivedAt: Date | null }[];
  }[];
};

const notFound = () => new AppError("NOT_FOUND", "Pesquisa não encontrada.");

/** Pesquisa do administrador, não excluída. De outro dono: 404 (RN-12). */
async function loadOwnSurvey(adminId: string, surveyId: string) {
  const survey = await findSurveyForEdit(surveyId);
  if (!survey || survey.deletedAt || survey.ownerId !== adminId) throw notFound();
  return survey;
}

function toDetail(survey: EditSurveyRecord): SurveyDetail {
  return {
    id: survey.id,
    slug: survey.slug,
    status: survey.status,
    version: survey.version,
    title: survey.title,
    description: survey.description,
    groupId: survey.groupId,
    isListed: survey.isListed,
    hasResponses: survey.responseCount > 0,
    responseCount: survey.responseCount,
    publishedAt: survey.publishedAt,
    closedAt: survey.closedAt,
    requestId: survey.requestId,
    // Ativas primeiro, na ordem da pesquisa; as arquivadas vêm no fim (RN-13).
    questions: [
      ...survey.questions.filter((q) => !q.archivedAt),
      ...survey.questions.filter((q) => q.archivedAt),
    ].map((q) => ({
      id: q.id,
      type: q.type,
      title: q.title,
      helpText: q.helpText,
      required: q.required,
      minSelections: q.minSelections,
      maxSelections: q.maxSelections,
      archivedAt: q.archivedAt,
      options: [
        ...q.options.filter((o) => !o.archivedAt),
        ...q.options.filter((o) => o.archivedAt),
      ].map((o) => ({ id: o.id, label: o.label, value: o.value, archivedAt: o.archivedAt })),
    })),
  };
}

/** Abrir para edição (`GET /api/v1/surveys/{id}`). */
export async function getSurveyDetail(adminId: string, surveyId: string): Promise<SurveyDetail> {
  return toDetail(await loadOwnSurvey(adminId, surveyId));
}

async function assertGroup(adminId: string, groupId: string | null | undefined) {
  if (groupId && !(await groupBelongsTo(groupId, adminId))) {
    throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
      { path: "groupId", message: "Grupo não encontrado." },
    ]);
  }
}

/** Slug livre a partir do título: `base`, `base-2`, `base-3`… (RN-20). */
async function availableSlug(title: string, currentSlug?: string): Promise<string> {
  const base = slugify(title).slice(0, 120) || "pesquisa";
  const taken = new Set(await findSlugsStartingWith(base));
  if (currentSlug) taken.delete(currentSlug);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

/** Duas tentativas com slug recalculado se outra pesquisa pegou o mesmo slug ao mesmo tempo. */
async function withSlugRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isSlugConflict(error)) throw error;
    return run();
  }
}

const questionData = (q: QuestionInput, position: number) => ({
  type: q.type,
  title: q.title,
  helpText: q.helpText,
  required: q.required,
  minSelections: q.minSelections,
  maxSelections: q.maxSelections,
  position,
});

/** Criar rascunho (`POST /api/v1/surveys`, RF-05). */
export async function createSurvey(adminId: string, body: unknown): Promise<SurveyDetail> {
  const { requestId, ...input } = surveyCreateSchema.parse(body);
  if (input.questions.some((q) => q.id || q.options.some((o) => o.id))) {
    throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
      { path: "questions", message: "Pesquisa nova não tem itens existentes." },
    ]);
  }
  await assertGroup(adminId, input.groupId);

  let id: string;
  try {
    id = await withSlugRetry(async () =>
      insertSurvey(
        {
          ownerId: adminId,
          title: input.title,
          description: input.description,
          groupId: input.groupId ?? null,
          isListed: input.isListed,
          slug: await availableSlug(input.title),
          questions: input.questions.map((q, position) => ({
            ...questionData(q, position),
            options: q.options.map((o, i) => ({ label: o.label, value: o.value, position: i })),
          })),
        },
        requestId,
      ),
    );
  } catch (error) {
    if (!(error instanceof RequestUnavailableError)) throw error;
    // RF-22: a solicitação precisa estar aberta e sem outra pesquisa ligada.
    throw new AppError("INVALID_TRANSITION", "Esta solicitação não está mais aberta.", [
      { path: "requestId", message: "A solicitação já foi atendida, recusada ou não existe." },
    ]);
  }
  return getSurveyDetail(adminId, id);
}

const editNotAllowed = (details: ErrorDetail[]) =>
  new AppError(
    "EDIT_NOT_ALLOWED",
    "Esta pesquisa já tem respostas: não dá para trocar o tipo de uma pergunta nem o valor de uma opção.",
    details,
  );

/**
 * Salvar edição (`PUT /api/v1/surveys/{id}`, RF-09). Compara com o banco: item sem `id` é
 * criado; item ausente é apagado (sem respostas) ou arquivado (com respostas); item presente
 * é atualizado. Com respostas vale o modo restrito (RN-11). Sucesso incrementa `version`.
 */
export async function updateSurvey(
  adminId: string,
  surveyId: string,
  body: unknown,
): Promise<SurveyDetail> {
  const { version, ...input } = surveyUpdateSchema.parse(body);
  const survey = await loadOwnSurvey(adminId, surveyId);
  if (version !== survey.version) throw versionConflict();
  await assertGroup(adminId, input.groupId);

  const plan = buildPlan(survey, input, version);
  // O slug acompanha o título até a primeira publicação (RN-20).
  const run = async () => {
    if (!survey.publishedAt && input.title !== survey.title) {
      plan.survey.slug = await availableSlug(input.title, survey.slug);
    }
    return applySurveyUpdate(plan);
  };
  if (!(await withSlugRetry(run))) throw versionConflict();
  return getSurveyDetail(adminId, surveyId);
}

const versionConflict = () =>
  new AppError(
    "VERSION_CONFLICT",
    "Esta pesquisa foi alterada em outra aba ou por outra pessoa. Recarregue para ver a versão atual.",
  );

function buildPlan(
  survey: EditSurveyRecord,
  input: SurveyInput,
  version: number,
): SurveyUpdatePlan {
  const restricted = survey.responseCount > 0;
  const activeQuestions = new Map(
    survey.questions.filter((q) => !q.archivedAt).map((q) => [q.id, q]),
  );
  const invalid: ErrorDetail[] = [];
  const blocked: ErrorDetail[] = [];
  const keptQuestionIds = new Set<string>();
  const keptOptionIds = new Set<string>();
  const relabelOptionIds: string[] = [];

  const questions = input.questions.map((q, qi) => {
    const path = `questions.${qi}`;
    const existing = q.id ? activeQuestions.get(q.id) : undefined;
    if (q.id && (!existing || keptQuestionIds.has(q.id))) {
      invalid.push({ path: `${path}.id`, message: "Pergunta não encontrada nesta pesquisa." });
    }
    if (existing) keptQuestionIds.add(existing.id);
    if (existing && restricted && existing.type !== q.type) {
      blocked.push({
        path: `${path}.type`,
        message: "Com respostas, o tipo não pode mudar. Crie uma pergunta nova.",
      });
    }

    const activeOptions = new Map(
      (existing?.options ?? []).filter((o) => !o.archivedAt).map((o) => [o.id, o]),
    );
    const options = isChoiceType(q.type)
      ? q.options.map((o, oi) => {
          const optionPath = `${path}.options.${oi}`;
          const current = o.id ? activeOptions.get(o.id) : undefined;
          if (o.id && (!current || keptOptionIds.has(o.id))) {
            invalid.push({
              path: `${optionPath}.id`,
              message: "Opção não encontrada nesta pergunta.",
            });
          }
          if (current) {
            keptOptionIds.add(current.id);
            if (restricted && current.value !== o.value) {
              blocked.push({
                path: `${optionPath}.value`,
                message: "Com respostas, o valor numérico não pode mudar.",
              });
            }
            if (current.label !== o.label) relabelOptionIds.push(current.id);
          }
          return { id: current?.id, label: o.label, value: o.value, position: oi };
        })
      : [];

    return { id: existing?.id, ...questionData(q, qi), options };
  });

  if (invalid.length) throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", invalid);
  if (blocked.length) throw editNotAllowed(blocked);

  // Itens que saíram: com respostas são arquivados (resultados antigos continuam no painel).
  const removedQuestions = [...activeQuestions.values()].filter((q) => !keptQuestionIds.has(q.id));
  const removedOptions = survey.questions
    .filter((q) => keptQuestionIds.has(q.id))
    .flatMap((q) => q.options.filter((o) => !o.archivedAt && !keptOptionIds.has(o.id)));

  return {
    surveyId: survey.id,
    expectedVersion: version,
    survey: {
      title: input.title,
      description: input.description,
      groupId: input.groupId === undefined ? survey.groupId : input.groupId,
      isListed: input.isListed,
      slug: survey.slug,
    },
    archiveQuestionIds: removedQuestions.filter((q) => q.answerCount > 0).map((q) => q.id),
    deleteQuestionIds: removedQuestions.filter((q) => q.answerCount === 0).map((q) => q.id),
    archiveOptionIds: removedOptions.filter((o) => o.selectionCount > 0).map((o) => o.id),
    deleteOptionIds: removedOptions.filter((o) => o.selectionCount === 0).map((o) => o.id),
    relabelOptionIds,
    questions,
  };
}

// ---- Status (RF-11, RN-15) ----

const invalidTransition = (message: string) => new AppError("INVALID_TRANSITION", message);

/**
 * Revalida a pesquisa inteira antes de publicar (RN-01, RN-02). Os caminhos seguem a
 * ordem das perguntas ativas, a mesma do construtor, para o erro aparecer no campo.
 */
function publishProblems(survey: EditSurveyRecord): ErrorDetail[] {
  const problems: ErrorDetail[] = [];
  if (survey.title.trim().length < 3) {
    problems.push({ path: "title", message: "Use pelo menos 3 caracteres no título." });
  }
  const active = survey.questions.filter((q) => !q.archivedAt);
  if (active.length === 0) {
    problems.push({ path: "questions", message: "Adicione pelo menos uma pergunta." });
  }
  active.forEach((q, index) => {
    if (isChoiceType(q.type) && q.options.filter((o) => !o.archivedAt).length < 2) {
      problems.push({
        path: `questions.${index}.options`,
        message: "Pergunta de escolha precisa de pelo menos 2 opções.",
      });
    }
  });
  return problems;
}

export type PublishResult = { status: "PUBLISHED"; publishedAt: Date; publicPath: string };

/** Publicar (`POST /surveys/{id}/publish`): só rascunho; fixa o slug (RN-20). */
export async function publishSurvey(adminId: string, surveyId: string): Promise<PublishResult> {
  const survey = await loadOwnSurvey(adminId, surveyId);
  if (survey.status !== "DRAFT") {
    throw invalidTransition(
      survey.status === "PUBLISHED"
        ? "A pesquisa já está publicada."
        : "Use reabrir para aceitar respostas de novo.",
    );
  }
  const problems = publishProblems(survey);
  if (problems.length) {
    throw new AppError("NOT_PUBLISHABLE", "A pesquisa ainda não pode ser publicada.", problems);
  }
  const publishedAt = new Date();
  // Na mesma transação, a solicitação ligada vai a DONE (RN-22).
  if (!(await publishDraft(survey.id, publishedAt))) {
    throw invalidTransition("O status da pesquisa mudou. Recarregue a página.");
  }
  return { status: "PUBLISHED", publishedAt, publicPath: `/s/${survey.slug}` };
}

/** Encerrar (`POST /surveys/{id}/close`): para de aceitar respostas (RN-04). */
export async function closeSurvey(adminId: string, surveyId: string) {
  const survey = await loadOwnSurvey(adminId, surveyId);
  const closedAt = new Date();
  if (
    survey.status !== "PUBLISHED" ||
    !(await changeStatus(survey.id, ["PUBLISHED"], { status: "CLOSED", closedAt }))
  ) {
    throw invalidTransition("Só uma pesquisa publicada pode ser encerrada.");
  }
  return { status: "CLOSED" as const, closedAt };
}

/** Reabrir (`POST /surveys/{id}/reopen`): volta a aceitar respostas no mesmo link. */
export async function reopenSurvey(adminId: string, surveyId: string) {
  const survey = await loadOwnSurvey(adminId, surveyId);
  if (
    survey.status !== "CLOSED" ||
    !(await changeStatus(survey.id, ["CLOSED"], { status: "PUBLISHED", closedAt: null }))
  ) {
    throw invalidTransition("Só uma pesquisa encerrada pode ser reaberta.");
  }
  return { status: "PUBLISHED" as const };
}

/** Excluir (`DELETE /surveys/{id}`, RF-10): exclusão lógica; links públicos passam a 404. */
export async function deleteSurvey(adminId: string, surveyId: string): Promise<void> {
  await loadOwnSurvey(adminId, surveyId);
  if (!(await softDeleteSurvey(surveyId))) throw notFound();
}

// ---- Lista (RF-08) ----

/** `GET /api/v1/surveys`: pesquisas do administrador com filtros combinados. */
export async function listSurveys(adminId: string, query: unknown): Promise<Page<SurveyListRow>> {
  const { page, pageSize, ...filters } = surveyListQuerySchema.parse(query);
  const { data, total } = await findSurveyPage({
    ownerId: adminId,
    ...filters,
    skip: skipFor({ page, pageSize }),
    take: pageSize,
  });
  return { data, total, page, pageSize };
}

/** Grupos para o filtro da lista. */
export function listOwnGroups(adminId: string) {
  return findOwnGroups(adminId);
}

// ---- Vitrine (RF-20) ----

export const SHOWCASE_PAGE_SIZE = 12;

/** `GET /api/v1/public/surveys`: pesquisas abertas da página inicial (T01). */
export async function listPublicSurveys(query: unknown): Promise<Page<ListedSurvey>> {
  const page = pageQuerySchema(SHOWCASE_PAGE_SIZE).parse(query);
  const { data, total } = await findListedSurveys({ skip: skipFor(page), take: page.pageSize });
  return { data, total, ...page };
}
