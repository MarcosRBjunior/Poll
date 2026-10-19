import { json, withRoute } from "@/lib/http";

// A checagem do banco (503 se não responder) entra na F2.
export const GET = withRoute(() =>
  json({ status: "ok" }, { headers: { "cache-control": "no-store" } }),
);
