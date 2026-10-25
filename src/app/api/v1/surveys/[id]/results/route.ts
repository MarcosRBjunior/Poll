import { getAdminResults } from "@/features/results/service";
import { requireAdmin } from "@/lib/auth";
import { json, searchQuery, withRoute } from "@/lib/http";

// Painel do administrador (8.5, RF-12), inclusive para rascunho.
export const GET = withRoute<RouteContext<"/api/v1/surveys/[id]/results">>(
  async (request, { params }) => {
    const admin = await requireAdmin();
    const { id } = await params;
    return json(await getAdminResults(admin.id, id, searchQuery(request)));
  },
);
