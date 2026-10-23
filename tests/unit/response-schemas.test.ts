import { describe, expect, it } from "vitest";
import {
  buildFormSchema,
  checkAnswers,
  emptyFormValues,
  toAnswers,
  type PublicQuestion,
} from "@/features/responses/schemas";

const options = (...ids: string[]) => ids.map((id) => ({ id, label: id.toUpperCase() }));

const single: PublicQuestion = {
  id: "q1",
  type: "SINGLE_CHOICE",
  title: "Framework?",
  helpText: null,
  required: true,
  minSelections: null,
  maxSelections: null,
  options: options("react", "vue"),
};
const multiple: PublicQuestion = {
  id: "q2",
  type: "MULTIPLE_CHOICE",
  title: "Ferramentas?",
  helpText: null,
  required: true,
  minSelections: 2,
  maxSelections: 3,
  options: options("a", "b", "c", "d"),
};
const short: PublicQuestion = {
  id: "q3",
  type: "SHORT_TEXT",
  title: "Nome do projeto",
  helpText: null,
  required: true,
  minSelections: null,
  maxSelections: null,
  options: [],
};
const comment: PublicQuestion = {
  id: "q4",
  type: "LONG_TEXT",
  title: "Comentário",
  helpText: null,
  required: false,
  minSelections: null,
  maxSelections: null,
  options: [],
};
const questions = [single, multiple, short, comment];

const valid = [
  { questionId: "q1", optionIds: ["react"] },
  { questionId: "q2", optionIds: ["a", "b"] },
  { questionId: "q3", text: "Poll" },
];

const codes = (answers: Parameters<typeof checkAnswers>[1]) =>
  checkAnswers(questions, answers).map((i) => `${i.questionId}:${i.code}`);

describe("checkAnswers", () => {
  it("aceita um envio válido, com a opcional em branco", () => {
    expect(codes(valid)).toEqual([]);
  });

  it("RN-05: escolha única com duas opções", () => {
    expect(codes([{ questionId: "q1", optionIds: ["react", "vue"] }, ...valid.slice(1)])).toEqual([
      "q1:SELECTION_OUT_OF_RANGE",
    ]);
  });

  it("RN-06: múltipla escolha acima do máximo, abaixo do mínimo e opção repetida", () => {
    const withQ2 = (optionIds: string[]) => [valid[0]!, { questionId: "q2", optionIds }, valid[2]!];
    expect(codes(withQ2(["a", "b", "c", "d"]))).toEqual(["q2:SELECTION_OUT_OF_RANGE"]);
    expect(codes(withQ2(["a"]))).toEqual(["q2:SELECTION_OUT_OF_RANGE"]);
    expect(codes(withQ2(["a", "a"]))).toEqual(["q2:SELECTION_OUT_OF_RANGE"]);
  });

  it("RN-07/RN-08: obrigatória vazia e texto só com espaços contam como não respondidas", () => {
    expect(codes([valid[0]!, valid[1]!, { questionId: "q3", text: "  \t\n " }])).toEqual([
      "q3:REQUIRED_MISSING",
    ]);
    expect(codes([])).toEqual([
      "q1:REQUIRED_MISSING",
      "q2:REQUIRED_MISSING",
      "q3:REQUIRED_MISSING",
    ]);
  });

  it("RN-07: texto curto acima de 200 e longo acima de 2.000 caracteres", () => {
    expect(codes([valid[0]!, valid[1]!, { questionId: "q3", text: "x".repeat(201) }])).toEqual([
      "q3:TEXT_TOO_LONG",
    ]);
    expect(codes([...valid, { questionId: "q4", text: "x".repeat(2001) }])).toEqual([
      "q4:TEXT_TOO_LONG",
    ]);
    expect(codes([...valid, { questionId: "q4", text: ` ${"x".repeat(2000)} ` }])).toEqual([]);
  });

  it("recusa pergunta de fora e opção de outra pergunta", () => {
    expect(codes([...valid, { questionId: "outra", text: "x" }])).toEqual([
      "outra:UNKNOWN_QUESTION",
    ]);
    expect(codes([{ questionId: "q1", optionIds: ["a"] }, ...valid.slice(1)])).toEqual([
      "q1:UNKNOWN_OPTION",
    ]);
  });

  it("RN-10: a mesma pergunta duas vezes no envio", () => {
    expect(codes([...valid, valid[0]!])).toEqual(["q1:VALIDATION_ERROR"]);
  });

  it("não aceita texto em pergunta de escolha nem opção em pergunta de texto", () => {
    expect(codes([{ ...valid[0]!, text: "oi" }, ...valid.slice(1)])).toEqual([
      "q1:VALIDATION_ERROR",
    ]);
    expect(
      codes([valid[0]!, valid[1]!, { questionId: "q3", text: "x", optionIds: ["a"] }]),
    ).toEqual(["q3:VALIDATION_ERROR"]);
  });
});

describe("formulário", () => {
  it("toAnswers corta espaços e descarta perguntas em branco", () => {
    const values = {
      ...emptyFormValues(questions),
      q1: "react",
      q2: ["a", "b"],
      q3: "  Poll  ",
      q4: "   ",
    };
    expect(toAnswers(questions, values)).toEqual(valid);
  });

  it("buildFormSchema põe a mensagem no campo da pergunta", () => {
    const result = buildFormSchema(questions).safeParse(emptyFormValues(questions));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["q1", "Responda esta pergunta."],
      ["q2", "Responda esta pergunta."],
      ["q3", "Responda esta pergunta."],
    ]);
  });
});
