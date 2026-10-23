import { createServerClient } from "@supabase/ssr";

// Projeto Supabase de teste, com login por senha e dois usuários criados à mão.
export const testSupabase = {
  url: process.env.TEST_SUPABASE_URL,
  key: process.env.TEST_SUPABASE_PUBLISHABLE_KEY,
  admin: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD },
  user: { email: process.env.TEST_USER_EMAIL, password: process.env.TEST_USER_PASSWORD },
};

export const hasTestSupabase = [
  testSupabase.url,
  testSupabase.key,
  testSupabase.admin.email,
  testSupabase.admin.password,
  testSupabase.user.email,
  testSupabase.user.password,
].every((value) => typeof value === "string" && value !== "");

if (!hasTestSupabase && process.env.CI) {
  throw new Error("CI sem as credenciais do projeto Supabase de teste (secrets TEST_*).");
}

/** Faz login de verdade no projeto de teste e devolve os cookies de sessão do @supabase/ssr. */
export async function signInCookies(account: { email?: string; password?: string }) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(testSupabase.url ?? "", testSupabase.key ?? "", {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (toSet) => {
        for (const { name, value } of toSet) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: account.email ?? "",
    password: account.password ?? "",
  });
  if (error) throw error;
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    cookies: [...jar].map(([name, value]) => ({ name, value })),
  };
}
