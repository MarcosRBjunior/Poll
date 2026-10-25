import { getAdminTexts } from "@/features/results/service";
import { requireAdmin } from "@/lib/auth";
import { json, searchQuery, withRoute } from "@/lib/http";

// Textos paginados de uma pergunta, inclusive de rascunho (8.5, RF-12).
export const GET = withRoute<RouteContext<"/api/v1/surveys/[id]/questions/[questionId]/texts">>(
  async (request, { params }) => {
    const admin = await requireAdmin();
    const { id, questionId } = await params;
    return json(await getAdminTexts(admin.id, id, questionId, searchQuery(request)));
  },
);
