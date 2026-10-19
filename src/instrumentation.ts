// Roda uma vez quando o servidor sobe: sem as variáveis obrigatórias, o app não inicia.
export async function register() {
  const { getEnv } = await import("@/lib/env");
  getEnv();
}
