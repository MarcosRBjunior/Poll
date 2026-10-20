import { checkHealth } from "@/features/health/service";
import { json, withRoute } from "@/lib/http";

export const GET = withRoute(async () => {
  const status = await checkHealth();
  return json(
    { status },
    { status: status === "ok" ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
});
