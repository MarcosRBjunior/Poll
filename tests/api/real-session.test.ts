import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { syncUser } from "@/features/users/service";
import { GET } from "../fixtures/admin-route";
import { resetDatabase } from "../fixtures/db";
import { hasTestSupabase, signInCookies, testSupabase, useCookies } from "../fixtures/session";

// CT-19 com JWT de verdade: login por senha no projeto Supabase de teste e validação
// com getClaims() no cliente real de src/lib/supabase/server.ts. Só `cookies()` é trocado.
vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);

const call = () => GET(new Request("http://localhost/api/v1/admin/teste"), undefined);

describe.skipIf(!hasTestSupabase)("sessão real do Supabase (CT-19)", () => {
  let admin: Awaited<ReturnType<typeof signInCookies>>;
  let user: Awaited<ReturnType<typeof signInCookies>>;

  beforeAll(async () => {
    [admin, user] = await Promise.all([
      signInCookies(testSupabase.admin),
      signInCookies(testSupabase.user),
    ]);
  });

  beforeEach(async () => {
    await resetDatabase();
    await syncUser({ id: admin.userId, email: admin.email });
    await syncUser({ id: user.userId, email: user.email });
  });

  it("sem cookie de sessão responde 401", async () => {
    useCookies([]);
    expect((await call()).status).toBe(401);
  });

  it("usuário comum logado recebe 404", async () => {
    useCookies(user.cookies);
    expect((await call()).status).toBe(404);
  });

  it("administrador logado passa", async () => {
    useCookies(admin.cookies);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: admin.userId });
  });

  it("cookie adulterado conta como sem sessão (401)", async () => {
    useCookies(admin.cookies.map((c) => ({ ...c, value: c.value.slice(0, -8) + "AAAAAAAA" })));
    expect((await call()).status).toBe(401);
  });
});
