import { createRequest, listRequestQueue } from "@/features/requests/service";
import { requireAdmin, requireUser } from "@/lib/auth";
import { assertSameOrigin, json, readJson, searchQuery, withRoute } from "@/lib/http";
import { withSurveyUrl } from "./survey-url";

/** Corpo de uma solicitação: os textos somam no máximo ~5,3 mil caracteres (RF-21). */
const REQUEST_BODY_MAX_BYTES = 32 * 1024;

// Solicitar pesquisa (8.7, RF-21): qualquer usuário com conta; 429 a partir da 4ª do dia.
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const body = await readJson(request, REQUEST_BODY_MAX_BYTES);
  return json(withSurveyUrl(request, await createRequest(user.id, body)), { status: 201 });
});

// Fila do administrador (8.7, RF-22).
export const GET = withRoute(async (request) => {
  await requireAdmin();
  return json(await listRequestQueue(searchQuery(request)));
});
