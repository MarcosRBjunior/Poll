import { getTrends } from "@/features/trends/service";
import { requireAdmin } from "@/lib/auth";
import { json, searchQuery, withRoute } from "@/lib/http";

// Painel de tendências (8.5, RF-17): só o administrador, sobre as pesquisas dele.
export const GET = withRoute(async (request) => {
  const admin = await requireAdmin();
  return json(await getTrends(admin.id, searchQuery(request)));
});
