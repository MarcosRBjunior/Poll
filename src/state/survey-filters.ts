import { atom } from "jotai";

// Filtros da lista de pesquisas (T05, US-6.1). Só estado de interface: a lista vem da API.

export type SurveyFilters = {
  status: "" | "DRAFT" | "PUBLISHED" | "CLOSED";
  groupId: string;
  q: string;
  page: number;
};

export const emptySurveyFilters: SurveyFilters = { status: "", groupId: "", q: "", page: 1 };

export const surveyFiltersAtom = atom<SurveyFilters>(emptySurveyFilters);

/** Query string de `GET /api/v1/surveys` sem os filtros vazios. */
export function filtersToQuery(filters: SurveyFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  params.set("page", String(filters.page));
  return params.toString();
}
