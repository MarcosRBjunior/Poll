import { vi } from "vitest";

// Sessão nos testes de API. `next/headers` só existe dentro de uma requisição do Next,
// então os testes trocam `cookies()` por um pote de cookies em memória.

export type Cookie = { name: string; value: string };

export const cookieJar = new Map<string, string>();

export const cookieStoreMock = {
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
  set: (name: string, value: string) => void cookieJar.set(name, value),
};

/** Coloque no topo do arquivo de teste: `vi.mock("next/headers", () => nextHeadersMock)`. */
export const nextHeadersMock = { cookies: vi.fn(async () => cookieStoreMock) };

export function setCookies(cookies: Cookie[]) {
  cookieJar.clear();
  for (const { name, value } of cookies) cookieJar.set(name, value);
}

export { hasTestSupabase, signInCookies, testSupabase } from "./supabase-test-project";
