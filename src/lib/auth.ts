import { unstable_rethrow } from "next/navigation";
import { getUserById, type UserRecord } from "@/features/users/service";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SessionUser = UserRecord;

/**
 * Usuário da sessão atual, ou `null`. A identidade vem do JWT validado com
 * `getClaims()` (nunca `getSession()`); o papel vem do banco, nunca do navegador.
 * Supabase fora do ar conta como sem sessão.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  let userId: string | undefined;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error) logger.warn("invalid session", { error });
    userId = data?.claims.sub;
  } catch (error) {
    unstable_rethrow(error); // prerender: deixa o Next adiar a renderização
    logger.warn("supabase unavailable", { error });
  }
  return userId ? getUserById(userId) : null;
}

/** Exige sessão. Sem sessão: 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Entre para continuar.");
  return user;
}

/**
 * Exige o papel ADMIN em toda rota, página e Server Action de gestão (RN-12).
 * Sem sessão: 401. Com sessão, mas sem papel: 404, para não confirmar que a rota existe.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError("NOT_FOUND", "Recurso não encontrado.");
  return user;
}

/**
 * Destino depois do login: só caminho interno (evita redirecionamento aberto).
 * Sem `next` válido, o administrador vai para /admin e os demais para / (até a F7, /requests).
 */
export function afterLoginPath(next: string | null | undefined, role: UserRecord["role"]): string {
  if (next && /^\/(?![/\\])/.test(next)) return next;
  return role === "ADMIN" ? "/admin" : "/";
}
