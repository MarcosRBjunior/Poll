import { vi } from "vitest";

// Cliente Supabase falso para os testes de API que não precisam de login real.
// Uso: vi.mock("@/lib/supabase/server", async () => (await import("../fixtures/supabase-mock")).supabaseServerMock)

export const fakeAuth = {
  getClaims: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
};

export const supabaseServerMock = {
  createSupabaseServerClient: vi.fn(async () => ({ auth: fakeAuth })),
};

/** Define quem está logado: o id de um User do banco, ou null para sem sessão. */
export function sessionAs(userId: string | null) {
  fakeAuth.getClaims.mockResolvedValue(
    userId ? { data: { claims: { sub: userId } }, error: null } : { data: null, error: null },
  );
}

/** Simula o Supabase fora do ar. */
export function supabaseDown() {
  fakeAuth.getClaims.mockRejectedValue(new TypeError("fetch failed"));
}
