import { z } from "zod";

export const loginEmailSchema = z.object({
  email: z.string().trim().pipe(z.email("Informe um e-mail válido.")),
});
