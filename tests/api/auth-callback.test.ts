import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/callback/route";
import { db, resetDatabase } from "../fixtures/db";
import { fakeAuth } from "../fixtures/supabase-mock";

vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const adminEmail = process.env.ADMIN_EMAIL ?? "";

function callback(query: string) {
  return GET(new Request(`http://localhost/api/auth/callback?${query}`), undefined);
}

function exchangeAs(email: string, id = randomUUID()) {
  fakeAuth.exchangeCodeForSession.mockResolvedValue({
    data: { user: { id, email, user_metadata: { full_name: "Nome" } }, session: {} },
    error: null,
  });
  return id;
}

beforeEach(async () => {
  await resetDatabase();
  vi.clearAllMocks();
});

describe("GET /api/auth/callback", () => {
  it("cria o User do administrador e manda para /admin", async () => {
    const id = exchangeAs(adminEmail);
    const response = await callback("code=abc");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/admin");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(fakeAuth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({ role: "ADMIN" });
  });

  it("cria o usuário comum como USER e manda para /requests", async () => {
    const id = exchangeAs("pessoa@example.com");
    const response = await callback("code=abc");
    expect(response.headers.get("location")).toBe("http://localhost/requests");
    expect(await db.user.findUnique({ where: { id } })).toMatchObject({ role: "USER" });
  });

  it("volta à página de origem", async () => {
    exchangeAs("pessoa@example.com");
    const response = await callback(`code=abc&next=${encodeURIComponent("/admin/surveys")}`);
    expect(response.headers.get("location")).toBe("http://localhost/admin/surveys");
  });

  it("ignora next externo", async () => {
    exchangeAs("pessoa@example.com");
    const response = await callback(`code=abc&next=${encodeURIComponent("//evil.example")}`);
    expect(response.headers.get("location")).toBe("http://localhost/requests");
  });

  it("sem code volta para /login com erro", async () => {
    const response = await callback("next=/admin");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?error=callback&next=%2Fadmin",
    );
    expect(fakeAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("code recusado pelo Supabase volta para /login sem criar User", async () => {
    fakeAuth.exchangeCodeForSession.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("invalid code"),
    });
    const response = await callback("code=velho");
    expect(response.headers.get("location")).toBe("http://localhost/login?error=callback");
    expect(await db.user.count()).toBe(0);
  });

  it("falha ao gravar o User encerra a sessão e volta para /login", async () => {
    exchangeAs(adminEmail);
    // Já existe outro User com esse e-mail: o upsert viola o e-mail único.
    await db.user.create({ data: { id: randomUUID(), email: adminEmail } });
    const response = await callback("code=abc");
    expect(response.headers.get("location")).toBe("http://localhost/login?error=callback");
    expect(fakeAuth.signOut).toHaveBeenCalled();
  });
});
