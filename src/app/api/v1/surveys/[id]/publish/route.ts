import { publishSurvey } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, withRoute } from "@/lib/http";

// Publicar (8.4, RF-11): 422 NOT_PUBLISHABLE com a lista de erros; 409 se não for rascunho.
export const POST = withRoute<RouteContext<"/api/v1/surveys/[id]/publish">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    const { publicPath, ...result } = await publishSurvey(admin.id, id);
    return json({ ...result, publicUrl: new URL(publicPath, request.url).toString() });
  },
);
