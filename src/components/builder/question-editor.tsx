"use client";

import { useState } from "react";
import {
  useFieldArray,
  useFormState,
  useWatch,
  type UseFormRegister,
  type UseFormSetValue,
} from "react-hook-form";
import type { QuestionType } from "@/features/responses/schemas";
import { isChoiceType, newOption, type SurveyFormValues } from "@/features/surveys/schemas";
import { Field, inputClass, SmallButton } from "./fields";
import type { BuilderControl } from "./form-values";

const typeLabels: Record<QuestionType, string> = {
  SINGLE_CHOICE: "Escolha única",
  MULTIPLE_CHOICE: "Múltipla escolha",
  SHORT_TEXT: "Texto curto",
  LONG_TEXT: "Texto longo",
};

type Props = {
  index: number;
  count: number;
  control: BuilderControl;
  register: UseFormRegister<SurveyFormValues>;
  setValue: UseFormSetValue<SurveyFormValues>;
  /** Pergunta já salva numa pesquisa com respostas: tipo e valores travados (RN-11). */
  locked: boolean;
  onMove: (to: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

/** Editor de uma pergunta (RF-06): tipo, enunciado, ajuda, obrigatória, limites e opções. */
export function QuestionEditor({
  index,
  count,
  control,
  register,
  setValue,
  locked,
  onMove,
  onDuplicate,
  onRemove,
}: Props) {
  const base = `questions.${index}` as const;
  const [type, options] = useWatch({ control, name: [`${base}.type`, `${base}.options`] });
  const { errors } = useFormState({ control, name: base });
  const error = errors.questions?.[index];
  const [pendingType, setPendingType] = useState<QuestionType | null>(null);
  const idPrefix = `question-${index}`;
  const number = index + 1;

  function applyType(next: QuestionType) {
    setValue(`${base}.type`, next, { shouldDirty: true });
    if (!isChoiceType(next)) {
      setValue(`${base}.options`, [], { shouldDirty: true });
      setValue(`${base}.required`, false, { shouldDirty: true });
    } else if (options.length === 0) {
      setValue(`${base}.options`, [newOption(), newOption()], { shouldDirty: true });
    }
    if (next !== "MULTIPLE_CHOICE") {
      setValue(`${base}.minSelections`, "", { shouldDirty: true });
      setValue(`${base}.maxSelections`, "", { shouldDirty: true });
    }
    setPendingType(null);
  }

  function changeType(next: QuestionType) {
    // RF-06 (2): de escolha para texto descarta as opções, então pede confirmação.
    const discards =
      isChoiceType(type) && !isChoiceType(next) && options.some((o) => o.label.trim());
    if (discards) setPendingType(next);
    else applyType(next);
  }

  return (
    <article
      aria-labelledby={`${idPrefix}-heading`}
      className="flex flex-col gap-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${idPrefix}-heading`} className="font-medium">
          Pergunta {number}
        </h3>
        <div className="flex flex-wrap gap-1">
          <SmallButton
            label={`Subir a pergunta ${number}`}
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            ↑ Subir
          </SmallButton>
          <SmallButton
            label={`Descer a pergunta ${number}`}
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            ↓ Descer
          </SmallButton>
          <SmallButton label={`Duplicar a pergunta ${number}`} onClick={onDuplicate}>
            Duplicar
          </SmallButton>
          <SmallButton label={`Remover a pergunta ${number}`} onClick={onRemove}>
            Remover
          </SmallButton>
        </div>
      </header>

      <Field
        id={`${idPrefix}-type`}
        label="Tipo"
        error={error?.type?.message}
        hint={locked ? "Esta pergunta já tem respostas: o tipo não pode mudar." : undefined}
      >
        {(props) => (
          <select
            {...props}
            value={type}
            disabled={locked}
            onChange={(event) => changeType(event.target.value as QuestionType)}
            className={inputClass}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {pendingType && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        >
          <p>
            Trocar para {typeLabels[pendingType].toLowerCase()} descarta as {options.length} opções
            desta pergunta.
          </p>
          <div className="flex gap-2">
            <SmallButton onClick={() => applyType(pendingType)}>Trocar e descartar</SmallButton>
            <SmallButton onClick={() => setPendingType(null)}>Cancelar</SmallButton>
          </div>
        </div>
      )}

      <Field id={`${idPrefix}-title`} label="Enunciado" error={error?.title?.message}>
        {(props) => <input {...props} {...register(`${base}.title`)} className={inputClass} />}
      </Field>

      <Field
        id={`${idPrefix}-help`}
        label="Texto de ajuda (opcional)"
        error={error?.helpText?.message}
      >
        {(props) => (
          <textarea {...props} {...register(`${base}.helpText`)} rows={2} className={inputClass} />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register(`${base}.required`)} className="size-4" />
        Obrigatória
      </label>

      {type === "MULTIPLE_CHOICE" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id={`${idPrefix}-min`}
            label="Mínimo de opções (opcional)"
            error={error?.minSelections?.message}
          >
            {(props) => (
              <input
                {...props}
                {...register(`${base}.minSelections`)}
                inputMode="numeric"
                className={inputClass}
              />
            )}
          </Field>
          <Field
            id={`${idPrefix}-max`}
            label="Máximo de opções (opcional)"
            error={error?.maxSelections?.message}
          >
            {(props) => (
              <input
                {...props}
                {...register(`${base}.maxSelections`)}
                inputMode="numeric"
                className={inputClass}
              />
            )}
          </Field>
        </div>
      )}

      {isChoiceType(type) && (
        <OptionsEditor
          questionIndex={index}
          control={control}
          register={register}
          locked={locked}
          error={error?.options?.message ?? error?.options?.root?.message}
        />
      )}
    </article>
  );
}

type OptionsProps = {
  questionIndex: number;
  control: BuilderControl;
  register: UseFormRegister<SurveyFormValues>;
  locked: boolean;
  error?: string;
};

/** Opções com valor numérico opcional (RF-07). No modo restrito, o valor salvo fica travado. */
function OptionsEditor({ questionIndex, control, register, locked, error }: OptionsProps) {
  const name = `questions.${questionIndex}.options` as const;
  const { fields, append, remove, move } = useFieldArray({ control, name, keyName: "key" });
  const { errors } = useFormState({ control, name });
  const optionErrors = errors.questions?.[questionIndex]?.options;
  const prefix = `question-${questionIndex}-option`;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">Opções</legend>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Valor numérico é opcional. Com valor em todas as opções, o painel mostra média e mediana.
      </p>
      {fields.map((field, oi) => {
        const number = oi + 1;
        const valueLocked = locked && field.id !== undefined;
        return (
          <div key={field.key} className="flex flex-wrap items-start gap-2">
            <Field
              id={`${prefix}-${oi}-label`}
              label={`Opção ${number}`}
              error={optionErrors?.[oi]?.label?.message}
              className="min-w-40 flex-[3]"
            >
              {(props) => (
                <input {...props} {...register(`${name}.${oi}.label`)} className={inputClass} />
              )}
            </Field>
            <Field
              id={`${prefix}-${oi}-value`}
              label="Valor"
              error={optionErrors?.[oi]?.value?.message}
              hint={valueLocked ? "Travado: já há respostas." : undefined}
              className="w-28 flex-1"
            >
              {(props) => (
                <input
                  {...props}
                  {...register(`${name}.${oi}.value`)}
                  inputMode="decimal"
                  readOnly={valueLocked}
                  className={inputClass}
                />
              )}
            </Field>
            <div className="flex gap-1 pt-6">
              <SmallButton
                label={`Subir a opção ${number}`}
                disabled={oi === 0}
                onClick={() => move(oi, oi - 1)}
              >
                ↑
              </SmallButton>
              <SmallButton
                label={`Descer a opção ${number}`}
                disabled={oi === fields.length - 1}
                onClick={() => move(oi, oi + 1)}
              >
                ↓
              </SmallButton>
              <SmallButton label={`Remover a opção ${number}`} onClick={() => remove(oi)}>
                ✕
              </SmallButton>
            </div>
          </div>
        );
      })}
      {error && <p className="text-sm font-medium text-red-700 dark:text-red-400">{error}</p>}
      <SmallButton
        disabled={fields.length >= 30}
        onClick={() => append(newOption())}
        className="self-start"
      >
        + Adicionar opção
      </SmallButton>
    </fieldset>
  );
}
