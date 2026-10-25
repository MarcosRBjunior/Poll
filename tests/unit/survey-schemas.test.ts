import { describe, expect, it } from "vitest";
import { newQuestion, surveyInputSchema } from "@/features/surveys/schemas";

const issues = (input: unknown) =>
  (surveyInputSchema.safeParse(input).error?.issues ?? []).map((i) => [
    i.path.join("."),
    i.message,
  ]);

const choice = (overrides: Record<string, unknown> = {}) => ({
  type: "MULTIPLE_CHOICE",
  title: "Ferramentas?",
  required: true,
  options: [
    { label: "Vite", value: "" },
    { label: "Jest", value: "" },
    { label: "Bun", value: "" },
  ],
  ...overrides,
});

describe("surveyInputSchema (RF-05, RF-06, RF-07)", () => {
  it("aceita rascunho sem perguntas e com pergunta de escolha sem opções", () => {
    expect(surveyInputSchema.safeParse({ title: "Pesquisa", questions: [] }).success).toBe(true);
    const draft = surveyInputSchema.parse({
      title: "  Pesquisa  ",
      description: "   ",
      questions: [{ ...choice(), type: "SINGLE_CHOICE", options: [] }],
    });
    expect(draft).toMatchObject({ title: "Pesquisa", description: null, isListed: false });
  });

  it("título, enunciado, ajuda e rótulo têm limites com o erro no campo", () => {
    expect(
      issues({
        title: "ab",
        questions: [
          {
            ...choice(),
            title: "ok",
            helpText: "x".repeat(501),
            options: [{ label: " ", value: "" }],
          },
        ],
      }),
    ).toEqual([
      ["title", "Use pelo menos 3 caracteres."],
      ["questions.0.title", "Use pelo menos 3 caracteres."],
      ["questions.0.helpText", "Use no máximo 500 caracteres."],
      ["questions.0.options.0.label", "Escreva o texto da opção."],
    ]);
  });

  it("RN-03: rótulo repetido, sem diferenciar maiúsculas nem espaços", () => {
    expect(
      issues({
        title: "Pesquisa",
        questions: [choice({ options: [{ label: "Vite" }, { label: " vite " }] })],
      }),
    ).toEqual([["questions.0.options.1.label", "Já existe uma opção com este texto."]]);
  });

  it("RF-06 (3): limites incoerentes de seleção", () => {
    expect(
      issues({
        title: "Pesquisa",
        questions: [choice({ minSelections: "3", maxSelections: "2" })],
      }),
    ).toEqual([["questions.0.minSelections", "O mínimo não pode passar do máximo."]]);
    expect(issues({ title: "Pesquisa", questions: [choice({ maxSelections: 4 })] })).toEqual([
      ["questions.0.maxSelections", "O máximo não pode passar do número de opções."],
    ]);
  });

  it("limites só ficam em múltipla escolha; texto não tem opções", () => {
    const parsed = surveyInputSchema.parse({
      title: "Pesquisa",
      questions: [choice({ type: "SINGLE_CHOICE", maxSelections: "1" })],
    });
    expect(parsed.questions[0]).toMatchObject({ minSelections: null, maxSelections: null });
    expect(issues({ title: "Pesquisa", questions: [choice({ type: "SHORT_TEXT" })] })).toEqual([
      ["questions.0.options", "Pergunta de texto não tem opções."],
    ]);
  });

  it("RF-07: valor decimal com vírgula, vazio vira null, até 2 casas", () => {
    const parsed = surveyInputSchema.parse({
      title: "Pesquisa",
      questions: [
        choice({
          options: [
            { label: "A", value: "1,5" },
            { label: "B", value: "" },
            { label: "C", value: 3 },
          ],
        }),
      ],
    });
    expect(parsed.questions[0]!.options.map((o) => o.value)).toEqual([1.5, null, 3]);
    expect(
      issues({
        title: "Pesquisa",
        questions: [
          choice({
            options: [
              { label: "A", value: "abc" },
              { label: "B", value: "1.234" },
            ],
          }),
        ],
      }).map(([path]) => path),
    ).toEqual(["questions.0.options.0.value", "questions.0.options.1.value"]);
  });

  it("até 50 perguntas e 30 opções", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ label: `Opção ${i}` }));
    expect(issues({ title: "Pesquisa", questions: [choice({ options: many })] })[0]).toEqual([
      "questions.0.options",
      "Use no máximo 30 opções.",
    ]);
    const questions = Array.from({ length: 51 }, () => choice());
    expect(issues({ title: "Pesquisa", questions })[0]?.[0]).toBe("questions");
  });

  it("RN-08: padrão ao criar é obrigatória para escolha e opcional para texto", () => {
    expect(newQuestion("SINGLE_CHOICE")).toMatchObject({ required: true });
    expect(newQuestion("LONG_TEXT")).toMatchObject({ required: false, options: [] });
  });
});
