import { getPublicTexts } from "@/features/results/service";
import { json, searchQuery, withRoute } from "@/lib/http";

// Comentários públicos (8.3, RN-23): só o texto e a data de envio.
export const GET = withRoute<
  RouteContext<"/api/v1/public/surveys/[slug]/questions/[questionId]/texts">
>(async (request, { params }) => {
  const { slug, questionId } = await params;
  return json(await getPublicTexts(slug, questionId, searchQuery(request)));
});
