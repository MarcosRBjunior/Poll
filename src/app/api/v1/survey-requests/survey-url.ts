import type { MyRequest } from "@/features/requests/service";

/** `surveyPath` vira o link completo, com a origem da requisição (8.7: `surveyUrl`). */
export function withSurveyUrl(request: Request, { surveyPath, ...rest }: MyRequest) {
  return { ...rest, surveyUrl: surveyPath ? new URL(surveyPath, request.url).toString() : null };
}
