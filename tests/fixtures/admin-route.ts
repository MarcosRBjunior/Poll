import { requireAdmin } from "@/lib/auth";
import { json, withRoute } from "@/lib/http";

// Rota de gestão que só existe nos testes: prova o helper de permissão até a F6,
// quando as rotas reais de gestão passam a usar o mesmo expectAdminOnly.
export const GET = withRoute(async () => {
  const admin = await requireAdmin();
  return json({ id: admin.id });
});
