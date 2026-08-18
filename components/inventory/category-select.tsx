"use client"

import { Field } from "@/components/skope/form"
import { useCategoryOptions } from "@/hooks/use-cockpit"
import type { StockMode } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Auswahl eines Lagerbereichs.
 *
 * Die Baumtiefe wird durch Einrückung im Optionstext dargestellt — ein
 * natives `select` behält am Tablet den systemeigenen Auswahldialog, und der
 * ist dort jeder nachgebauten Baumansicht überlegen.
 *
 * Zwischenebenen ohne eigene Artikel bleiben wählbar: Wer „Ersatzteile"
 * wählt, landet in einem gültigen Bereich mit eigenem Nummernkreis. Erzwungene
 * Blattauswahl würde nur dazu führen, dass Verlegenheitsunterbereiche
 * entstehen.
 */
export function CategorySelect({
  value,
  onChange,
  label = "Bereich",
  hint,
  error,
  /** Nur Bereiche dieser Bestandsart anbieten. */
  stockMode,
  required,
  className,
  includeAll,
}: {
  value: string
  onChange: (categoryId: string) => void
  label?: string
  hint?: string
  error?: string | null
  stockMode?: StockMode
  required?: boolean
  className?: string
  /** Zusätzliche Option „Alle Bereiche" — für Filterleisten. */
  includeAll?: boolean
}) {
  const options = useCategoryOptions().filter(
    (option) => !stockMode || option.stockMode === stockMode
  )

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      className={className}
    >
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "h-11 w-full rounded-lg border border-skope-line-strong bg-[#0b0c0e] px-3 text-sm text-foreground",
            "transition-colors duration-150 outline-none hover:border-[#353941]",
            "focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15",
            error && "border-state-error/60"
          )}
        >
          {includeAll && <option value="">Alle Bereiche</option>}
          {!includeAll && <option value="">Bitte wählen</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {/* Geschützte Leerzeichen: normale würden im Menü kollabieren. */}
              {"  ".repeat(option.depth)}
              {option.depth > 0 ? "└ " : ""}
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}
