import type { UserRole } from "@/generated/prisma/enums";
import { getDb } from "@/lib/db";

export type Role = UserRole;
export type UserRecord = { id: string; email: string; role: Role };

const select = { id: true, email: true, role: true } as const;

/** Cria o usuário no primeiro login; nos seguintes, atualiza e-mail e papel. */
export function upsertUser(data: UserRecord & { name: string | null }): Promise<UserRecord> {
  const { id, email, role, name } = data;
  return getDb().user.upsert({
    where: { id },
    create: { id, email, role, name },
    update: { email, role },
    select,
  });
}

export function findUserById(id: string): Promise<UserRecord | null> {
  return getDb().user.findUnique({ where: { id }, select });
}
