import { getEnv } from "@/lib/env";
import { findUserById, upsertUser, type Role, type UserRecord } from "./repository";

export type { Role, UserRecord };

export type AuthIdentity = { id: string; email: string; name?: string | null };

/** Papel pelo `ADMIN_EMAIL` (RN-12). Só esse e-mail é ADMIN. */
export function roleForEmail(email: string): Role {
  return email.trim().toLowerCase() === getEnv().ADMIN_EMAIL ? "ADMIN" : "USER";
}

/**
 * Espelha o usuário do Supabase no banco, com o mesmo id (D-01). Roda a cada login e
 * recalcula o papel, para que trocar o `ADMIN_EMAIL` tenha efeito no login seguinte.
 */
export function syncUser(identity: AuthIdentity): Promise<UserRecord> {
  const email = identity.email.trim().toLowerCase();
  return upsertUser({
    id: identity.id,
    email,
    role: roleForEmail(email),
    name: identity.name ?? null,
  });
}

export function getUserById(id: string): Promise<UserRecord | null> {
  return findUserById(id);
}
