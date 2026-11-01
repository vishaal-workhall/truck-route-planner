import { WarningCircle } from '@phosphor-icons/react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-[#2a3848] active:translate-y-px',
  secondary:
    'border border-line bg-white text-ink hover:bg-canvas active:translate-y-px',
  ghost: 'text-ink hover:bg-black/[0.04] active:translate-y-px',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export const controlClass =
  'h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink placeholder:text-[#5c6770] transition-colors duration-150 hover:border-[#c5ccd3] focus:border-ink focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:bg-canvas';

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${error ? 'field-invalid' : ''}`}>
      <label
        htmlFor={htmlFor}
        className={`text-[13px] font-medium ${error ? 'text-[#9F1239]' : 'text-ink'}`}
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-5 text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${htmlFor}-error`}
          className="flex items-start gap-1.5 text-[13px] font-medium leading-5 text-[#9F1239]"
          role="alert"
        >
          <WarningCircle size={15} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SegmentedProps<T extends string | number> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

export function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex border border-line">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`min-h-10 flex-1 cursor-pointer px-2 text-sm font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
              active ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-canvas'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
