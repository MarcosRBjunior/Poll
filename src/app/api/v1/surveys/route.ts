import { SURVEY_BODY_MAX_BYTES } from "@/features/surveys/schemas";
import { createSurvey } from "@/features/surveys/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";

// Criar rascunho (8.4, RF-05).
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await readJson(request, SURVEY_BODY_MAX_BYTES);
  return json(await createSurvey(admin.id, body), { status: 201 });
});
