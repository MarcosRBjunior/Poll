import { expect } from "vitest";
import { createUser } from "./db";
import { sessionAs } from "./supabase-mock";

/**
 * Toda rota de gestão nasce com este teste (US-4.2): sem sessão → 401,
 * usuário comum → 404 (nunca 403), administrador → passa. Devolve a resposta do administrador.
 * `adminId` é o dono do recurso; sem ele, um administrador novo.
 */
export async function expectAdminOnly(
  call: () => Promise<Response>,
  adminId?: string,
): Promise<Response> {
  sessionAs(null);
  const anonymous = await call();
  expect(anonymous.status).toBe(401);
  expect((await anonymous.json()).error.code).toBe("UNAUTHENTICATED");

  sessionAs((await createUser({ role: "USER" })).id);
  const user = await call();
  expect(user.status).toBe(404);
  expect((await user.json()).error.code).toBe("NOT_FOUND");

  sessionAs(adminId ?? (await createUser({ role: "ADMIN" })).id);
  const admin = await call();
  expect([401, 403, 404]).not.toContain(admin.status);
  return admin;
}
