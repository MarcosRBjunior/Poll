import { completeLoginSchema } from "@/features/users/schemas";
import { syncUser } from "@/features/users/service";
import { afterLoginPath } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Fim do login por código (D-01): o navegador já confirmou o código com o Supabase e tem a
// sessão em cookie. Aqui o servidor valida a sessão com getClaims(), espelha o User local
// (mesmo id) e recalcula o papel pelo ADMIN_EMAIL, como o callback do GitHub (RF-18, 8.8).
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  const { next } = completeLoginSchema.parse(await readJson(request, 4 * 1024));

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || !claims.email) {
    throw new AppError("UNAUTHENTICATED", "Entre para continuar.");
  }

  try {
    const user = await syncUser({
      id: claims.sub,
      email: claims.email,
      name: (claims.user_metadata?.full_name as string | undefined) ?? null,
    });
    return json({ redirectTo: afterLoginPath(next, user.role) });
  } catch (error) {
    await supabase.auth.signOut();
    throw error;
  }
});
