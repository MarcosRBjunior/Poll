"use client";

import type { FormValue, PublicQuestion } from "@/features/responses/schemas";
import { MultipleChoice } from "./multiple-choice";
import { SingleChoice } from "./single-choice";
import { LongText, ShortText } from "./text-answer";

type Props = {
  question: PublicQuestion;
  value: FormValue;
  onChange: (value: FormValue) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
};

/**
 * Escolhe o componente pelo tipo (RF-02). Usado no formulário público e,
 * na F6, no preview do construtor.
 */
export function QuestionRenderer({ question, value, ...rest }: Props) {
  const asText = typeof value === "string" ? value : "";
  switch (question.type) {
    case "SINGLE_CHOICE":
      return <SingleChoice question={question} value={asText} {...rest} />;
    case "MULTIPLE_CHOICE":
      return (
        <MultipleChoice question={question} value={Array.isArray(value) ? value : []} {...rest} />
      );
    case "SHORT_TEXT":
      return <ShortText question={question} value={asText} {...rest} />;
    case "LONG_TEXT":
      return <LongText question={question} value={asText} {...rest} />;
  }
}
