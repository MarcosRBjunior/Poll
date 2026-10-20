import type { QuestionType } from "@/generated/prisma/client";

// Conteúdo aprovado em D-12 (spec, seção 3). Obrigatoriedade segue RN-08:
// escolha é obrigatória, texto é opcional.

export type SeedOption = { label: string; value?: number };
export type SeedQuestion = { type: QuestionType; title: string; options?: SeedOption[] };
export type SeedSurvey = { title: string; group: string; questions: SeedQuestion[] };

export const JS_GROUP = "Ecossistema JavaScript";
export const ENTERTAINMENT_GROUP = "Entretenimento";

export const seedGroups = [JS_GROUP, ENTERTAINMENT_GROUP];

const labels = (...items: string[]): SeedOption[] => items.map((label) => ({ label }));

export const seedSurveys: SeedSurvey[] = [
  {
    title: "Ferramentas JavaScript favoritas",
    group: JS_GROUP,
    questions: [
      {
        type: "SINGLE_CHOICE",
        title: "Qual framework de interface você mais usa?",
        options: labels("React", "Vue", "Angular", "Svelte", "Solid", "Nenhum"),
      },
      {
        type: "MULTIPLE_CHOICE",
        title: "Quais ferramentas de build você usa?",
        options: labels("Vite", "webpack", "Turbopack", "esbuild", "Rollup", "Nenhuma"),
      },
      {
        type: "MULTIPLE_CHOICE",
        title: "Quais ferramentas de teste você usa?",
        options: labels("Vitest", "Jest", "Playwright", "Cypress", "Testing Library", "Nenhuma"),
      },
      {
        type: "SINGLE_CHOICE",
        title: "Qual é o seu runtime principal?",
        options: labels("Node.js", "Bun", "Deno"),
      },
      {
        type: "SINGLE_CHOICE",
        title: "Qual é a sua satisfação com o ecossistema JavaScript?",
        options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })),
      },
      { type: "LONG_TEXT", title: "Que ferramenta falta no seu dia a dia?" },
    ],
  },
  {
    title: "Como você trabalha com JavaScript",
    group: JS_GROUP,
    questions: [
      {
        type: "SINGLE_CHOICE",
        title: "Em que área você atua?",
        options: labels("Front-end", "Back-end", "Full-stack", "Mobile", "Dados"),
      },
      {
        type: "SINGLE_CHOICE",
        title: "Qual é o tamanho da empresa em que você trabalha?",
        options: labels("Só eu", "2–10", "11–50", "51–200", "201–1.000", "Mais de 1.000"),
      },
      {
        type: "SINGLE_CHOICE",
        title: "Há quantos anos você trabalha com JavaScript?",
        options: [
          { label: "Menos de 1", value: 0.5 },
          { label: "1–2", value: 1.5 },
          { label: "3–5", value: 4 },
          { label: "6–10", value: 8 },
          { label: "Mais de 10", value: 12 },
        ],
      },
      {
        type: "SINGLE_CHOICE",
        title: "Qual é o seu tipo de projeto principal?",
        options: labels(
          "Produto da empresa",
          "Agência ou consultoria",
          "Freelance",
          "Open source",
          "Estudos",
        ),
      },
    ],
  },
  {
    title: "Entretenimento favorito",
    group: ENTERTAINMENT_GROUP,
    questions: [
      {
        type: "SINGLE_CHOICE",
        title: "Qual é o seu formato de entretenimento preferido?",
        options: labels("Séries", "Filmes", "Games", "Podcasts", "Livros"),
      },
      {
        type: "MULTIPLE_CHOICE",
        title: "Onde você costuma consumir entretenimento?",
        options: labels(
          "Streaming de vídeo",
          "Cinema",
          "Console ou PC",
          "Celular",
          "Livro físico ou e-reader",
          "App de áudio",
        ),
      },
      {
        type: "SINGLE_CHOICE",
        title: "Quantas horas por semana você dedica a entretenimento?",
        options: [
          { label: "Menos de 2", value: 1 },
          { label: "2–5", value: 3.5 },
          { label: "6–10", value: 8 },
          { label: "11–20", value: 15 },
          { label: "Mais de 20", value: 25 },
        ],
      },
    ],
  },
];
