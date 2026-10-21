import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * Cliente do Supabase para Server Components, Route Handlers e Server Actions.
 * Um por requisição. Server Components não podem gravar cookies: a renovação da
 * sessão fica com o proxy (src/proxy.ts), então a falha ao gravar é ignorada aqui.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const env = getEnv();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Chamado de um Server Component: o proxy grava os cookies renovados.
          }
        },
      },
    },
  );
}
