import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../fixtures/admin-route";
import { createUser, resetDatabase } from "../fixtures/db";
import { expectAdminOnly } from "../fixtures/permission";
import { fakeAuth, sessionAs, supabaseDown } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const call = () => GET(new Request("http://localhost/api/v1/admin/teste"), undefined);

beforeEach(resetDatabase);

describe("requireAdmin na API de gestão (CT-19)", () => {
  it("sem sessão 401, usuário comum 404, administrador passa", async () => {
    const response = await expectAdminOnly(call);
    expect(response.status).toBe(200);
  });

  it("o 404 do usuário comum é igual ao de rota inexistente", async () => {
    sessionAs((await createUser()).id);
    const body = await (await call()).json();
    expect(body.error).toMatchObject({ code: "NOT_FOUND", message: "Recurso não encontrado." });
  });

  it("sessão válida sem User local conta como sem sessão (401)", async () => {
    sessionAs("00000000-0000-4000-8000-000000000000");
    expect((await call()).status).toBe(401);
  });

  it("o papel vem do banco, não do token", async () => {
    const user = await createUser({ role: "USER" });
    fakeAuth.getClaims.mockResolvedValue({
      data: { claims: { sub: user.id, role: "ADMIN", app_metadata: { role: "ADMIN" } } },
      error: null,
    });
    expect((await call()).status).toBe(404);
  });

  it("Supabase fora do ar responde 401, sem 500", async () => {
    supabaseDown();
    expect((await call()).status).toBe(401);
  });
});
