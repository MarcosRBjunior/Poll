import { deleteGroup, updateGroup } from "@/features/groups/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";

// Renomear ou descrever (8.6, RF-16).
export const PATCH = withRoute<RouteContext<"/api/v1/groups/[id]">>(async (request, { params }) => {
  assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await readJson(request, 8 * 1024);
  const { id } = await params;
  return json(await updateGroup(admin.id, id, body));
});

// Excluir (8.6, RN-21): as pesquisas do grupo ficam sem grupo.
export const DELETE = withRoute<RouteContext<"/api/v1/groups/[id]">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteGroup(admin.id, id);
    return new Response(null, { status: 204 });
  },
);
