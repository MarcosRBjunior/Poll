import { listPublicSurveys } from "@/features/surveys/service";
import { json, searchQuery, withRoute } from "@/lib/http";

// Vitrine da página inicial (8.3, RF-20).
export const GET = withRoute(async (request) =>
  json(await listPublicSurveys(searchQuery(request))),
);
