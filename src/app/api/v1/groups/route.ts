import { createGroup, listGroups } from "@/features/groups/service";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";

// Listar os grupos do administrador (8.6, RF-16).
export const GET = withRoute(async () => {
  const admin = await requireAdmin();
  return json({ data: await listGroups(admin.id) });
});

// Criar (8.6): nome repetido → 409 NAME_TAKEN.
export const POST = withRoute(async (request) => {
  assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await readJson(request, 8 * 1024);
  return json(await createGroup(admin.id, body), { status: 201 });
});
