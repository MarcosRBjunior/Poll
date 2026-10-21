import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Cookies de sessão do Supabase: `sb-<projeto>-auth-token`, às vezes em pedaços (`.0`, `.1`). */
export function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(({ name }) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

/**
 * Renova a sessão do Supabase e grava os cookies novos na resposta.
 * Sem cookie de sessão não há o que renovar: o visitante anônimo nunca depende do
 * Supabase, e páginas públicas seguem no ar se ele cair (RF-18, critério 4).
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!hasSessionCookie(request)) return response;

  const env = getEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet, headers) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    },
  );

  try {
    // getClaims valida o JWT e, se estiver para expirar, renova a sessão (chamando setAll).
    await supabase.auth.getClaims();
  } catch (error) {
    logger.warn("supabase unavailable in proxy", { error });
  }
  return response;
}
