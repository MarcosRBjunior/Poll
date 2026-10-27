import { cookies } from "next/headers";
import { MAX_BODY_BYTES } from "@/features/responses/schemas";
import { submitResponse } from "@/features/responses/service";
import { getCurrentUser } from "@/lib/auth";
import { assertSameOrigin, json, readJson, withRoute } from "@/lib/http";
import {
  clientIp,
  isRespondentToken,
  newRespondentToken,
  RESPONDENT_COOKIE,
  respondentCookieOptions,
} from "@/lib/respondent";

// Envio de respostas (RF-03, RF-04). A sessão nunca é exigida (D-02).
export const POST = withRoute<RouteContext<"/api/v1/public/surveys/[slug]/responses">>(
  async (request, { params }) => {
    assertSameOrigin(request);
    const body = await readJson(request, MAX_BODY_BYTES); // passo 1 da 8.3: até 64 KB
    const { slug } = await params;

    // O proxy cria o cookie na visita à página; quem chama a API direto ganha um aqui.
    const cookieStore = await cookies();
    let token = cookieStore.get(RESPONDENT_COOKIE)?.value;
    if (!isRespondentToken(token)) {
      token = newRespondentToken();
      cookieStore.set(RESPONDENT_COOKIE, token, respondentCookieOptions);
    }

    // Login é opcional (D-02); com sessão, o envio grava a conta (US-4.3).
    const user = await getCurrentUser();
    const result = await submitResponse({
      slug,
      body,
      respondentToken: token,
      ip: clientIp(request),
      userId: user?.id,
    });
    return json(
      { id: result.id, submittedAt: result.submittedAt.toISOString() },
      { status: result.created ? 201 : 200 },
    );
  },
);
