import { z } from "zod";

/** Máximo de itens por página em qualquer listagem (spec 8.1). */
export const MAX_PAGE_SIZE = 100;

/** `?page&pageSize` da query string, com padrão 1 e 20. */
export function pageQuerySchema(defaultPageSize = 20) {
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(defaultPageSize),
  });
}

export type PageQuery = { page: number; pageSize: number };

export type Page<T> = { data: T[]; page: number; pageSize: number; total: number };

export const skipFor = ({ page, pageSize }: PageQuery) => (page - 1) * pageSize;
