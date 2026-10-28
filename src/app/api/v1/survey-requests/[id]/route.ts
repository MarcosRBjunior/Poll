import { updateRequestByAdmin } from "@/features/requests/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";

// Mudar status e nota (8.7, RF-22): só o administrador; transição inválida → 409.
export const PATCH = withRoute<RouteContext<"/api/v1/survey-requests/[id]">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJson(request, 8 * 1024);
    const { id } = await params;
    return json(await updateRequestByAdmin(id, body));
  },
);
