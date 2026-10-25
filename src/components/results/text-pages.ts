import type { SurveyResults } from "@/features/results/service";
import type { TextPage } from "./text-answers";

/** Itens mostrados de início em cada lista de textos. */
export const FIRST_TEXTS_PAGE_SIZE = 10;

type Loader = (
  questionId: string,
  query: { pageSize: string },
) => Promise<{ data: { text: string; submittedAt: Date }[]; total: number; pageSize: number }>;

/** Primeira página de cada pergunta de texto com respostas, já serializável para o cliente. */
export async function firstTextPages(
  results: SurveyResults,
  load: Loader,
): Promise<Record<string, TextPage>> {
  const textQuestions = results.questions.filter((q) => (q.textCount ?? 0) > 0);
  const pages = await Promise.all(
    textQuestions.map((q) => load(q.id, { pageSize: String(FIRST_TEXTS_PAGE_SIZE) })),
  );
  return Object.fromEntries(
    pages.map((page, i) => [
      textQuestions[i]!.id,
      {
        total: page.total,
        pageSize: page.pageSize,
        data: page.data.map((t) => ({ text: t.text, submittedAt: t.submittedAt.toISOString() })),
      },
    ]),
  );
}
