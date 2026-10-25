import { getPublicResults } from "@/features/results/service";
import { json, searchQuery, withRoute } from "@/lib/http";

// Resultados públicos (8.3, RN-23): só agregados, nada de quem respondeu.
export const GET = withRoute<RouteContext<"/api/v1/public/surveys/[slug]/results">>(
  async (request, { params }) => {
    const { slug } = await params;
    return json(await getPublicResults(slug, searchQuery(request)));
  },
);
