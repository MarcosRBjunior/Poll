import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/complete/route";
import { db, resetDatabase } from "../fixtures/db";
import { fakeAuth, sessionAs } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
const adminEmail = process.env.ADMIN_EMAIL ?? "";

function complete(body: unknown = {}, origin: string | null = ORIGIN) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return POST(
    new Request(`${ORIGIN}/api/auth/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
    undefined,
  );
}

/** Sessão confirmada pelo código: o JWT traz id, e-mail e nome. */
function signedInAs(email: string, id: string = randomUUID()) {
  fakeAuth.getClaims.mockResolvedValue({
    data: { claims: { sub: id, email, user_metadata: { full_name: "Nome" } } },
    error: null,
  });
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe("POST /api/auth/complete (login por código, D-01)", () => {
  it("cria o User do administrador e manda para /admin", async () => {
    const id = signedInAs(adminEmail.toUpperCase());
    const response = await complete();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ redirectTo: "/admin" });
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({
      email: adminEmail,
      role: "ADMIN",
      name: "Nome",
    });
  });

  it("usuário comum vira USER e volta à página de origem", async () => {
    const id = signedInAs("pessoa@example.com");
    const response = await complete({ next: "/s/minha-pesquisa" });
    expect(await response.json()).toEqual({ redirectTo: "/s/minha-pesquisa" });
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({ role: "USER" });
  });

  it("ignora destino externo (redirecionamento aberto)", async () => {
    signedInAs("pessoa@example.com");
    const response = await complete({ next: "//evil.example" });
    expect(await response.json()).toEqual({ redirectTo: "/requests" });
  });

  it("sem sessão: 401 e nada gravado", async () => {
    sessionAs(null);
    const response = await complete();
    expect(response.status).toBe(401);
    expect(await db.user.count()).toBe(0);
  });

  it("outra origem: 403 antes de ler a sessão", async () => {
    signedInAs("pessoa@example.com");
    const response = await complete({}, "https://evil.example");
    expect(response.status).toBe(403);
    expect(fakeAuth.getClaims).not.toHaveBeenCalled();
  });

  it("falha ao gravar o User encerra a sessão do Supabase", async () => {
    signedInAs("pessoa@example.com", "nao-e-uuid");
    const response = await complete();
    expect(response.status).toBe(500);
    expect(fakeAuth.signOut).toHaveBeenCalled();
  });
});
