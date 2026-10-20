import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // Conteúdo de usuário nunca vira HTML cru (CLAUDE.md, Segurança).
      "react/no-danger": "error",
    },
  },
  {
    // Prisma só em repository.ts (CLAUDE.md, Arquitetura e camadas).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/features/*/repository.ts", "src/lib/db.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/generated/prisma/*", "@/lib/db", "@prisma/*"],
              message: "Prisma só pode ser usado em src/features/*/repository.ts.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    "src/generated/**",
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
