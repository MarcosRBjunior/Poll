import { execSync } from "node:child_process";
import type { TestProject } from "vitest/node";

// Aplica as migrações pendentes no banco de teste. Os testes limpam as tabelas com TRUNCATE,
// então o banco precisa ser exclusivo de teste: o nome tem que terminar em "_test".
export default function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL ?? "";
  if (!new URL(url).pathname.endsWith("_test")) {
    throw new Error('Os testes só rodam em banco cujo nome termina em "_test".');
  }
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DIRECT_URL: url },
  });
}
