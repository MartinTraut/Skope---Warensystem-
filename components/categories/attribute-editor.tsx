"use client"

import { Plus, Trash2 } from "lucide-react"

import { InlineSelect } from "@/components/skope/form"
import { Button } from "@/components/ui/button"
import {
  ATTRIBUTE_TYPES,
  type AttributeDefinition,
  type AttributeType,
} from "@/lib/domain/types"

const TYPE_LABEL: Record<AttributeType, string> = {
  TEXT: "Text",
  ZAHL: "Zahl",
  AUSWAHL: "Auswahl",
  JA_NEIN: "Ja / Nein",
}

const INPUT =
  "h-10 w-full rounded-lg border border-skope-line bg-surface-raised px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-skope-accent/60 focus:ring-3 focus:ring-skope-accent/15 focus:outline-none"

/**
 * Merkmalsfelder eines Bereichs definieren.
 *
 * Das ist der Mechanismus, der „wie viele 8,5-Zoll-Reifen von Xiaomi habe ich?"
 * beantwortbar macht: Zollgröße muss ein Feld sein und darf kein Wort in der
 * Beschreibung bleiben. Wer ein Feld als filterbar markiert, bekommt es in der
 * Bestandsliste als eigene Auswahl.
 */
export function AttributeEditor({
  value,
  onChange,
}: {
  value: AttributeDefinition[]
  onChange: (next: AttributeDefinition[]) => void
}) {
  function update(index: number, patch: Partial<AttributeDefinition>) {
    onChange(
      value.map((definition, position) =>
        position === index ? { ...definition, ...patch } : definition
      )
    )
  }

  function add() {
    onChange([
      ...value,
      {
        key: `merkmal_${value.length + 1}`,
        label: "",
        type: "TEXT",
        options: [],
        unit: "",
        required: false,
        filterable: true,
      },
    ])
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="type-label">Merkmalsfelder</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Erben sich an alle Unterbereiche weiter. Gleiche Schlüssel weiter
            unten überschreiben die Definition von oben.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={add}>
          <Plus className="size-4" />
          Merkmal
        </Button>
      </div>

      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-skope-line px-3.5 py-4 text-center text-xs text-muted-foreground">
          Noch kein Merkmal. Ohne eigene Felder bleibt der Bestand zählbar, aber
          nicht auswertbar.
        </p>
      ) : (
        <ul className="space-y-3">
          {value.map((definition, index) => (
            <li
              key={index}
              className="rounded-lg border border-skope-line bg-surface-sunken p-3.5"
            >
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_7rem_auto]">
                <input
                  className={INPUT}
                  placeholder="Bezeichnung, z. B. Zollgröße"
                  aria-label="Bezeichnung des Merkmals"
                  value={definition.label}
                  onChange={(event) => {
                    const label = event.target.value
                    update(index, {
                      label,
                      // Der Schlüssel folgt der Bezeichnung, solange niemand
                      // ihn von Hand gesetzt hat — er ist der Speicherort der
                      // Werte und darf sich später nicht mehr ändern.
                      key: definition.key.startsWith("merkmal_")
                        ? slugify(label) || definition.key
                        : definition.key,
                    })
                  }}
                />
                <InlineSelect
                  aria-label="Feldtyp"
                  value={definition.type}
                  onChange={(event) =>
                    update(index, { type: event.target.value as AttributeType })
                  }
                  options={ATTRIBUTE_TYPES.map((type) => ({
                    value: type,
                    label: TYPE_LABEL[type],
                  }))}
                />
                <input
                  className={INPUT}
                  placeholder="Einheit"
                  aria-label="Einheit"
                  value={definition.unit}
                  onChange={(event) => update(index, { unit: event.target.value })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-state-error"
                  aria-label="Merkmal entfernen"
                  onClick={() =>
                    onChange(value.filter((_, position) => position !== index))
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              {definition.type === "AUSWAHL" && (
                <input
                  className={`${INPUT} mt-2.5`}
                  placeholder="Auswahlwerte, durch Komma getrennt"
                  aria-label="Auswahlwerte"
                  value={definition.options.join(", ")}
                  onChange={(event) =>
                    update(index, {
                      options: event.target.value
                        .split(",")
                        .map((option) => option.trim())
                        .filter(Boolean),
                    })
                  }
                />
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-skope-accent"
                    checked={definition.required}
                    onChange={(event) =>
                      update(index, { required: event.target.checked })
                    }
                  />
                  Pflichtangabe
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-skope-accent"
                    checked={definition.filterable}
                    onChange={(event) =>
                      update(index, { filterable: event.target.checked })
                    }
                  />
                  Als Filter anzeigen
                </label>
                <span className="ml-auto font-mono type-micro text-muted-foreground/70">
                  {definition.key}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[äöüß]/g, (m) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" })[m] ?? m)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}
