import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm read-only:bg-zinc-100 disabled:bg-zinc-100 disabled:opacity-70 aria-[invalid=true]:border-red-700 dark:border-zinc-700 dark:read-only:bg-zinc-900 dark:disabled:bg-zinc-900";

type ControlProps = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
};

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: (props: ControlProps) => ReactNode;
};

/** Rótulo, controle, dica e erro junto do campo que o causou (RF-05, critério 3). */
export function Field({ id, label, error, hint, className, children }: FieldProps) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy || undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-zinc-600 dark:text-zinc-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

type ButtonProps = {
  children: ReactNode;
  onClick: () => void;
  /** Nome acessível quando o texto visível é curto (ex.: "↑"). */
  label?: string;
  disabled?: boolean;
  className?: string;
};

export function SmallButton({ children, onClick, label, disabled, className }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      disabled={disabled}
      className={`rounded-md border border-zinc-300 px-2 py-1 text-sm disabled:opacity-40 dark:border-zinc-700 ${className ?? ""}`}
    >
      {children}
    </button>
  );
}
