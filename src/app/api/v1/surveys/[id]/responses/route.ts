import { getResponsesTable } from "@/features/results/service";
import { requireAdmin } from "@/lib/auth";
import { json, searchQuery, withRoute } from "@/lib/http";

// Tabela de respostas individuais (8.5, RF-13). Só administrador (RN-23).
export const GET = withRoute<RouteContext<"/api/v1/surveys/[id]/responses">>(
  async (request, { params }) => {
    const admin = await requireAdmin();
    const { id } = await params;
    return json(await getResponsesTable(admin.id, id, searchQuery(request)));
  },
);
