import { z } from "zod";
import { pageQuerySchema } from "@/lib/pagination";

// Solicitações de pesquisa (RF-21, RF-22). O formulário (T11) e o serviço usam este schema.

export const requestStatuses = ["PENDING", "IN_REVIEW", "ACCEPTED", "REJECTED", "DONE"] as const;
export type RequestStatus = (typeof requestStatuses)[number];

/** Limite de solicitações por usuário por dia de calendário em São Paulo (spec 10.3). */
export const DAILY_REQUEST_LIMIT = 3;

const optionalText = (max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.trim() || null : (v ?? null)),
    z.string().max(max, message).nullable(),
  );

export const requestInputSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(5, "Use pelo menos 5 caracteres.")
    .max(120, "Use no máximo 120 caracteres."),
  goal: z
    .string()
    .trim()
    .min(1, "Conte o objetivo da pesquisa.")
    .max(1000, "Use no máximo 1.000 caracteres."),
  suggestedQuestions: optionalText(4000, "Use no máximo 4.000 caracteres."),
  audience: optionalText(200, "Use no máximo 200 caracteres."),
});

export type RequestInput = z.output<typeof requestInputSchema>;

/** Valores do formulário T11 (texto puro; vazio vira null no schema). */
export type RequestFormValues = {
  topic: string;
  goal: string;
  suggestedQuestions: string;
  audience: string;
};

export const requestQueueQuerySchema = pageQuerySchema(20).extend({
  status: z.preprocess((v) => v || undefined, z.enum(requestStatuses).optional()),
});

/** `PATCH /survey-requests/{id}`: novo status e/ou nota ao solicitante (RF-22). */
export const requestUpdateSchema = z
  .object({
    status: z.enum(requestStatuses).optional(),
    adminNote: optionalText(1000, "Use no máximo 1.000 caracteres.").optional(),
  })
  .refine((u) => u.status !== undefined || u.adminNote !== undefined, {
    error: "Informe o novo status ou a nota.",
  });

/**
 * Transições da RN-22. `ACCEPTED` também vem sozinho ao ligar uma pesquisa, e `DONE`
 * ao publicá-la; `DONE` e `REJECTED` são finais.
 */
export const requestTransitions: Record<RequestStatus, RequestStatus[]> = {
  PENDING: ["IN_REVIEW", "ACCEPTED", "REJECTED"],
  IN_REVIEW: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["DONE"],
  REJECTED: [],
  DONE: [],
};

export const requestStatusLabel: Record<RequestStatus, string> = {
  PENDING: "Pendente",
  IN_REVIEW: "Em análise",
  ACCEPTED: "Aceita",
  REJECTED: "Recusada",
  DONE: "Concluída",
};
