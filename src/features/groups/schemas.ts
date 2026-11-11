import { z } from "zod";

// Grupos de pesquisas (RF-16). O diálogo de T08 e o serviço usam este schema.

export const groupInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Use pelo menos 2 caracteres.")
    .max(80, "Use no máximo 80 caracteres."),
  description: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : (v ?? null)),
    z.string().max(500, "Use no máximo 500 caracteres.").nullable(),
  ),
});

/** `PATCH`: renomear e/ou mudar a descrição. */
export const groupUpdateSchema = groupInputSchema.partial();

export type GroupInput = z.output<typeof groupInputSchema>;
export type GroupUpdate = z.output<typeof groupUpdateSchema>;

/** Valores do diálogo de T08 (texto puro; descrição vazia vira null no schema). */
export type GroupFormValues = { name: string; description: string };
