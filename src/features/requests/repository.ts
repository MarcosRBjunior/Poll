import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import type { RequestInput, RequestStatus } from "./schemas";

export function countRequestsSince(requesterId: string, since: Date): Promise<number> {
  return getDb().surveyRequest.count({ where: { requesterId, createdAt: { gte: since } } });
}

const mineSelect = {
  id: true,
  topic: true,
  status: true,
  adminNote: true,
  createdAt: true,
  survey: { select: { slug: true, status: true, deletedAt: true } },
} satisfies Prisma.SurveyRequestSelect;

export type MyRequestRow = Prisma.SurveyRequestGetPayload<{ select: typeof mineSelect }>;

export function insertRequest(requesterId: string, data: RequestInput): Promise<MyRequestRow> {
  return getDb().surveyRequest.create({ data: { ...data, requesterId }, select: mineSelect });
}

/** Solicitações de um usuário, da mais nova para a mais antiga (só as próprias, RN-22). */
export async function findMyRequests(
  requesterId: string,
  page: { skip: number; take: number },
): Promise<{ data: MyRequestRow[]; total: number }> {
  const where = { requesterId };
  const [data, total] = await Promise.all([
    getDb().surveyRequest.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: page.skip,
      take: page.take,
      select: mineSelect,
    }),
    getDb().surveyRequest.count({ where }),
  ]);
  return { data, total };
}

const queueSelect = {
  id: true,
  topic: true,
  goal: true,
  suggestedQuestions: true,
  audience: true,
  status: true,
  adminNote: true,
  surveyId: true,
  createdAt: true,
  requester: { select: { name: true, email: true } },
} satisfies Prisma.SurveyRequestSelect;

export type QueueRow = Prisma.SurveyRequestGetPayload<{ select: typeof queueSelect }>;

/** Fila do administrador: das mais antigas para as mais novas (RF-22, critério 1). */
export async function findRequestQueue(filters: {
  status?: RequestStatus;
  skip: number;
  take: number;
}): Promise<{ data: QueueRow[]; total: number }> {
  const where = filters.status ? { status: filters.status } : {};
  const [data, total] = await Promise.all([
    getDb().surveyRequest.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: filters.skip,
      take: filters.take,
      select: queueSelect,
    }),
    getDb().surveyRequest.count({ where }),
  ]);
  return { data, total };
}

export function findRequest(id: string): Promise<QueueRow | null> {
  return getDb().surveyRequest.findUnique({ where: { id }, select: queueSelect });
}

/**
 * Muda status e/ou nota só se o status ainda for `from` (outra aba pode ter mudado).
 * Devolve `null` se não mudou nada.
 */
export async function updateRequest(
  id: string,
  from: RequestStatus,
  data: { status?: RequestStatus; adminNote?: string | null },
): Promise<QueueRow | null> {
  const { count } = await getDb().surveyRequest.updateMany({ where: { id, status: from }, data });
  return count === 1 ? findRequest(id) : null;
}
