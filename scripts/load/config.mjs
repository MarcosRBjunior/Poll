// Valores comuns ao gerador de volume (seed.ts) e ao teste de carga (run.mjs).
export const LOAD = {
  ownerEmail: "carga@example.invalid",
  resultsSlug: "carga-resultados",
  submitSlug: (i) => `carga-envio-${String(i).padStart(2, "0")}`,
  // O limite é de 10 envios por minuto por IP e pesquisa: 10 envios em cada uma
  // das 40 pesquisas dão 400 envios sem nenhum 429.
  submitSurveys: 40,
  submitsPerSurvey: 10,
};
