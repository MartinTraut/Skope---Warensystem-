"use client"

import { useMemo } from "react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { FOCUS_RING } from "@/components/skope/focus"
import { formatCents, formatCentsCompact } from "@/lib/domain/money"
import {
  computeChannelShares,
  computeMonthlyRevenue,
  computeRegionShares,
  computeSourceShares,
} from "@/lib/domain/metrics"
import { CUSTOMER_SOURCE_META, SALE_CHANNEL_META } from "@/lib/domain/status"
import {
  SALE_CHANNELS,
  type CustomerSource,
  type SaleChannel,
} from "@/lib/domain/types"
import { useCapitalByStage, useChartPrefs, useSales } from "@/hooks/use-cockpit"
import type { ChartPrefs } from "@/lib/store/cockpit-store"
import { cn } from "@/lib/utils"

/**
 * Auswertungen für das Dashboard.
 *
 * Bewusst ohne Chart-Bibliothek: Balken, Linie und Verteilungsleiste brauchen
 * kein Framework mit eigener Render-Schleife, und nur so tragen die Diagramme
 * dieselben Statusfarben wie der Rest des Cockpits. Farbe bedeutet hier
 * überall dasselbe — sie ist Kodierung, keine Dekoration.
 */

/* ------------------------------------------------------------------ */
/* Umsatzverlauf — filter- und umschaltbar                             */
/* ------------------------------------------------------------------ */

const MONTH_OPTIONS: { value: ChartPrefs["months"]; label: string }[] = [
  { value: 3, label: "3 M" },
  { value: 6, label: "6 M" },
  { value: 12, label: "12 M" },
]

const MEASURE_OPTIONS: { value: ChartPrefs["measure"]; label: string }[] = [
  { value: "umsatz", label: "Umsatz" },
  { value: "marge", label: "Marge" },
  { value: "anzahl", label: "Stück" },
]

const SHAPE_OPTIONS: { value: ChartPrefs["shape"]; label: string }[] = [
  { value: "gestapelt", label: "Gestapelt" },
  { value: "balken", label: "Balken" },
  { value: "linie", label: "Linie" },
]

export function RevenueChart() {
  const [prefs, setPrefs] = useChartPrefs()
  const sales = useSales()

  const data = useMemo(() => {
    const scoped =
      prefs.channel === "alle"
        ? sales
        : sales.filter((sale) => sale.channel === prefs.channel)
    return computeMonthlyRevenue(scoped, prefs.months)
  }, [sales, prefs.channel, prefs.months])

  // "Gestapelt" zeigt Marge im Umsatz — bei den anderen Kennzahlen gäbe es
  // nichts zu stapeln, deshalb fällt die Form dort auf einfache Balken zurück.
  const shape =
    prefs.shape === "gestapelt" && prefs.measure !== "umsatz"
      ? "balken"
      : prefs.shape

  const value = (month: (typeof data)[number]) =>
    prefs.measure === "umsatz"
      ? month.revenueCents
      : prefs.measure === "marge"
        ? month.marginCents
        : month.count

  const format = (raw: number) =>
    prefs.measure === "anzahl" ? String(raw) : formatCentsCompact(raw)

  const values = data.map(value)
  const max = Math.max(...values, 1)
  const total = values.reduce((sum, v) => sum + v, 0)

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={
          prefs.measure === "umsatz"
            ? "Umsatz und Marge"
            : prefs.measure === "marge"
              ? "Marge im Verlauf"
              : "Verkäufe im Verlauf"
        }
        description={
          prefs.channel === "alle"
            ? "Alle Kanäle."
            : `Nur ${SALE_CHANNEL_META[prefs.channel].label}.`
        }
        action={
          <span className="type-metric text-skope-gold">
            {prefs.measure === "anzahl" ? total : formatCentsCompact(total)}
          </span>
        }
      />

      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2 border-b border-skope-line px-4 py-3 sm:px-5">
        <Segmented
          label="Zeitraum"
          options={MONTH_OPTIONS}
          value={prefs.months}
          onChange={(months) => setPrefs({ months })}
        />
        <Segmented
          label="Kennzahl"
          options={MEASURE_OPTIONS}
          value={prefs.measure}
          onChange={(measure) => setPrefs({ measure })}
        />
        <Segmented
          label="Darstellung"
          options={SHAPE_OPTIONS}
          value={prefs.shape}
          onChange={(shape) => setPrefs({ shape })}
        />
        <select
          aria-label="Kanal filtern"
          value={prefs.channel}
          onChange={(event) =>
            setPrefs({ channel: event.target.value as ChartPrefs["channel"] })
          }
          className={cn(
            "ml-auto h-9 cursor-pointer rounded-lg border border-skope-line-strong bg-surface-sunken px-2.5 text-xs text-foreground",
            FOCUS_RING
          )}
        >
          <option value="alle">Kanal: alle</option>
          {SALE_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {SALE_CHANNEL_META[channel].label}
            </option>
          ))}
        </select>
      </div>

      <PanelBody>
        {total === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Für diese Auswahl gibt es keine Verkäufe.
          </p>
        ) : shape === "linie" ? (
          <LineChart
            points={data.map((month) => ({
              key: month.key,
              label: month.label,
              raw: value(month),
              text: format(value(month)),
              title: `${month.fullLabel}: ${format(value(month))}`,
              isCurrent: month.isCurrent,
            }))}
            max={max}
          />
        ) : (
          <div className="flex h-56 items-end gap-2 sm:gap-3">
            {data.map((month) => {
              const raw = value(month)
              const height = (raw / max) * 100
              const marginShare =
                shape === "gestapelt" && month.revenueCents > 0
                  ? Math.max(
                      0,
                      Math.min(100, (month.marginCents / month.revenueCents) * 100)
                    )
                  : 100

              return (
                <div
                  key={month.key}
                  className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-2"
                >
                  <p
                    className={cn(
                      "text-center type-caption tabular-nums transition-colors",
                      raw === 0
                        ? "text-muted-foreground/40"
                        : month.isCurrent
                          ? "font-medium text-skope-gold"
                          : "text-muted-foreground group-hover:text-foreground"
                    )}
                  >
                    {raw === 0 ? "—" : format(raw)}
                  </p>

                  <div
                    className="relative w-full overflow-hidden rounded-md bg-state-info/25"
                    style={{ height: `${Math.max(height, 2)}%` }}
                    title={`${month.fullLabel}: ${formatCents(month.revenueCents)} Umsatz, ${formatCents(month.marginCents)} Marge, ${month.count} Verkäufe`}
                  >
                    <div
                      className={cn(
                        "absolute inset-x-0 top-0 transition-[height] duration-300",
                        month.isCurrent
                          ? "bg-skope-gold"
                          : "bg-skope-gold/75 group-hover:bg-skope-gold"
                      )}
                      style={{ height: `${marginShare}%` }}
                    />
                  </div>

                  <div className="text-center">
                    <p
                      className={cn(
                        "type-caption font-medium",
                        month.isCurrent ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {month.label}
                    </p>
                    <p className="type-caption tabular-nums text-muted-foreground/70">
                      {month.count === 0 ? "—" : `${month.count}×`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {shape === "gestapelt" && total > 0 && (
          <div className="mt-4 flex items-center gap-4 border-t border-skope-line pt-3 type-caption text-muted-foreground">
            <LegendDot className="bg-skope-gold" label="Marge" />
            <LegendDot className="bg-state-info/60" label="Kosten" />
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

/** Verlaufslinie mit Fläche — für Trends über zwölf Monate lesbarer als Balken. */
function LineChart({
  points,
  max,
}: {
  points: {
    key: string
    label: string
    raw: number
    text: string
    title: string
    isCurrent: boolean
  }[]
  max: number
}) {
  const width = 100
  const height = 46
  // Rand lassen, sonst wird der Punkt des laufenden Monats halb abgeschnitten.
  const padX = 2
  const span = width - padX * 2
  const step = points.length > 1 ? span / (points.length - 1) : 0

  const coords = points.map((point, index) => ({
    ...point,
    x: points.length === 1 ? width / 2 : padX + index * step,
    y: height - (point.raw / max) * (height - 4) - 2,
  }))

  const line = coords.map((c) => `${c.x},${c.y}`).join(" ")
  const area = `${padX},${height} ${line} ${width - padX},${height}`

  return (
    <div className="h-56">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-[calc(100%-1.75rem)] w-full"
        role="img"
        aria-label={coords.map((c) => `${c.label}: ${c.text}`).join(", ")}
      >
        <defs>
          <linearGradient id="skope-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--skope-gold)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--skope-gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#skope-line-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="var(--skope-gold)"
          strokeWidth="0.8"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {coords.map((c) => (
          <circle
            key={c.key}
            cx={c.x}
            cy={c.y}
            r="0.9"
            fill={c.isCurrent ? "var(--skope-gold)" : "var(--card)"}
            stroke="var(--skope-gold)"
            strokeWidth="0.5"
            vectorEffect="non-scaling-stroke"
          >
            <title>{c.title}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex">
        {coords.map((c) => (
          <p
            key={c.key}
            className={cn(
              "min-w-0 flex-1 text-center type-caption",
              c.isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {c.label}
          </p>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Herkunft der Kunden                                                 */
/* ------------------------------------------------------------------ */

/** Feste Farbe je Herkunft — dieselbe überall, damit sie wiedererkennbar ist. */
const SOURCE_COLOR: Record<CustomerSource, string> = {
  WEBSITE: "bg-state-ready",
  GOOGLE: "bg-state-info",
  KLEINANZEIGEN: "bg-state-live",
  SOCIAL_MEDIA: "bg-state-done",
  EMPFEHLUNG: "bg-skope-gold",
  STAMMKUNDE: "bg-state-warn",
  LAUFKUNDSCHAFT: "bg-state-error",
  SONSTIGE: "bg-state-neutral",
  UNBEKANNT: "bg-skope-line-strong",
}

const CHANNEL_COLOR: Record<SaleChannel, string> = {
  SHOPIFY: "bg-state-ready",
  KLEINANZEIGEN: "bg-state-live",
  VOR_ORT: "bg-skope-gold",
  TELEFON: "bg-state-done",
  SONSTIGE: "bg-state-neutral",
}

/**
 * Woher die Kunden kamen und wo verkauft wurde.
 *
 * Herkunft und Kanal stehen bewusst nebeneinander: Der Kanal sagt, wo
 * abgewickelt wurde, die Herkunft, welche Werbung den Kunden gebracht hat.
 */
export function OriginChart() {
  const sales = useSales()
  const sources = useMemo(() => computeSourceShares(sales), [sales])
  const channels = useMemo(() => computeChannelShares(sales), [sales])
  const regions = useMemo(() => computeRegionShares(sales), [sales])

  const unknown = sources.find((entry) => entry.source === "UNBEKANNT")

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Herkunft und Kanäle"
        description="Woher die Kunden kamen, worüber verkauft wurde, wohin es ging."
      />
      <PanelBody className="space-y-6">
        {sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Noch keine Verkäufe erfasst.
          </p>
        ) : (
          <>
            <section>
              <p className="type-label mb-3">Kunde kam über</p>
              <ShareBar
                items={sources.map((entry) => ({
                  key: entry.source,
                  color: SOURCE_COLOR[entry.source],
                  share: entry.share,
                  label: CUSTOMER_SOURCE_META[entry.source].label,
                }))}
              />
              <ul className="mt-4 space-y-2.5">
                {sources.map((entry) => (
                  <ShareRow
                    key={entry.source}
                    color={SOURCE_COLOR[entry.source]}
                    label={CUSTOMER_SOURCE_META[entry.source].label}
                    value={formatCentsCompact(entry.revenueCents)}
                    hint={`${entry.count}× · ${Math.round(entry.share * 100)} % · Marge ${formatCentsCompact(entry.marginCents)}`}
                  />
                ))}
              </ul>
              {unknown && unknown.count > 0 && (
                <p className="mt-3 type-caption text-muted-foreground">
                  Bei {unknown.count} Verkauf{unknown.count === 1 ? "" : "en"}{" "}
                  wurde die Herkunft nicht erfasst — die Anteile darüber beziehen
                  sich nur auf das, was tatsächlich erfragt wurde.
                </p>
              )}
            </section>

            <section className="border-t border-skope-line pt-5">
              <p className="type-label mb-3">Verkauft über</p>
              <ul className="space-y-2.5">
                {channels.map((entry) => (
                  <ShareRow
                    key={entry.channel}
                    color={CHANNEL_COLOR[entry.channel]}
                    label={SALE_CHANNEL_META[entry.channel].label}
                    value={formatCentsCompact(entry.revenueCents)}
                    hint={`${entry.count}× · ${Math.round(entry.share * 100)} %`}
                  />
                ))}
              </ul>
            </section>

            <section className="border-t border-skope-line pt-5">
              <p className="type-label mb-3">Wohin verkauft</p>
              <ul className="space-y-2">
                {regions.map((entry) => (
                  <li
                    key={entry.region}
                    className="flex items-baseline justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-foreground">{entry.region}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {entry.count}× ·{" "}
                      <span className="font-medium text-foreground">
                        {formatCentsCompact(entry.revenueCents)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Gebundenes Kapital                                                  */
/* ------------------------------------------------------------------ */

const STAGE_COLOR: Record<string, string> = {
  EINGEGANGEN: "bg-state-info",
  IN_PRUEFUNG: "bg-state-warn",
  AUFBEREITUNG: "bg-state-progress",
  VERKAUFSBEREIT: "bg-state-ready",
}

export function CapitalChart() {
  const stages = useCapitalByStage()
  const max = Math.max(...stages.map((stage) => stage.tiedCents), 1)
  const total = stages.reduce((sum, stage) => sum + stage.tiedCents, 0)

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title="Gebundenes Kapital"
        description="Einkauf und Aufbereitung, die noch nicht zurückgeflossen sind."
        action={
          <span className="type-metric text-state-warn">
            {formatCentsCompact(total)}
          </span>
        }
      />
      <PanelBody>
        <ul className="space-y-3.5">
          {stages.map((stage) => (
            <li key={stage.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-foreground">
                  {stage.label}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="text-sm font-medium text-foreground">
                    {formatCentsCompact(stage.tiedCents)}
                  </span>
                  <span className="ml-2 type-caption text-muted-foreground">
                    {stage.count} Gerät{stage.count === 1 ? "" : "e"}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-track">
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    STAGE_COLOR[stage.key] ?? "bg-state-neutral"
                  )}
                  style={{
                    width: `${stage.tiedCents === 0 ? 0 : Math.max(2, (stage.tiedCents / max) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* Bausteine                                                           */
/* ------------------------------------------------------------------ */

function ShareBar({
  items,
}: {
  items: { key: string; color: string; share: number; label: string }[]
}) {
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-track"
      role="img"
      aria-label={items
        .map((item) => `${item.label} ${Math.round(item.share * 100)} Prozent`)
        .join(", ")}
    >
      {items.map((item) => (
        <div
          key={item.key}
          className={item.color}
          style={{ width: `${item.share * 100}%` }}
        />
      ))}
    </div>
  )
}

function ShareRow({
  color,
  label,
  value,
  hint,
}: {
  color: string
  label: string
  value: string
  hint: string
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", color)} aria-hidden />
          <span className="truncate text-sm text-foreground">{label}</span>
        </span>
        <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">
          {value}
        </span>
      </div>
      <p className="mt-0.5 pl-4 type-caption tabular-nums text-muted-foreground">
        {hint}
      </p>
    </li>
  )
}

/** Kleine Umschaltgruppe. Berührungsziel bleibt bei 36 px Höhe klickbar. */
function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-skope-line bg-surface-sunken p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-skope-gold/18 text-skope-gold"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              FOCUS_RING
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", className)} aria-hidden />
      {label}
    </span>
  )
}
