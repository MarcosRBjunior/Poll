import { cookies } from "next/headers";
import { MAX_BODY_BYTES } from "@/features/responses/schemas";
import { submitResponse } from "@/features/responses/service";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, json, withRoute } from "@/lib/http";
import {
  clientIp,
  isRespondentToken,
  newRespondentToken,
  RESPONDENT_COOKIE,
  respondentCookieOptions,
} from "@/lib/respondent";

/** Passo 1 da 8.3: só JSON, até 64 KB. */
async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("BAD_REQUEST", "Envie o corpo como application/json.");
  }
  const tooLarge = () => new AppError("PAYLOAD_TOO_LARGE", "O envio passou do limite de 64 KB.");
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw tooLarge();
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("BAD_REQUEST", "JSON malformado.");
  }
}

// Envio de respostas (RF-03, RF-04). A sessão nunca é exigida (D-02).
export const POST = withRoute<RouteContext<"/api/v1/public/surveys/[slug]/responses">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const body = await readJson(request);
    const { slug } = await params;

    // O proxy cria o cookie na visita à página; quem chama a API direto ganha um aqui.
    const cookieStore = await cookies();
    let token = cookieStore.get(RESPONDENT_COOKIE)?.value;
    if (!isRespondentToken(token)) {
      token = newRespondentToken();
      cookieStore.set(RESPONDENT_COOKIE, token, respondentCookieOptions);
    }

    const result = await submitResponse({
      slug,
      body,
      respondentToken: token,
      ip: clientIp(request),
    });
    return json(
      { id: result.id, submittedAt: result.submittedAt.toISOString() },
      { status: result.created ? 201 : 200 },
    );
  },
);
