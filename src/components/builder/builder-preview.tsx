"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import { QuestionRenderer } from "@/components/questions/question-renderer";
import type { FormValue } from "@/features/responses/schemas";
import { toPreviewQuestion, type BuilderControl } from "./form-values";

/**
 * Preview ao vivo (US-5.3): as perguntas do formulário renderizadas com os mesmos
 * componentes do formulário público. Dá para clicar, mas nada é enviado.
 */
export function BuilderPreview({ control }: { control: BuilderControl }) {
  const [title, description, questions] = useWatch({
    control,
    name: ["title", "description", "questions"],
  });
  const [answers, setAnswers] = useState<Record<string, FormValue>>({});

  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-6">
      <p className="text-xs font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
        Preview: o que o participante verá
      </p>
      <header className="flex flex-col gap-2">
        <h2 id="preview-title" className="text-xl font-semibold break-words">
          {title.trim() || "Pesquisa sem título"}
        </h2>
        {description.trim() && (
          <p className="whitespace-pre-line text-zinc-700 dark:text-zinc-300">{description}</p>
        )}
      </header>
      {questions.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">As perguntas aparecem aqui.</p>
      ) : (
        questions.map((q, index) => {
          const question = toPreviewQuestion(q, index);
          const empty = question.type === "MULTIPLE_CHOICE" ? [] : "";
          return (
            <QuestionRenderer
              key={index}
              question={question}
              value={answers[question.id] ?? empty}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          );
        })
      )}
    </section>
  );
}
