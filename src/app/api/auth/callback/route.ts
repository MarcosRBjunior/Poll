import { syncUser } from "@/features/users/service";
import { afterLoginPath } from "@/lib/auth";
import { withRoute } from "@/lib/http";
import { logger } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Volta do GitHub ou do link por e-mail: troca o código pela sessão, espelha o User
// local (mesmo id do Supabase) e recalcula o papel pelo ADMIN_EMAIL (RF-18, 8.8).
// Response.redirect tem cabeçalhos imutáveis; withRoute precisa acrescentar o x-request-id.
const redirectTo = (url: URL) =>
  new Response(null, { status: 302, headers: { location: url.href } });

export const GET = withRoute(async (request, _context, { requestId }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  const fail = (reason: string, error?: unknown) => {
    logger.warn("login callback failed", { requestId, reason, error });
    const login = new URL("/login", url.origin);
    login.searchParams.set("error", "callback");
    if (next) login.searchParams.set("next", next);
    return redirectTo(login);
  };

  if (!code) return fail("missing code");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user?.email) return fail("exchange", error);

  try {
    const user = await syncUser({
      id: data.user.id,
      email: data.user.email,
      name: (data.user.user_metadata.full_name as string | undefined) ?? null,
    });
    return redirectTo(new URL(afterLoginPath(next, user.role), url.origin));
  } catch (syncError) {
    await supabase.auth.signOut();
    return fail("sync user", syncError);
  }
});
