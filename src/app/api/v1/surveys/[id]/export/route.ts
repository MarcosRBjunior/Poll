import { exportResponses } from "@/features/results/service";
import { requireAdmin } from "@/lib/auth";
import { searchQuery, withRoute } from "@/lib/http";

// Download do CSV (8.5, RF-15). O arquivo sai em pedaços, sem montar tudo na memória.
export const GET = withRoute<RouteContext<"/api/v1/surveys/[id]/export">>(
  async (request, { params }) => {
    const admin = await requireAdmin();
    const { id } = await params;
    const { filename, chunks } = await exportResponses(admin.id, id, searchQuery(request));
    const encoder = new TextEncoder();
    const iterator = chunks[Symbol.asyncIterator]();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      },
      async cancel() {
        await iterator.return?.();
      },
    });
    return new Response(body, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  },
);
