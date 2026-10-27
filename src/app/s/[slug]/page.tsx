import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { SurveyForm } from "@/components/questions/survey-form";
import { getSurveyForRespondent } from "@/features/responses/service";
import { getCurrentUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { isRespondentToken, RESPONDENT_COOKIE } from "@/lib/respondent";

// Uma busca por requisição, dividida entre o título da aba e a página.
const loadSurvey = cache(async (slug: string) => {
  const [cookieStore, user] = await Promise.all([cookies(), getCurrentUser()]);
  const token = cookieStore.get(RESPONDENT_COOKIE)?.value;
  try {
    const found = await getSurveyForRespondent(
      slug,
      isRespondentToken(token) ? token : undefined,
      user?.id,
    );
    return { ...found, signedIn: user !== null };
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const found = await loadSurvey((await params).slug);
  return { title: found ? `${found.survey.title} — Poll` : "Pesquisa não encontrada — Poll" };
}

// T02: responder pesquisa (RF-01 a RF-03).
export default function SurveyPage({ params }: PageProps<"/s/[slug]">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <Suspense fallback={<p className="text-zinc-600 dark:text-zinc-400">Carregando pesquisa…</p>}>
        <SurveyContent params={params} />
      </Suspense>
    </main>
  );
}

async function SurveyContent({ params }: Pick<PageProps<"/s/[slug]">, "params">) {
  const { slug } = await params;
  const found = await loadSurvey(slug);
  if (!found) notFound();
  const { survey, alreadyResponded, signedIn } = found;

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight break-words">{survey.title}</h1>
        {survey.description && (
          <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">
            {survey.description}
          </p>
        )}
        {survey.status === "PUBLISHED" && !alreadyResponded && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Perguntas marcadas com <span aria-hidden="true">*</span>
            <span className="sr-only">asterisco</span> são obrigatórias.
          </p>
        )}
      </header>

      {survey.status === "CLOSED" ? (
        <p role="status" className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
          Esta pesquisa não aceita mais respostas.{" "}
          <Link href={`/s/${survey.slug}/results`} className="underline">
            Ver resultados
          </Link>
        </p>
      ) : alreadyResponded ? (
        <p role="status" className="rounded-md border border-zinc-300 p-4 dark:border-zinc-700">
          Você já respondeu esta pesquisa. Obrigado pela participação!{" "}
          <Link href={`/s/${survey.slug}/results`} className="underline">
            Ver resultados
          </Link>
        </p>
      ) : (
        <>
          {/* Login opcional (D-02): com conta, a mesma pessoa não responde de novo em outro navegador. */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {signedIn ? (
              "Você está respondendo com a sua conta."
            ) : (
              <>
                Responder é anônimo.{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/s/${survey.slug}`)}`}
                  className="underline"
                >
                  Entrar para responder com a sua conta
                </Link>
              </>
            )}
          </p>
          <SurveyForm slug={survey.slug} questions={survey.questions} />
        </>
      )}
    </>
  );
}
