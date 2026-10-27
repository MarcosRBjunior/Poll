import { SURVEY_BODY_MAX_BYTES } from "@/features/surveys/schemas";
import { createSurvey, listSurveys } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, searchQuery, withRoute } from "@/lib/http";

// Criar rascunho (8.4, RF-05).
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await readJson(request, SURVEY_BODY_MAX_BYTES);
  return json(await createSurvey(admin.id, body), { status: 201 });
});

// Listar as pesquisas do administrador (8.4, RF-08).
export const GET = withRoute(async (request) => {
  const admin = await requireAdmin();
  return json(await listSurveys(admin.id, searchQuery(request)));
});
