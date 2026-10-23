import { getPublicSurvey } from "@/features/responses/service";
import { json, withRoute } from "@/lib/http";

// Pesquisa para responder (8.3). Encerrada: 200 com status CLOSED e sem perguntas.
export const GET = withRoute<RouteContext<"/api/v1/public/surveys/[slug]">>(
  async (_request, { params }) => {
    const { slug } = await params;
    return json(await getPublicSurvey(slug));
  },
);
