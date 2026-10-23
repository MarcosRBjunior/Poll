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
});
