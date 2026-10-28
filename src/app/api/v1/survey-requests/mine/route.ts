import { listMyRequests } from "@/features/requests/service";
import { requireUser } from "@/lib/auth";
import { json, searchQuery, withRoute } from "@/lib/http";
import { withSurveyUrl } from "../survey-url";

// Minhas solicitações (8.7, RF-21): só as próprias.
export const GET = withRoute(async (request) => {
  const user = await requireUser();
  const page = await listMyRequests(user.id, searchQuery(request));
  return json({ ...page, data: page.data.map((r) => withSurveyUrl(request, r)) });
});
