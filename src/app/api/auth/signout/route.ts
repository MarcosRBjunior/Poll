import { requireUser } from "@/lib/auth";
import { assertSameOrigin, withRoute } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Encerra a sessão: o Supabase revoga o token e os cookies são apagados (8.8).
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return new Response(null, { status: 204 });
});
