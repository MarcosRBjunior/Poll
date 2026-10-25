import { reopenSurvey } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, withRoute } from "@/lib/http";

// Reabrir (8.4, RF-11).
export const POST = withRoute<RouteContext<"/api/v1/surveys/[id]/reopen">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    return json(await reopenSurvey(admin.id, id));
  },
);
