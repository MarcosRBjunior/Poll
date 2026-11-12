// Teste de carga (US-8.4) contra um deploy já populado por scripts/load/seed.ts.
//
// Uso: node scripts/load/run.mjs https://endereco-do-preview.vercel.app
// Preview protegido: exporte VERCEL_AUTOMATION_BYPASS_SECRET (Deployment Protection →
// Protection Bypass for Automation). O valor nunca é impresso.
//
// Metas da spec (seção 10.1): envio com p95 abaixo de 500 ms; painel de resultados com
// p95 abaixo de 1,5 s com 10 mil respostas. Sai com código 1 se alguma meta falhar.
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import autocannon from "autocannon";
import { LOAD } from "./config.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "results-requests": { type: "string", default: "300" },
    connections: { type: "string", default: "10" },
    only: { type: "string" }, // "results" ou "submit"
  },
});
const base = positionals[0]?.replace(/\/$/, "");
if (!base) {
  console.error("Informe o endereço: node scripts/load/run.mjs https://...");
  process.exit(1);
}
const connections = Number(values.connections);
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const commonHeaders = bypass ? { "x-vercel-protection-bypass": bypass } : {};

/** p-ésimo percentil (0 a 100) de uma lista de latências em ms. */
function percentile(list, p) {
  const sorted = [...list].sort((a, b) => a - b).map(Math.round);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? NaN;
}

/** Roda um cenário e devolve p50, p95, p99, máximo e os status recebidos. */
function scenario(title, options) {
  return new Promise((resolve, reject) => {
    const latencies = [];
    const statuses = {};
    const instance = autocannon(
      { connections, timeout: 30, ...options, headers: { ...commonHeaders, ...options.headers } },
      (error) => {
        if (error) return reject(error);
        resolve({
          title,
          requests: latencies.length,
          p50: percentile(latencies, 50),
          p95: percentile(latencies, 95),
          p99: percentile(latencies, 99),
          max: Math.round(Math.max(...latencies)),
          statuses,
        });
      },
    );
    instance.on("response", (_client, status, _bytes, ms) => {
      latencies.push(ms);
      statuses[status] = (statuses[status] ?? 0) + 1;
    });
  });
}

async function fetchJson(path) {
  const response = await fetch(`${base}${path}`, { headers: commonHeaders });
  if (!response.ok) throw new Error(`${path} respondeu ${response.status}`);
  return response.json();
}

/** Corpo válido para a estrutura da pesquisa: primeira opção de cada pergunta e um texto. */
function bodyFor(survey) {
  return survey.questions.map((q) =>
    q.options.length
      ? { questionId: q.id, optionIds: [q.options[0].id] }
      : { questionId: q.id, text: "Resposta do teste de carga" },
  );
}

async function resultsScenarios() {
  const amount = Number(values["results-requests"]);
  const results = await fetchJson(`/api/v1/public/surveys/${LOAD.resultsSlug}/results`);
  console.log(`Pesquisa de resultados: ${results.totals.responses} respostas.`);
  return [
    await scenario("Resultados (API)", {
      url: `${base}/api/v1/public/surveys/${LOAD.resultsSlug}/results`,
      amount,
    }),
    await scenario("Resultados (página T10)", {
      url: `${base}/s/${LOAD.resultsSlug}/results`,
      amount,
    }),
  ];
}

async function submitScenario() {
  const slugs = Array.from({ length: LOAD.submitSurveys }, (_, i) => LOAD.submitSlug(i + 1));
  const bodies = [];
  for (const slug of slugs) bodies.push(bodyFor(await fetchJson(`/api/v1/public/surveys/${slug}`)));

  let sent = 0;
  return scenario("Envio de respostas", {
    url: base,
    amount: LOAD.submitSurveys * LOAD.submitsPerSurvey,
    requests: [
      {
        method: "POST",
        // Cada envio é um navegador novo, em rodízio pelas pesquisas: 10 por pesquisa no total.
        setupRequest: (request) => {
          const i = sent++ % slugs.length;
          return {
            ...request,
            path: `/api/v1/public/surveys/${slugs[i]}/responses`,
            headers: {
              ...request.headers,
              origin: base,
              "content-type": "application/json",
              cookie: `poll_rid=${randomUUID()}`,
            },
            body: JSON.stringify({ idempotencyKey: randomUUID(), answers: bodies[i] }),
          };
        },
      },
    ],
  });
}

const targets = {
  "Envio de respostas": 500,
  "Resultados (API)": 1500,
  "Resultados (página T10)": 1500,
};
const expected = { "Envio de respostas": 201 };

const runs = [];
if (values.only !== "submit") runs.push(...(await resultsScenarios()));
if (values.only !== "results") runs.push(await submitScenario());

let failed = false;
console.log(`\nAlvo: ${new URL(base).host} · ${connections} conexões simultâneas\n`);
for (const r of runs) {
  const ok = expected[r.title] ?? 200;
  const wrong = Object.entries(r.statuses).filter(([status]) => Number(status) !== ok);
  const pass = r.p95 < targets[r.title] && wrong.length === 0;
  failed ||= !pass;
  console.log(
    `${pass ? "OK   " : "FALHA"} ${r.title}: ${r.requests} req · p50 ${r.p50} ms · ` +
      `p95 ${r.p95} ms (meta < ${targets[r.title]}) · p99 ${r.p99} ms · máx ${r.max} ms` +
      (wrong.length ? ` · status inesperados ${JSON.stringify(Object.fromEntries(wrong))}` : ""),
  );
}
process.exitCode = failed ? 1 : 0;
