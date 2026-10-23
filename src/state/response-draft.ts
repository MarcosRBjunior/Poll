import type { WritableAtom } from "jotai";
import { atomWithStorage, createJSONStorage, RESET } from "jotai/utils";
import type { FormValues } from "@/features/responses/schemas";

// Rascunho das respostas no navegador (US-2.4). Não é fonte de verdade: o React Hook Form
// é dono dos valores e o envio grava no banco. Aqui ficam só cópias, para sobreviver a um
// recarregamento até o envio.

export type ResponseDraft = { values: FormValues; idempotencyKey: string };

type DraftAtom = WritableAtom<ResponseDraft | null, [ResponseDraft | null | typeof RESET], void>;

const draftAtoms = new Map<string, DraftAtom>();

/** Um átomo por pesquisa, chave `poll:draft:{slug}` no localStorage. */
export function responseDraftFamily(slug: string): DraftAtom {
  let draftAtom = draftAtoms.get(slug);
  if (!draftAtom) {
    // O storage padrão do Jotai já trata localStorage indisponível (modo privado, servidor).
    draftAtom = atomWithStorage<ResponseDraft | null>(
      `poll:draft:${slug}`,
      null,
      createJSONStorage(),
      { getOnInit: true },
    );
    draftAtoms.set(slug, draftAtom);
  }
  return draftAtom;
}

/** Atraso entre a última digitação e a cópia para o rascunho. */
export const DRAFT_DELAY_MS = 500;
