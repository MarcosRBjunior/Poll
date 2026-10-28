import { AppError } from "@/lib/errors";
import { startOfTodayInAppZone } from "@/lib/format";
import { pageQuerySchema, skipFor, type Page } from "@/lib/pagination";
import {
  countRequestsSince,
  findMyRequests,
  findRequest,
  findRequestQueue,
  insertRequest,
  updateRequest,
  type MyRequestRow,
  type QueueRow,
} from "./repository";
import {
  DAILY_REQUEST_LIMIT,
  requestInputSchema,
  requestQueueQuerySchema,
  requestTransitions,
  requestUpdateSchema,
  requestStatusLabel,
  type RequestStatus,
} from "./schemas";

/** Solicitação vista por quem pediu (T12): com o link só quando a pesquisa está no ar. */
export type MyRequest = {
  id: string;
  topic: string;
  status: RequestStatus;
  adminNote: string | null;
  createdAt: Date;
  surveyPath: string | null;
};

function toMine(row: MyRequestRow): MyRequest {
  const survey = row.survey;
  const live = row.status === "DONE" && survey && !survey.deletedAt && survey.status !== "DRAFT";
  return {
    id: row.id,
    topic: row.topic,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt,
    surveyPath: live ? `/s/${survey.slug}` : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Solicitar (`POST /api/v1/survey-requests`, RF-21): até 3 por dia de calendário em SP. */
export async function createRequest(
  requesterId: string,
  body: unknown,
  now = new Date(),
): Promise<MyRequest> {
  const input = requestInputSchema.parse(body);
  const dayStart = startOfTodayInAppZone(now);
  if ((await countRequestsSince(requesterId, dayStart)) >= DAILY_REQUEST_LIMIT) {
    const retryAfter = Math.ceil((dayStart.getTime() + DAY_MS - now.getTime()) / 1000);
    throw new AppError(
      "RATE_LIMITED",
      `Você já fez ${DAILY_REQUEST_LIMIT} solicitações hoje. Tente de novo amanhã.`,
      [],
      { retryAfter },
    );
  }
  return toMine(await insertRequest(requesterId, input));
}

/** Minhas solicitações (`GET /api/v1/survey-requests/mine`): só as próprias (RN-22). */
export async function listMyRequests(
  requesterId: string,
  query: unknown,
): Promise<Page<MyRequest>> {
  const page = pageQuerySchema(20).parse(query);
  const { data, total } = await findMyRequests(requesterId, {
    skip: skipFor(page),
    take: page.pageSize,
  });
  return { data: data.map(toMine), total, ...page };
}

/** Fila do administrador (`GET /api/v1/survey-requests`, RF-22). */
export async function listRequestQueue(query: unknown): Promise<Page<QueueRow>> {
  const { status, ...page } = requestQueueQuerySchema.parse(query);
  const { data, total } = await findRequestQueue({
    status,
    skip: skipFor(page),
    take: page.pageSize,
  });
  return { data, total, ...page };
}

const notFound = () => new AppError("NOT_FOUND", "Solicitação não encontrada.");

/** Solicitação para o administrador (T13 e "Criar pesquisa a partir desta"). */
export async function getRequestForAdmin(id: string): Promise<QueueRow> {
  const request = await findRequest(id);
  if (!request) throw notFound();
  return request;
}

/**
 * Mudar status e nota (`PATCH /api/v1/survey-requests/{id}`, RF-22). Só transições da RN-22;
 * recusar exige nota para o solicitante. Concluir exige uma pesquisa ligada.
 */
export async function updateRequestByAdmin(id: string, body: unknown): Promise<QueueRow> {
  const update = requestUpdateSchema.parse(body);
  const request = await getRequestForAdmin(id);

  if (update.status !== undefined && update.status !== request.status) {
    if (!requestTransitions[request.status].includes(update.status)) {
      throw new AppError(
        "INVALID_TRANSITION",
        `Uma solicitação ${requestStatusLabel[request.status].toLowerCase()} não pode passar a ${requestStatusLabel[update.status].toLowerCase()}.`,
      );
    }
    const note = update.adminNote === undefined ? request.adminNote : update.adminNote;
    if (update.status === "REJECTED" && !note) {
      throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
        { path: "adminNote", message: "Explique ao solicitante por que a pesquisa foi recusada." },
      ]);
    }
    if (update.status === "DONE" && !request.surveyId) {
      throw new AppError("VALIDATION_ERROR", "Há campos inválidos.", [
        {
          path: "status",
          message: "Crie a pesquisa a partir desta solicitação antes de concluir.",
        },
      ]);
    }
  }

  const updated = await updateRequest(id, request.status, {
    ...(update.status !== undefined && { status: update.status }),
    ...(update.adminNote !== undefined && { adminNote: update.adminNote }),
  });
  if (!updated) {
    throw new AppError("INVALID_TRANSITION", "A solicitação mudou. Recarregue a página.");
  }
  return updated;
}
