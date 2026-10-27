import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/public/surveys/[slug]/responses/route";
import { getSurveyForRespondent } from "@/features/responses/service";
import { createUser, db, resetDatabase } from "../fixtures/db";
import { setCookies } from "../fixtures/session";
import { sessionAs } from "../fixtures/supabase-mock";
import { createPublishedSurvey, validBody, type PublishedSurvey } from "../fixtures/surveys";

vi.mock("next/headers", async () => (await import("../fixtures/session")).nextHeadersMock);
vi.mock(
  "@/lib/supabase/server",
  async () => (await import("../fixtures/supabase-mock")).supabaseServerMock,
);

const ORIGIN = "http://localhost";
let ip = 0;

function submit(slug: string, body: unknown) {
  return POST(
    new Request(`${ORIGIN}/api/v1/public/surveys/${slug}/responses`, {
      method: "POST",
      headers: {
        origin: ORIGIN,
        "content-type": "application/json",
        "x-forwarded-for": `10.2.0.${++ip}`,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) },
  );
}

/** Um navegador novo: cookie de respondente próprio. */
const newBrowser = () => {
  const token = randomUUID();
  setCookies([{ name: "poll_rid", value: token }]);
  return token;
};

let s: PublishedSurvey;
let userId: string;

beforeEach(async () => {
  await resetDatabase();
  s = await createPublishedSurvey();
  userId = (await createUser()).id;
});

describe("CT-17: respondente com login (RF-03 (7), RN-14, US-4.3)", () => {
  it("com sessão, o envio grava a conta", async () => {
    newBrowser();
    sessionAs(userId);
    const response = await submit(s.survey.slug, validBody(s));
    expect(response.status).toBe(201);
    const saved = await db.surveyResponse.findUniqueOrThrow({
      where: { id: (await response.json()).id },
    });
    expect(saved.userId).toBe(userId);
  });

  it("a mesma conta não envia de novo, nem de outro navegador", async () => {
    newBrowser();
    sessionAs(userId);
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);

    const otherToken = newBrowser(); // outro navegador, mesma conta
    const again = await submit(s.survey.slug, validBody(s));
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ALREADY_RESPONDED");
    expect(await db.surveyResponse.count()).toBe(1);

    // A página também avisa, pela conta.
    const page = await getSurveyForRespondent(s.survey.slug, otherToken, userId);
    expect(page.alreadyResponded).toBe(true);
  });

  it("quem respondeu sem conta neste navegador não repete depois de entrar", async () => {
    newBrowser();
    sessionAs(null);
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);

    sessionAs(userId); // mesmo navegador, agora com conta
    const again = await submit(s.survey.slug, validBody(s));
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("ALREADY_RESPONDED");
  });

  it("contas diferentes respondem cada uma uma vez", async () => {
    const other = await createUser();
    newBrowser();
    sessionAs(userId);
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);
    newBrowser();
    sessionAs(other.id);
    expect((await submit(s.survey.slug, validBody(s))).status).toBe(201);
    expect(await db.surveyResponse.count({ where: { userId: { not: null } } })).toBe(2);
  });

  it("dois envios simultâneos da mesma conta em navegadores diferentes: só um grava", async () => {
    sessionAs(userId);
    newBrowser();
    const first = submit(s.survey.slug, validBody(s));
    newBrowser();
    const second = submit(s.survey.slug, validBody(s));
    const statuses = (await Promise.all([first, second])).map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await db.surveyResponse.count()).toBe(1);
  });

  it("Supabase fora do ar: responde como anônimo, sem quebrar o envio", async () => {
    newBrowser();
    const { supabaseDown } = await import("../fixtures/supabase-mock");
    supabaseDown();
    const response = await submit(s.survey.slug, validBody(s));
    expect(response.status).toBe(201);
    expect((await db.surveyResponse.findFirstOrThrow()).userId).toBeNull();
  });
});
