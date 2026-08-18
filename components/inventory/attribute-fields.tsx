"use client"

import { SelectField, TextField } from "@/components/skope/form"
import type { AttributeDefinition } from "@/lib/domain/types"

/**
 * Eingabefelder für die selbst definierten Merkmale einer Kategorie.
 *
 * Der Grund für diesen Umweg über Definitionen statt fester Felder: „Wie viele
 * 8,5-Zoll-Reifen von Xiaomi habe ich?" ist nur beantwortbar, wenn Zollgröße
 * ein Feld ist und nicht ein Wort in der Beschreibung. Und weil jede Kategorie
 * andere Merkmale braucht, können diese Felder nicht fest verdrahtet sein.
 */
export function AttributeFields({
  definitions,
  values,
  onChange,
  errors,
}: {
  definitions: AttributeDefinition[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
  errors?: Record<string, string>
}) {
  if (definitions.length === 0) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {definitions.map((definition) => {
        const value = values[definition.key] ?? ""
        const error = errors?.[definition.key] ?? null
        const label = definition.unit
          ? `${definition.label} (${definition.unit})`
          : definition.label

        if (definition.type === "AUSWAHL") {
          return (
            <SelectField
              key={definition.key}
              label={label}
              required={definition.required}
              error={error}
              placeholder="Bitte wählen"
              value={value}
              options={definition.options.map((option) => ({
                value: option,
                label: option,
              }))}
              onChange={(event) => onChange(definition.key, event.target.value)}
            />
          )
        }

        if (definition.type === "JA_NEIN") {
          return (
            <SelectField
              key={definition.key}
              label={label}
              required={definition.required}
              error={error}
              placeholder="Keine Angabe"
              value={value}
              options={[
                { value: "Ja", label: "Ja" },
                { value: "Nein", label: "Nein" },
              ]}
              onChange={(event) => onChange(definition.key, event.target.value)}
            />
          )
        }

        return (
          <TextField
            key={definition.key}
            label={label}
            required={definition.required}
            error={error}
            value={value}
            // Zahlenfelder bekommen am Tablet die numerische Tastatur; der
            // Wert bleibt trotzdem Text, weil "8,5" und "8.5" beide vorkommen.
            inputMode={definition.type === "ZAHL" ? "decimal" : undefined}
            onChange={(event) => onChange(definition.key, event.target.value)}
          />
        )
      })}
    </div>
  )
}

/** Fehlende Pflichtmerkmale als Feldfehler — Schlüssel ist `attribute.key`. */
export function validateAttributes(
  definitions: AttributeDefinition[],
  values: Record<string, string>
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const definition of definitions) {
    if (definition.required && !values[definition.key]?.trim()) {
      errors[definition.key] = "Pflichtangabe in diesem Bereich."
    }
  }
  return errors
}
