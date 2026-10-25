import { SURVEY_BODY_MAX_BYTES } from "@/features/surveys/schemas";
import { deleteSurvey, getSurveyDetail, updateSurvey } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";

// Abrir para edição (8.4).
export const GET = withRoute<RouteContext<"/api/v1/surveys/[id]">>(async (_request, { params }) => {
  const admin = await requireAdmin();
  const { id } = await params;
  return json(await getSurveyDetail(admin.id, id));
});

// Salvar edição (8.4, RF-09): 409 com version desatualizada, 422 no modo restrito.
export const PUT = withRoute<RouteContext<"/api/v1/surveys/[id]">>(async (request, { params }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await readJson(request, SURVEY_BODY_MAX_BYTES);
  const { id } = await params;
  return json(await updateSurvey(admin.id, id, body));
});

// Exclusão lógica (8.4, RF-10).
export const DELETE = withRoute<RouteContext<"/api/v1/surveys/[id]">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteSurvey(admin.id, id);
    return new Response(null, { status: 204 });
  },
);
