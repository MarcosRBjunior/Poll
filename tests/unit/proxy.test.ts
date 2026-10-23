import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

// vitest.config.mts aponta o Supabase para http://127.0.0.1:1, que não responde
// quando não há projeto de teste. Aqui o endereço é forçado para garantir isso.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:1");

const session = { "sb-teste-auth-token": "base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0" };

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  return new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} });
}

describe("proxy", () => {
  it("manda /admin sem sessão para /login guardando a origem", async () => {
    const response = await proxy(request("/admin/surveys?page=2"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?next=%2Fadmin%2Fsurveys%3Fpage%3D2",
    );
  });

  it("deixa passar página pública sem tocar no Supabase", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await proxy(request("/"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("com o Supabase fora do ar, segue a requisição em vez de falhar (RF-18, 4)", async () => {
    const response = await proxy(request("/", session));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("com cookie de sessão, /admin passa para a guarda do servidor decidir", async () => {
    const response = await proxy(request("/admin", session));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("cria o cookie de respondente na primeira visita a uma pesquisa (spec 6.5)", async () => {
    const response = await proxy(request("/s/minha-pesquisa"));
    const cookie = response.cookies.get("poll_rid");
    expect(cookie?.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(cookie?.maxAge).toBe(365 * 24 * 60 * 60);
  });

  it("mantém um cookie válido e troca um adulterado", async () => {
    const valid = "3f6c1d2e-8a4b-4c1e-9f0a-2b7d5e8c9a10";
    expect(
      (await proxy(request("/s/x", { poll_rid: valid }))).cookies.get("poll_rid"),
    ).toBeUndefined();
    const replaced = (await proxy(request("/s/x", { poll_rid: "qualquer-coisa" }))).cookies.get(
      "poll_rid",
    );
    expect(replaced?.value).not.toBe("qualquer-coisa");
  });

  it("não cria cookie fora de /s/*", async () => {
    expect((await proxy(request("/"))).cookies.get("poll_rid")).toBeUndefined();
  });
});
