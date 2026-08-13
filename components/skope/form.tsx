"use client"

import type { ComponentProps, ReactNode } from "react"
import { useId } from "react"

import { cn } from "@/lib/utils"

/**
 * Formularbausteine des Cockpits.
 *
 * Bewusst auf nativen Elementen aufgebaut: Die Anwendung wird zu großen Teilen
 * am Tablet in der Werkstatt bedient. Native Felder liefern dort die richtige
 * Tastatur und den systemeigenen Auswahldialog — und die Touch-Flächen sind
 * mit 44 px durchgängig groß genug.
 */

const CONTROL_BASE =
  "w-full rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 text-sm text-foreground " +
  "transition-colors duration-150 outline-none placeholder:text-muted-foreground/70 " +
  "hover:border-[#353941] focus:border-skope-gold/60 focus:ring-3 focus:ring-skope-gold/15 " +
  "disabled:cursor-not-allowed disabled:opacity-50"

const CONTROL_HEIGHT = "h-11"

/* ------------------------------------------------------------------ */
/* Feldrahmen                                                          */
/* ------------------------------------------------------------------ */

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: (id: string) => ReactNode
}

export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps) {
  const id = useId()

  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={id}
        className="mb-1.5 block type-body-sm font-medium text-foreground/90"
      >
        {label}
        {required && <span className="ml-1 text-skope-gold">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs text-state-error">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Einzelfelder                                                        */
/* ------------------------------------------------------------------ */

type TextFieldProps = Omit<ComponentProps<"input">, "className"> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
  /** Monospace — für Seriennummern und IDs. */
  mono?: boolean
}

export function TextField({
  label,
  hint,
  error,
  className,
  mono,
  required,
  ...props
}: TextFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {(id) => (
        <input
          id={id}
          className={cn(
            CONTROL_BASE,
            CONTROL_HEIGHT,
            mono && "font-mono",
            error && "border-state-error/60 focus:border-state-error focus:ring-state-error/15"
          )}
          aria-invalid={error ? true : undefined}
          {...props}
        />
      )}
    </Field>
  )
}

type SelectFieldProps = Omit<ComponentProps<"select">, "className"> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

export function SelectField({
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  required,
  ...props
}: SelectFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {(id) => (
        <div className="relative">
          <select
            id={id}
            className={cn(
              CONTROL_BASE,
              CONTROL_HEIGHT,
              "cursor-pointer appearance-none pr-9",
              error && "border-state-error/60"
            )}
            {...props}
          >
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown />
        </div>
      )}
    </Field>
  )
}

type TextareaFieldProps = Omit<ComponentProps<"textarea">, "className"> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  rows = 4,
  required,
  ...props
}: TextareaFieldProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {(id) => (
        <textarea
          id={id}
          rows={rows}
          className={cn(CONTROL_BASE, "resize-y py-2.5 leading-relaxed")}
          {...props}
        />
      )}
    </Field>
  )
}

/** Betragsfeld mit €-Suffix. Der Wert bleibt Text, geparst wird beim Speichern. */
export function MoneyField({
  label,
  hint,
  error,
  className,
  required,
  ...props
}: Omit<ComponentProps<"input">, "className"> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  className?: string
}) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {(id) => (
        <div className="relative">
          <input
            id={id}
            inputMode="decimal"
            placeholder="0,00"
            className={cn(
              CONTROL_BASE,
              CONTROL_HEIGHT,
              "pr-9 text-right font-mono tabular-nums",
              error && "border-state-error/60"
            )}
            {...props}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
            €
          </span>
        </div>
      )}
    </Field>
  )
}

/* ------------------------------------------------------------------ */
/* Freistehende Steuerelemente                                         */
/* ------------------------------------------------------------------ */

/** Für Filterleisten, wo kein Label darüber stehen soll. */
export function InlineSelect({
  className,
  options,
  ...props
}: Omit<ComponentProps<"select">, "className"> & {
  className?: string
  options: { value: string; label: string }[]
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(
          CONTROL_BASE,
          "h-10 cursor-pointer appearance-none pr-9 type-body-sm"
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown />
    </div>
  )
}

export function SearchInput({
  className,
  ...props
}: Omit<ComponentProps<"input">, "className"> & { className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        className={cn(CONTROL_BASE, "h-10 pl-9 type-body-sm")}
        {...props}
      />
    </div>
  )
}

function ChevronDown() {
  return (
    <svg
      className="pointer-events-none absolute inset-y-0 right-3 my-auto size-4 text-muted-foreground"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Umschalter                                                          */
/* ------------------------------------------------------------------ */

interface ToggleRowProps {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/** Zeile mit Beschriftung und Schalter — große Trefferfläche für Touch. */
export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: ToggleRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex w-full items-center justify-between gap-4 rounded-lg border border-skope-line bg-surface-sunken px-3.5 py-3 text-left transition-colors duration-150",
        "hover:border-skope-line-strong hover:bg-surface-raised",
        "focus-visible:border-skope-gold/50 focus-visible:ring-3 focus-visible:ring-skope-gold/15 focus-visible:outline-none",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
          checked ? "bg-skope-gold" : "bg-[#2a2d33]"
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute top-1 size-4 rounded-full bg-[#0b0c0e] transition-transform duration-200",
            checked ? "translate-x-5" : "translate-x-1"
          )}
        />
      </span>
    </button>
  )
}
