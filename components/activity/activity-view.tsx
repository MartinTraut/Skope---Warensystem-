"use client"

import { useMemo, useState } from "react"
import { Activity } from "lucide-react"

import { InlineSelect, SearchInput } from "@/components/skope/form"
import {
  EmptyState,
  Panel,
  PanelBody,
  PageHeader,
} from "@/components/skope/primitives"
import { ListSkeleton } from "@/components/skope/skeletons"
import { ActivityList } from "@/components/dashboard/activity-feed"
import { useActivity, useHydrated } from "@/hooks/use-cockpit"
import { formatDate } from "@/lib/domain/money"
import { AUDIT_CATEGORIES } from "@/lib/domain/types"

const CATEGORY_LABELS: Record<string, string> = {
  SCOOTER: "Scooter",
  PRUEFUNG: "Prüfung",
  AUFBEREITUNG: "Aufbereitung",
  BILDER: "Bilder",
  KANAL: "Kanäle",
  VERKAUF: "Verkauf",
  SYNC: "Synchronisation",
  IMPORT: "Import",
  SYSTEM: "System",
}

const RANGE_OPTIONS = [
  { value: "alle", label: "Gesamter Zeitraum" },
  { value: "heute", label: "Heute" },
  { value: "7", label: "Letzte 7 Tage" },
  { value: "30", label: "Letzte 30 Tage" },
]

/** Globales Audit Log mit Filtern. */
export function ActivityView() {
  const hydrated = useHydrated()
  const activity = useActivity()

  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("alle")
  const [level, setLevel] = useState("alle")
  // Der Zeitbezug wird beim Setzen des Filters festgehalten, nicht beim
  // Rendern ermittelt — ein Renderdurchlauf muss reproduzierbar bleiben.
  const [range, setRange] = useState<{ key: string; anchor: number }>({
    key: "alle",
    anchor: 0,
  })

  const actors = useMemo(
    () => [...new Set(activity.map((event) => event.actor))].sort(),
    [activity]
  )
  const [actor, setActor] = useState("alle")

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return activity.filter((event) => {
      if (category !== "alle" && event.category !== category) return false
      if (level !== "alle" && event.level !== level) return false
      if (actor !== "alle" && event.actor !== actor) return false

      if (range.key !== "alle") {
        const eventTime = new Date(event.at).getTime()
        if (range.key === "heute") {
          if (
            formatDate(event.at) !==
            formatDate(new Date(range.anchor).toISOString())
          ) {
            return false
          }
        } else {
          const days = Number.parseInt(range.key, 10)
          if (range.anchor - eventTime > days * 86_400_000) return false
        }
      }

      if (needle) {
        const haystack = [
          event.itemNumber ?? "",
          event.action,
          event.detail,
          event.actor,
        ]
          .join(" ")
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }

      return true
    })
  }, [activity, query, category, level, actor, range])

  const active =
    (category !== "alle" ? 1 : 0) +
    (level !== "alle" ? 1 : 0) +
    (actor !== "alle" ? 1 : 0) +
    (range.key !== "alle" ? 1 : 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aktivitäten"
        description="Lückenloses Protokoll aller Änderungen — Grundlage für Nachvollziehbarkeit und Fehlersuche."
      />

      <Panel className="overflow-hidden">
        <div className="space-y-3 border-b border-skope-line p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              placeholder="Scooter, Aktion oder Detail durchsuchen …"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 sm:max-w-sm"
              aria-label="Aktivitäten durchsuchen"
            />
            <InlineSelect
              aria-label="Kategorie"
              className="w-[10rem]"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              options={[
                { value: "alle", label: "Bereich: alle" },
                ...AUDIT_CATEGORIES.map((value) => ({
                  value,
                  label: CATEGORY_LABELS[value] ?? value,
                })),
              ]}
            />
            <InlineSelect
              aria-label="Art"
              className="w-[9rem]"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              options={[
                { value: "alle", label: "Art: alle" },
                { value: "success", label: "Erfolg" },
                { value: "info", label: "Information" },
                { value: "warning", label: "Warnung" },
                { value: "error", label: "Fehler" },
              ]}
            />
            <InlineSelect
              aria-label="Benutzer"
              className="w-[11rem]"
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              options={[
                { value: "alle", label: "Benutzer: alle" },
                ...actors.map((name) => ({ value: name, label: name })),
              ]}
            />
            <InlineSelect
              aria-label="Zeitraum"
              className="w-[10rem]"
              value={range.key}
              onChange={(event) =>
                setRange({ key: event.target.value, anchor: Date.now() })
              }
              options={RANGE_OPTIONS}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{filtered.length}</span>{" "}
            von {activity.length} Ereignissen
            {active > 0 || query ? " gefiltert" : ""}
          </p>
        </div>

        <PanelBody>
          {!hydrated ? (
            <ListSkeleton rows={10} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Activity className="size-5" />}
              title={
                activity.length === 0 ? "Noch keine Ereignisse" : "Keine Treffer"
              }
              description={
                activity.length === 0
                  ? "Jede Änderung im Cockpit erzeugt automatisch einen Eintrag."
                  : "Für diese Filterkombination gibt es keine Einträge."
              }
            />
          ) : (
            <ActivityList events={filtered.slice(0, 200)} />
          )}

          {filtered.length > 200 && (
            <p className="mt-4 border-t border-skope-line pt-4 text-center text-xs text-muted-foreground">
              Es werden die neuesten 200 von {filtered.length} Einträgen
              angezeigt. Filter eingrenzen, um ältere Ereignisse zu sehen.
            </p>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}
