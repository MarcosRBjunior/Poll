import { AppError } from "@/lib/errors";
import {
  deleteGroup as removeGroup,
  findGroups,
  insertGroup,
  isNameConflict,
  updateGroup as changeGroup,
  type GroupRow,
} from "./repository";
import { groupInputSchema, groupUpdateSchema } from "./schemas";

export type { GroupRow };

const notFound = () => new AppError("NOT_FOUND", "Grupo não encontrado.");

/** Nome repetido do mesmo dono → 409 com o erro no campo (T08). */
function nameTaken(error: unknown): never {
  if (!isNameConflict(error)) throw error;
  throw new AppError("NAME_TAKEN", "Já existe um grupo com esse nome.", [
    { path: "name", message: "Já existe um grupo com esse nome." },
  ]);
}

/** Listar (`GET /api/v1/groups`): para T08, o seletor do construtor e o filtro da lista. */
export function listGroups(adminId: string): Promise<GroupRow[]> {
  return findGroups(adminId);
}

/** Criar (`POST /api/v1/groups`, RF-16). */
export async function createGroup(adminId: string, body: unknown): Promise<GroupRow> {
  const input = groupInputSchema.parse(body);
  return insertGroup(adminId, input).catch(nameTaken);
}

/** Renomear ou descrever (`PATCH /api/v1/groups/{id}`). */
export async function updateGroup(adminId: string, id: string, body: unknown): Promise<GroupRow> {
  const update = groupUpdateSchema.parse(body);
  const group = await changeGroup(id, adminId, update).catch(nameTaken);
  if (!group) throw notFound();
  return group;
}

/** Excluir (`DELETE /api/v1/groups/{id}`): as pesquisas ficam sem grupo (RN-21). */
export async function deleteGroup(adminId: string, id: string): Promise<void> {
  if (!(await removeGroup(id, adminId))) throw notFound();
}
