import { z } from "zod";

export const loginEmailSchema = z.object({
  email: z.string().trim().pipe(z.email("Informe um e-mail válido.")),
});

/** Código de 6 dígitos enviado por e-mail (D-01): substitui o link, que filtros de e-mail abrem antes da pessoa. */
export const loginCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Digite os 6 números do código."),
});

/** Corpo de `POST /api/auth/complete`: só a página de origem, validada por `afterLoginPath`. */
export const completeLoginSchema = z.object({
  next: z.string().max(2000).nullish(),
});
