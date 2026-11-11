import { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import type { GroupInput, GroupUpdate } from "./schemas";

const groupSelect = {
  id: true,
  name: true,
  description: true,
  // Pesquisas excluídas continuam ligadas, mas não contam (RN-19).
  _count: { select: { surveys: { where: { deletedAt: null } } } },
} satisfies Prisma.SurveyGroupSelect;

type GroupRecord = Prisma.SurveyGroupGetPayload<{ select: typeof groupSelect }>;

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  surveyCount: number;
};

const toRow = ({ _count, ...group }: GroupRecord): GroupRow => ({
  ...group,
  surveyCount: _count.surveys,
});

/** Grupos do dono, em ordem alfabética (RN-12: toda consulta de gestão filtra pelo dono). */
export async function findGroups(ownerId: string): Promise<GroupRow[]> {
  const groups = await getDb().surveyGroup.findMany({
    where: { ownerId },
    orderBy: { name: "asc" },
    select: groupSelect,
  });
  return groups.map(toRow);
}

async function findGroup(id: string, ownerId: string): Promise<GroupRow | null> {
  const group = await getDb().surveyGroup.findFirst({
    where: { id, ownerId },
    select: groupSelect,
  });
  return group && toRow(group);
}

export async function insertGroup(ownerId: string, data: GroupInput): Promise<GroupRow> {
  return toRow(
    await getDb().surveyGroup.create({ data: { ...data, ownerId }, select: groupSelect }),
  );
}

/** Devolve `null` se o grupo não existe ou é de outro dono. */
export async function updateGroup(
  id: string,
  ownerId: string,
  data: GroupUpdate,
): Promise<GroupRow | null> {
  const { count } = await getDb().surveyGroup.updateMany({ where: { id, ownerId }, data });
  return count === 1 ? findGroup(id, ownerId) : null;
}

/** Exclui o grupo; a FK com `SET NULL` deixa as pesquisas sem grupo (RN-21). */
export async function deleteGroup(id: string, ownerId: string): Promise<boolean> {
  const { count } = await getDb().surveyGroup.deleteMany({ where: { id, ownerId } });
  return count === 1;
}

/** O dono já tem um grupo com esse nome (UNIQUE `ownerId` + `name`). */
export function isNameConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
