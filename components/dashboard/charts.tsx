"use client"

import { useId, useMemo } from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { FOCUS_RING } from "@/components/skope/focus"
import {
  formatCents,
  formatCentsAxis,
  formatCentsCompact
} from "@/lib/domain/money"
import {
  computeChannelShares,
  computeMonthlyRevenue,
  computeRegionShares,
  computeSourceShares
} from "@/lib/domain/metrics"
import { CUSTOMER_SOURCE_META, SALE_CHANNEL_META } from "@/lib/domain/status"
import {
  SALE_CHANNELS,
  type CustomerSource,
  type SaleChannel
} from "@/lib/domain/types"
import { useCapitalByStage, useChartPrefs, useSales } from "@/hooks/use-cockpit"
import type { ChartMeasure, ChartPrefs } from "@/lib/store/cockpit-store"
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
  { value: 12, label: "12 M" }
]

/**
 * Die darstellbaren Größen.
 *
 * `scale` entscheidet, welche Größen sich eine Höhenachse teilen. Umsatz und
 * Marge sind beide Geldbeträge und damit direkt vergleichbar. Stückzahlen
 * liegen um Größenordnungen darunter — auf derselben Achse wären sie eine
 * Linie am Boden, deshalb bekommen sie eine eigene und die Legende sagt das
 * auch. Ein stillschweigend umskaliertes Diagramm lügt.
 */
const MEASURE_META: Record<
  ChartMeasure,
  { label: string; scale: "geld" | "stueck"; color: string; dot: string }
> = {
  umsatz: {
    label: "Umsatz",
    scale: "geld",
    color: "var(--skope-accent)",
    dot: "bg-skope-accent"
  },
  marge: {
    label: "Marge",
    scale: "geld",
    color: "var(--state-live)",
    dot: "bg-state-live"
  },
  anzahl: {
    label: "Stück",
    scale: "stueck",
    color: "var(--state-done)",
    dot: "bg-state-done"
  }
}

const MEASURE_OPTIONS: { value: ChartMeasure; label: string }[] = (
  Object.keys(MEASURE_META) as ChartMeasure[]
).map((value) => ({ value, label: MEASURE_META[value].label }))

/** Dieselben Farben für den Umschalter — aus einer Quelle, nicht doppelt gepflegt. */
const MEASURE_COLORS = Object.fromEntries(
  (Object.keys(MEASURE_META) as ChartMeasure[]).map((measure) => [
    measure,
    MEASURE_META[measure].color
  ])
) as Record<ChartMeasure, string>

const SHAPE_OPTIONS: { value: ChartPrefs["shape"]; label: string }[] = [
  { value: "gestapelt", label: "Gestapelt" },
  { value: "balken", label: "Balken" },
  { value: "linie", label: "Linie" }
]

/**
 * Höhenachse mit verankerter Nulllinie.
 *
 * Vorher war die Achse eine reine Obergrenze und jeder Wert wurde als Anteil
 * daran gezeichnet. Bei einer negativen Marge kam dabei ein *positiver*
 * Balken heraus: Ein Verlustmonat sah aus wie ein schwacher Gewinnmonat.
 * Waren alle Margen negativ, fiel die Achse auf einen Cent zusammen und zeigte
 * fünfmal „0 €".
 *
 * Deshalb spannt die Achse jetzt von der kleinsten bis zur größten Zahl und
 * schließt die Null immer ein. `zero` sagt, wo die Nulllinie liegt — von unten
 * gemessen, als Anteil der Höhe. Solange nichts negativ ist, steht sie bei 0
 * und alles verhält sich wie zuvor.
 */
interface Scale {
  min: number
  max: number
  span: number
  zero: number
}

function makeScale(values: number[]): Scale {
  const rawMax = Math.max(0, ...values)
  const rawMin = Math.min(0, ...values)
  // Ohne Werte bleibt eine Spanne von 1 — sonst teilt jede Höhe durch null.
  const rawSpan = rawMax - rawMin || 1

  /*
    Luft für die Zahl über dem Balken.

    Ohne sie reicht der größte Balken exakt bis zur obersten Rasterlinie und
    seine Beschriftung steht außerhalb der Karte. Die Alternative wäre, die
    Balkenzone gegenüber dem Raster einzurücken — dann stimmen die abgelesenen
    Linien aber nicht mehr mit den Balken überein, und genau dafür sind sie da.
  */
  const pad = rawSpan * 0.12
  const max = rawMax > 0 ? rawMax + pad : 0
  const min = rawMin < 0 ? rawMin - pad : 0
  const span = max - min || 1

  return { min, max, span, zero: -min / span }
}

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

  /*
    Nie leer und nie undefined.

    Der Store hebt einen alten gespeicherten Stand beim Laden an, aber die
    Oberfläche verlässt sich nicht darauf: Ein Stand, der die Umstellung aus
    irgendeinem Grund nicht mitbekommen hat, darf höchstens die Voreinstellung
    zeigen — nicht die ganze Ansicht mit einem Zugriff auf `undefined`
    umlegen.
  */
  const measures: ChartMeasure[] = prefs.measures?.length
    ? prefs.measures
    : ["umsatz"]
  // Leitgröße — auf sie beziehen sich Kopfzahl, Trend und Eckwerte.
  const primary = measures[0]

  // "Gestapelt" zerlegt den Umsatz in Marge und Ausgaben. Das ergibt nur für
  // den Umsatz allein Sinn; sobald mehrere Größen nebeneinander stehen oder
  // eine andere gewählt ist, fällt die Form auf gruppierte Balken zurück.
  const shape =
    prefs.shape === "gestapelt" &&
    !(measures.length === 1 && primary === "umsatz")
      ? "balken"
      : prefs.shape

  const seriesOf = (measure: ChartMeasure) =>
    data.map((month) =>
      measure === "umsatz"
        ? month.revenueCents
        : measure === "marge"
          ? month.marginCents
          : month.count
    )

  const formatOf = (measure: ChartMeasure, raw: number) =>
    measure === "anzahl" ? String(raw) : formatCentsCompact(raw)

  const format = (raw: number) => formatOf(primary, raw)

  // Geldbeträge teilen sich eine Höhenachse, Stückzahlen haben ihre eigene.
  const moneyScale = makeScale(
    measures
      .filter((measure) => MEASURE_META[measure].scale === "geld")
      .flatMap(seriesOf)
  )
  const countScale = makeScale(
    measures.includes("anzahl") ? seriesOf("anzahl") : []
  )
  const scaleOf = (measure: ChartMeasure) =>
    MEASURE_META[measure].scale === "geld" ? moneyScale : countScale

  const mixedScales =
    measures.some((m) => MEASURE_META[m].scale === "geld") &&
    measures.includes("anzahl")

  /*
    Beschriftung der Höhenachse.

    Sie richtet sich nach der Geldachse, sobald ein Geldbetrag dabei ist —
    Stückzahlen laufen auf ihrer eigenen Skala, worauf die Fußzeile hinweist.
    Vier Ableselinien plus Grundlinie ergeben fünf Werte von oben nach unten.
  */
  const axisMeasure: ChartMeasure =
    measures.find((m) => MEASURE_META[m].scale === "geld") ?? "anzahl"
  const axisScale = scaleOf(axisMeasure)
  const ticks = GRID_STEPS.map((offset) => {
    const value = axisScale.max - (axisScale.span * offset) / 100
    return axisMeasure === "anzahl"
      ? String(Math.round(value))
      : formatCentsAxis(value)
  })

  const values = seriesOf(primary)
  const total = values.reduce((sum, v) => sum + v, 0)
  const totalOf = (measure: ChartMeasure) =>
    seriesOf(measure).reduce((sum, v) => sum + v, 0)

  /*
    „Gibt es Verkäufe?" ist eine Frage an die Datenmenge, nicht an die Summe.

    Vorher hing der Leerzustand an `total === 0` und die Kopfzahl an
    `total > 0`. Zwei Verkäufe mit +500 € und −500 € Marge ergeben in Summe
    null — das Diagramm behauptete daraufhin, es gäbe keine Verkäufe. Und ein
    Zeitraum mit Verlust ließ Kopfzahl, Trend und Fußleiste ersatzlos
    verschwinden, obwohl gerade dann jemand hinsehen will.
  */
  const hasSales = data.some((month) => month.count > 0)

  /*
    Die Reihen einmal berechnen, nicht einmal je Monat und Kennzahl.

    Die Balkenzone hat vorher für jede Säule `seriesOf(measure)` neu aufgebaut
    und den Monat dann mit `indexOf` darin gesucht — bei zwölf Monaten und drei
    Größen sechsunddreißig Durchläufe plus sechsunddreißig Suchen pro Bild,
    obwohl der Index direkt daneben lag.
  */
  const seriesByMeasure: Partial<Record<ChartMeasure, number[]>> =
    Object.fromEntries(measures.map((measure) => [measure, seriesOf(measure)]))

  /*
    Kennzahlen des gewählten Zeitraums.

    Der Trend vergleicht den letzten mit dem vorletzten Monat, nicht mit dem
    ersten: Wer aufs Dashboard schaut, will wissen, wohin es gerade läuft.
    Unter einem halben Prozent gilt der Verlauf als unverändert — sonst zeigte
    ein Pfeil Bewegung an, wo keine ist.
  */
  const last = values[values.length - 1] ?? 0
  const previous = values[values.length - 2] ?? 0
  const step = last - previous
  /*
    Der Nenner ist der Betrag des Vormonats, nicht sein vorzeichenbehafteter
    Wert: Von −100 € auf +50 € ist eine Verbesserung, die Rechnung mit dem
    negativen Nenner hätte daraus „−150 %" und einen Abwärtspfeil gemacht.
    Die Richtung kommt ohnehin aus dem Vorzeichen des Schritts.
  */
  const changePercent =
    previous === 0 ? 0 : (step / Math.abs(previous)) * 100
  // Aus dem Nichts kommt kein Prozentwert — sonst stünde dort „unverändert".
  const fromNothing = previous === 0 && last !== 0
  const direction = fromNothing
    ? last > 0
      ? "hoch"
      : "runter"
    : Math.abs(changePercent) < 0.5
      ? "gleich"
      : step > 0
        ? "hoch"
        : "runter"

  /*
    Spitze, Tief und Durchschnitt beziehen sich auf Monate mit Verkäufen.

    Der Filter lief vorher über das Vorzeichen des Werts und warf damit jeden
    Verlustmonat mit hinaus — ausgerechnet den, den man in der Fußleiste sucht.
    Gemeint waren immer nur die Monate ohne jeden Verkauf.
  */
  const activeValues = values.filter((_, index) => data[index].count > 0)
  const peak = activeValues.length ? Math.max(...activeValues) : 0
  const low = activeValues.length ? Math.min(...activeValues) : 0
  const average = activeValues.length
    ? Math.round(
        activeValues.reduce((sum, v) => sum + v, 0) / activeValues.length
      )
    : 0

  const TrendIcon =
    direction === "gleich"
      ? Minus
      : direction === "hoch"
        ? ArrowUpRight
        : ArrowDownRight

  const trendTone =
    direction === "gleich"
      ? "text-muted-foreground"
      : direction === "hoch"
        ? "text-skope-accent"
        : "text-state-error"

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={
          measures.length > 1
            ? measures.map((m) => MEASURE_META[m].label).join(" · ")
            : primary === "umsatz"
              ? shape === "gestapelt"
                ? "Umsatz, Marge und Ausgaben"
                : "Umsatz im Verlauf"
              : primary === "marge"
                ? "Marge im Verlauf"
                : "Verkäufe im Verlauf"
        }
        description={
          prefs.channel === "alle"
            ? "Alle Kanäle."
            : `Nur ${SALE_CHANNEL_META[prefs.channel].label}.`
        }
      />

      {/*
        Leitzahl der Auswertung.

        Sie stand vorher klein rechts in der Kopfzeile und ging zwischen den
        Umschaltern unter. Jetzt trägt sie die Karte, der Trend steht direkt
        daneben — Summe und Richtung in einem Blick.
      */}
      {hasSales && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2 px-4 pt-4 pb-1 sm:px-5">
          <p className="type-metric-hero">{format(total)}</p>
          <div className="flex flex-col gap-1 pb-1.5">
            <span
              className={cn(
                "flex items-center gap-1 type-body-sm font-medium tabular-nums",
                trendTone
              )}
            >
              <TrendIcon className="size-4 shrink-0" aria-hidden />
              {fromNothing
                ? "neu"
                : direction === "gleich"
                  ? "unverändert"
                  : `${changePercent > 0 ? "+" : "−"}${Math.abs(changePercent).toFixed(1)} %`}
            </span>
            <span className="type-caption text-muted-foreground">
              {MEASURE_META[primary].label} gegenüber dem Vormonat
            </span>
          </div>

          {/* Summen der übrigen gewählten Größen — kleiner, aber ablesbar. */}
          {measures.length > 1 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-1.5">
              {measures.slice(1).map((measure) => (
                <span
                  key={measure}
                  className="flex items-center gap-1.5 type-body-sm tabular-nums text-muted-foreground"
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      MEASURE_META[measure].dot
                    )}
                    aria-hidden
                  />
                  <span className="font-medium text-foreground">
                    {formatOf(measure, totalOf(measure))}
                  </span>
                  {MEASURE_META[measure].label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <Segmented
          label="Zeitraum"
          options={MONTH_OPTIONS}
          value={prefs.months}
          onChange={(months) => setPrefs({ months })}
        />
        <MultiSegmented
          label="Kennzahlen"
          options={MEASURE_OPTIONS}
          values={measures}
          onChange={(next) => setPrefs({ measures: next })}
          colors={MEASURE_COLORS}
        />
        <Segmented
          label="Darstellung"
          options={SHAPE_OPTIONS}
          value={shape}
          onChange={(next) => setPrefs({ shape: next })}
          disabled={
            measures.length === 1 && primary === "umsatz"
              ? undefined
              : {
                  gestapelt:
                    "Gestapelt zerlegt den Umsatz in Marge und Ausgaben — nur für den Umsatz allein verfügbar"
                }
          }
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
        {!hasSales ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Für diese Auswahl gibt es keine Verkäufe.
          </p>
        ) : shape === "linie" ? (
          <LineChart
            ticks={ticks}
            months={data.map((month) => ({
              key: month.key,
              label: month.label,
              fullLabel: month.fullLabel,
              isCurrent: month.isCurrent
            }))}
            series={measures.map((measure) => ({
              key: measure,
              label: MEASURE_META[measure].label,
              color: MEASURE_META[measure].color,
              values: seriesOf(measure),
              scale: scaleOf(measure),
              format: (raw: number) => formatOf(measure, raw)
            }))}
          />
        ) : (
          /*
            Balkenzone und Beschriftungszeile sind getrennt und teilen sich nur
            denselben Spaltenabstand. Nur so endet das Raster exakt auf der
            Grundlinie der Balken — lagen die Beschriftungen mit in der Spalte,
            saß die unterste Rasterlinie 43 px zu tief.
          */
          <div>
            <div
              className={cn(
                "relative flex h-64 items-end gap-1.5 sm:gap-3",
                AXIS_PAD
              )}
            >
              <ChartGrid ticks={ticks} />
              {data.map((month, monthIndex) => {
                const marginShare =
                  month.revenueCents > 0
                    ? Math.max(
                        0,
                        Math.min(
                          100,
                          (month.marginCents / month.revenueCents) * 100
                        )
                      )
                    : 100

                const raw = month[
                  primary === "umsatz"
                    ? "revenueCents"
                    : primary === "marge"
                      ? "marginCents"
                      : "count"
                ] as number

                return (
                  <div
                    key={month.key}
                    className="group relative z-10 h-full min-w-0 flex-1"
                  >
                    {/*
                      Der Balken sitzt auf der Nulllinie der Achse, nicht auf
                      dem unteren Rand: Solange nichts negativ ist, fällt
                      beides zusammen; sobald ein Monat ins Minus läuft, wächst
                      seine Säule nach unten statt sich als kleiner Gewinn zu
                      tarnen.
                    */}
                    {shape === "gestapelt" ? (
                      /*
                        Gestapelt: unten die Ausgaben, darüber die Marge.
                        Zusammen ergeben sie den Umsatz — die Säule zeigt also
                        nicht nur, wie viel hereinkam, sondern was davon
                        geblieben ist. Umsatz ist nie negativ, deshalb bleibt
                        diese Form auf der Grundlinie stehen.

                        Der Grund ist deckend (`bg-card`): Sonst zeichnet sich
                        das Punktraster durch die Ausgabenfläche hindurch ab.
                      */
                      <div className="flex h-full flex-col justify-end gap-2">
                        <p className="flex justify-center">
                          <span
                            className={cn(
                              "rounded-md px-0.5 py-0.5 text-center type-micro font-medium transition-colors sm:px-1.5 sm:text-xs",
                              raw === 0
                                ? "text-muted-foreground"
                                : month.isCurrent
                                  ? "bg-skope-accent/15 text-skope-accent"
                                  : "text-foreground/90 group-hover:bg-surface-raised"
                            )}
                          >
                            {raw === 0 ? "—" : format(raw)}
                          </span>
                        </p>
                        <div
                          className={cn(
                            "animate-bar-rise relative w-full overflow-hidden rounded-t-md rounded-b-sm bg-card",
                            "ring-inset transition-shadow duration-fast",
                            /*
                              Die Umrandung trägt die Umsatzfarbe: Die Säule
                              als Ganzes *ist* der Umsatz. Vorher war der Rand
                              ein farbloses Weiß-Fünfprozent, und nachdem die
                              Margenfläche ihre eigene Farbe bekam, gab es im
                              Balken kein Umsatzmerkmal mehr.
                            */
                            /*
                              Der laufende Monat unterscheidet sich über die
                              Stärke der Umrandung, nicht über einen farbigen
                              Schein: Ein Leuchten um ein Element führt das
                              System nirgends sonst, und der laufende Monat
                              ist kein Alarm, sondern eine Einordnung.
                            */
                            month.isCurrent
                              ? "ring-2 ring-skope-accent/70"
                              : "ring-1 ring-skope-accent/45 group-hover:ring-skope-accent/70"
                          )}
                          style={{
                            height: `${Math.max((month.revenueCents / moneyScale.max || 0) * 100, month.revenueCents === 0 ? 0 : 2)}%`
                          }}
                          title={`${month.fullLabel}: ${formatCents(month.revenueCents)} Umsatz, ${formatCents(month.marginCents)} Marge, ${month.count} Verkäufe`}
                        >
                        {/*
                          Deckende Fläche statt Transparenz.

                          Vorher lagen Ausgaben und Marge bei 45–70 % Deckung
                          über der fast schwarzen Karte. Beide Töne
                          entsättigten dadurch ins Bräunliche bzw. Stahlblaue
                          und waren aus zwei Metern kaum noch zu trennen. Der
                          Verlauf dunkelt jetzt über die Farbe selbst ab, nicht
                          über den Untergrund.
                        */}
                        <span
                          className="absolute inset-0"
                          style={{
                            backgroundImage:
                              "linear-gradient(to bottom, var(--state-cost), color-mix(in srgb, var(--state-cost) 68%, #000))"
                          }}
                          aria-hidden
                        />
                        {/*
                          Die Marge trägt hier dieselbe Farbe wie überall
                          sonst. Vorher war dieser Streifen im Markengrün:
                          Beim Umschalten von „Gestapelt" auf „Balken"
                          wechselte dieselbe Größe die Farbe von Grün auf
                          Cyan — die Säule als Ganzes ist der Umsatz, der
                          Streifen darin ist die Marge, und beides muss
                          auseinanderzuhalten sein.
                        */}
                        <div
                          className="absolute inset-x-0 top-0 transition-[height] duration-base ease-out"
                          style={{
                            height: `${marginShare}%`,
                            backgroundImage: `linear-gradient(to bottom, var(--state-live), color-mix(in srgb, var(--state-live) ${month.isCurrent ? 78 : 70}%, #000))`
                          }}
                        >
                          {/* Glanzkante — fängt das Licht an der Oberkante. */}
                          <span
                            className="absolute inset-x-0 top-0 h-px bg-white/35"
                            aria-hidden
                          />
                          {/*
                            Untere Kante: trennt Marge und Ausgaben sichtbar.
                            Zwei deckende Flächen ohne Fuge lesen sich sonst
                            als ein einziger Verlauf.
                          */}
                          <span
                            className="absolute inset-x-0 bottom-0 h-px bg-black/45"
                            aria-hidden
                          />
                        </div>
                        </div>
                      </div>
                    ) : measures.length === 1 ? (
                      /*
                        Die Zahl trägt der Balken selbst: Sie muss bei einem
                        Verlust unter die Nulllinie wandern, und nur der Balken
                        weiß, wo sein äußeres Ende liegt.
                      */
                      <MeasureBar
                        className="w-full"
                        measure={primary}
                        value={raw}
                        scale={scaleOf(primary)}
                        valueLabel={raw === 0 ? "—" : format(raw)}
                        label={`${MEASURE_META[primary].label} ${month.fullLabel}: ${formatOf(primary, raw)}`}
                        highlighted={month.isCurrent}
                      />
                    ) : (
                      /*
                        Bei mehreren Größen wären es drei Zahlen über drei
                        schmalen Säulen — unlesbar; dort trägt die Beschriftung
                        beim Überfahren.
                      */
                      <div className="flex h-full w-full justify-center gap-[2px]">
                        {measures.map((measure) => {
                          const value =
                            (seriesByMeasure[measure] ?? [])[monthIndex] ?? 0
                          return (
                            <MeasureBar
                              key={measure}
                              className="min-w-0 flex-1"
                              measure={measure}
                              value={value}
                              scale={scaleOf(measure)}
                              label={`${MEASURE_META[measure].label} ${month.fullLabel}: ${formatOf(measure, value)}`}
                              highlighted={month.isCurrent}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className={cn("mt-2.5 flex gap-1.5 sm:gap-3", AXIS_PAD)}>
              {data.map((month) => (
                <div key={month.key} className="min-w-0 flex-1 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      month.isCurrent
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {month.label}
                  </p>
                  <p className="type-caption tabular-nums text-muted-foreground/70">
                    {month.count === 0 ? "—" : `${month.count}×`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </PanelBody>

      {/*
        Fußleiste. Legende links, Eckwerte rechts.

        Spitze, Tief und Durchschnitt beziehen sich nur auf Monate mit
        Verkäufen — ein leerer Monat ist keine Talsohle, sondern eine
        Betriebspause, und würde den Durchschnitt verfälschen.
      */}
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-skope-line bg-surface-sunken px-4 py-3 type-caption text-muted-foreground sm:px-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {shape === "gestapelt" ? (
              <>
                {/*
                  Der Umsatz gehört in die Legende, obwohl er keine eigene
                  Fläche hat: Er ist die Gesamthöhe der Säule. Ohne ihn stand
                  in der Legende nur, was *in* der Säule steckt — und die
                  Größe, um die es in der Auswertung geht, war die einzige
                  ohne Eintrag.
                */}
                <LegendDot
                  className={MEASURE_META.umsatz.dot}
                  label="Umsatz — Gesamthöhe"
                />
                <LegendDot className={MEASURE_META.marge.dot} label="Marge" />
                <LegendDot className="bg-state-cost" label="Ausgaben" />
              </>
            ) : (
              <>
                {measures.map((measure, order) => (
                  <LegendDot
                    key={measure}
                    className={MEASURE_META[measure].dot}
                    label={MEASURE_META[measure].label}
                    color={MEASURE_META[measure].color}
                    /*
                      Die Strichart steht nur dabei, wenn es überhaupt Striche
                      gibt und mehr als einer — bei einer einzigen Kurve ist
                      die Farbe eindeutig, und ein Liniensymbol neben einem
                      Balkendiagramm wäre schlicht falsch.
                    */
                    stroke={
                      shape === "linie" && measures.length > 1
                        ? order === 0
                          ? "solid"
                          : order === 1
                            ? "dashed"
                            : "dotted"
                        : undefined
                    }
                  />
                ))}
                {/*
                  Bei gemischten Einheiten muss dabeistehen, dass die
                  Stückzahlen nicht auf derselben Höhenachse liegen — sonst
                  liest jemand aus zwei gleich hohen Säulen einen Zusammenhang
                  heraus, den es nicht gibt.
                */}
                {mixedScales && (
                  <span className="text-muted-foreground/70">
                    Stück auf eigener Skala
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5 tabular-nums">
            <FooterStat label="Spitze" value={format(peak)} />
            <span className="opacity-40">·</span>
            <FooterStat label="Tief" value={format(low)} />
            <span className="opacity-40">·</span>
            <FooterStat label="Ø" value={format(average)} />
          </div>
        </div>
      )}
    </Panel>
  )
}

/**
 * Einzelne Säule in der Farbe ihrer Kennzahl.
 *
 * `className` bestimmt die Breite und kommt von außen. Die Säule hatte
 * `flex-1` fest eingebaut — das passte in der Gruppe nebeneinanderstehender
 * Säulen (dort liegt die Hauptachse waagerecht), stand bei einer einzelnen
 * Kennzahl aber in einer Spalte mit senkrechter Hauptachse. Dort bedeutet
 * `flex-1` „wachse in der Höhe": Jeder Balken füllte die volle Höhe, auch bei
 * null Euro, und die Höhenangabe daneben lief ins Leere.
 */
function MeasureBar({
  measure,
  value,
  scale,
  label,
  valueLabel,
  highlighted,
  className
}: {
  measure: ChartMeasure
  value: number
  scale: Scale
  label: string
  /** Zahl am äußeren Ende des Balkens. Nur bei einer einzigen Kennzahl. */
  valueLabel?: string
  highlighted: boolean
  className?: string
}) {
  const negative = value < 0
  // Verluste tragen die Fehlerfarbe, nicht die abgedunkelte Kennzahlfarbe:
  // Ein Minus soll sich nicht wie ein schwacher Gewinn lesen.
  const color = negative ? "var(--state-error)" : MEASURE_META[measure].color

  /*
    Anteil an der Gesamtspanne, nicht an der Obergrenze — sonst kippt das Bild,
    sobald ein Wert unter null liegt. Der Mindestanteil hält einen sehr kleinen
    Wert sichtbar, ein echtes Null bleibt aber unsichtbar: Dort steht nichts,
    also soll dort auch nichts stehen.
  */
  const share = value === 0 ? 0 : Math.max(Math.abs(value) / scale.span, 0.02)
  const base = scale.zero - (negative ? share : 0)

  return (
    <div className={cn("relative h-full", className)}>
      <div
        className={cn(
          "animate-bar-rise absolute inset-x-0 overflow-hidden",
          "ring-1 ring-white/[0.05] ring-inset transition-shadow duration-fast",
          negative ? "rounded-t-sm rounded-b-md" : "rounded-t-md rounded-b-sm"
        )}
        style={{
          height: `${share * 100}%`,
          bottom: `${base * 100}%`,
          backgroundImage: `linear-gradient(to ${negative ? "top" : "bottom"}, ${color}, color-mix(in srgb, ${color} 62%, #000))`,
          boxShadow: highlighted
            ? `0 0 24px -6px color-mix(in srgb, ${color} 80%, transparent)`
            : undefined
        }}
        title={label}
      >
        {/* Glanzkante — fängt das Licht an der äußeren Kante. */}
        <span
          className={cn(
            "absolute inset-x-0 h-px bg-white/35",
            negative ? "bottom-0" : "top-0"
          )}
          aria-hidden
        />
      </div>

      {valueLabel && (
        <span
          className={cn(
            "absolute left-1/2 -translate-x-1/2 rounded-md px-0.5 py-0.5 text-center type-micro font-medium whitespace-nowrap sm:px-1.5 sm:text-xs",
            value === 0 && "text-muted-foreground",
            value !== 0 && !highlighted && "text-foreground/90"
          )}
          /*
            Der laufende Monat wird in der Farbe seiner eigenen Kennzahl
            hervorgehoben, nicht im Markengrün: Bei der cyanfarbenen Marge
            stand sonst eine grüne Zahl über einem cyanfarbenen Balken.
          */
          style={{
            ...(negative
              ? { top: `${(1 - base) * 100}%`, marginTop: "0.25rem" }
              : { bottom: `${(base + share) * 100}%`, marginBottom: "0.25rem" }),
            ...(value !== 0 && highlighted
              ? {
                  color,
                  backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`
                }
              : {})
          }}
        >
          {valueLabel}
        </span>
      )}
    </div>
  )
}

function FooterStat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="font-medium text-foreground/85">{value}</span> {label}
    </span>
  )
}

/**
 * Weiche Kurve durch alle Punkte (Catmull-Rom, in kubische Bézier übersetzt).
 *
 * Ein reiner Streckenzug knickt an jedem Monat sichtbar ab. Die Spannung ist
 * mit 0.5 bewusst niedrig gehalten: Die Kurve glättet die Ecken, schwingt aber
 * nicht über die Messwerte hinaus — sonst zeigte das Diagramm Zwischenwerte,
 * die es nie gegeben hat.
 */
function toSmoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return ""
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
  }

  const tension = 0.5
  let path = `M${points[0].x},${points[0].y}`

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension

    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }

  return path
}

interface LineSeries {
  key: string
  label: string
  color: string
  values: number[]
  scale: Scale
  format: (raw: number) => string
}

/**
 * Verlaufskurven — eine je gewählter Kennzahl.
 *
 * Die Fläche unter der Kurve wird nur bei einer einzigen Reihe gefüllt. Bei
 * mehreren überlagern sich die Flächen zu einem trüben Brei, in dem keine der
 * Kurven mehr ablesbar ist.
 */
function LineChart({
  months,
  series,
  ticks
}: {
  months: {
    key: string
    label: string
    fullLabel: string
    isCurrent: boolean
  }[]
  series: LineSeries[]
  ticks?: string[]
}) {
  const fillId = `skope-area-${useId().replace(/:/g, "")}`

  const width = 100
  const height = 46
  /*
    Seitlicher Rand.

    Er war 2 und damit zu knapp: Der Punkt des laufenden Monats mit seinem
    Lichthof lief rechts aus der Zeichenfläche heraus und wurde angeschnitten.
  */
  const padX = 3
  /*
    Luft nach oben und unten.

    Ohne den unteren Rand liegt ein Monat ohne Verkäufe exakt auf der
    Grundlinie und der Strich verschwindet in der Achse — genau das sah bei
    mehreren leeren Monaten hintereinander nach einem Fehler aus statt nach
    einer Null.
  */
  const padTop = 5
  const padBottom = 4

  const span = width - padX * 2
  const step = months.length > 1 ? span / (months.length - 1) : 0
  const xOf = (index: number) =>
    months.length === 1 ? width / 2 : padX + index * step
  /*
    Der Wert wird in die Spanne der Achse eingeordnet, nicht durch ihre
    Obergrenze geteilt. Bei einer negativen Marge gab die alte Rechnung eine
    y-Lage *unterhalb* der Zeichenfläche zurück: Die Kurve wurde vom SVG
    abgeschnitten und die zugehörige Zahl landete über den Monatsnamen.
  */
  const yOf = (raw: number, scale: Scale) =>
    height -
    padBottom -
    ((raw - scale.min) / scale.span) * (height - padTop - padBottom)

  /*
    Strichart je Reihe, damit sich deckungsgleiche Kurven trennen lassen.

    Farbe allein genügt nicht: Wo zwei Kurven denselben Verlauf nehmen, deckt
    die später gezeichnete die frühere vollständig ab — die Leitgröße lag als
    erste unten und war dann gar nicht mehr zu sehen. Die Leitgröße bleibt
    durchgezogen und etwas kräftiger; die weiteren Reihen sind gestrichelt
    beziehungsweise gepunktet und lassen den Strich darunter durch ihre Lücken
    sichtbar.
  */
  const DASH = [undefined, "7 4", "2 3.5"] as const

  const paths = series.map((line, order) => {
    const coords = line.values.map((raw, index) => ({
      x: xOf(index),
      y: yOf(raw, line.scale)
    }))
    return {
      ...line,
      coords,
      d: toSmoothPath(coords),
      primary: order === 0,
      dash: series.length > 1 ? DASH[order % DASH.length] : undefined
    }
  })

  const primary = paths[0]
  // Die Fläche endet auf der Nulllinie, nicht am unteren Rand — sonst füllt
  // sie bei negativen Werten den Bereich unter null gleich mit aus.
  const baseY = yOf(0, primary.scale)
  const area = `${primary.d} L${width - padX},${baseY} L${padX},${baseY} Z`
  const showZeroLine = primary.scale.min < 0

  return (
    <div className="relative h-64">
      <ChartGrid className="bottom-7" ticks={ticks} />
      {/*
        Die Zeichenfläche wird in der Breite gestreckt (preserveAspectRatio
        none), damit die Kurven unabhängig von der Panelbreite dieselbe Form
        behalten. Kreise würden dadurch zu Ellipsen verzerrt — die Punkte
        liegen deshalb als eigene Ebene darüber und bleiben rund.
      */}
      <div
        className={cn(
          "relative h-[calc(100%-1.75rem)]",
          AXIS_MARGIN
        )}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="relative z-10 h-full w-full"
          role="img"
          aria-label={paths
            .map(
              (line) =>
                `${line.label}: ${months
                  .map(
                    (month, i) =>
                      `${month.label} ${line.format(line.values[i])}`
                  )
                  .join(", ")}`
            )
            .join(". ")}
        >
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary.color} stopOpacity="0.38" />
              <stop offset="55%" stopColor={primary.color} stopOpacity="0.10" />
              <stop offset="100%" stopColor={primary.color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {series.length === 1 && <path d={area} fill={`url(#${fillId})`} />}

          {/* Nulllinie — nur nötig, wenn es überhaupt etwas darunter gibt. */}
          {showZeroLine && (
            <line
              x1={padX}
              x2={width - padX}
              y1={baseY}
              y2={baseY}
              stroke="var(--state-error)"
              strokeOpacity="0.45"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {paths.map((line) => (
            /*
              Die Kurve wird von links freigelegt statt „gezeichnet".

              Die frühere Lösung strichelte den Pfad und schob den Versatz
              weg — dafür muss die Pfadlänge bekannt sein. Sie stand als
              fester Wert im Code, und sobald die echte Kurve länger war,
              wiederholte sich das Muster: Der Anfang der Linie lag in einer
              Lücke und war nur noch als matter Schein zu sehen. Genau der
              dunkle linke Teil im Diagramm. Ein Freilegen kennt keine Länge
              und kann deshalb nicht danebenliegen.
            */
            <g key={line.key} className="animate-line-reveal">
              {/*
                Der Schein trägt den Strich auf dunklem Grund — aber nur bei
                einer einzigen Reihe. Bei mehreren legen sich drei
                sieben Pixel breite Höfe übereinander und verwaschen genau die
                Stelle, an der man zwei Kurven auseinanderhalten muss.
              */}
              {series.length === 1 && (
                <path
                  d={line.d}
                  fill="none"
                  stroke={line.color}
                  strokeWidth="7"
                  strokeOpacity="0.16"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={line.d}
                fill="none"
                stroke={line.color}
                strokeWidth={line.primary ? 3 : 2.25}
                strokeDasharray={line.dash}
                strokeLinejoin="round"
                strokeLinecap={line.dash ? "butt" : "round"}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>

        {/*
          Punkte. Bei einer Reihe auf jedem Monat, bei mehreren nur auf dem
          laufenden — sonst liegen bei zwölf Monaten und drei Kennzahlen
          sechsunddreißig Punkte übereinander.
        */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {paths.map((line) =>
            line.coords.map((point, index) => {
              const month = months[index]
              if (series.length > 1 && !month.isCurrent) return null

              return (
                <span
                  key={`${line.key}-${month.key}`}
                  title={`${line.label} ${month.fullLabel}: ${line.format(line.values[index])}`}
                  className={cn(
                    "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full",
                    month.isCurrent ? "size-2.5" : "size-1.5"
                  )}
                  style={{
                    left: `${(point.x / width) * 100}%`,
                    top: `${(point.y / height) * 100}%`,
                    background: month.isCurrent ? line.color : "var(--card)",
                    border: month.isCurrent
                      ? "none"
                      : `1.5px solid ${line.color}`,
                    boxShadow: month.isCurrent
                      ? `0 0 0 4px color-mix(in srgb, ${line.color} 22%, transparent)`
                      : undefined
                  }}
                />
              )
            })
          )}
        </div>

        {/*
          Werte an der Kurve.

          Nur bei einer einzigen Reihe: Bei mehreren stünden die Zahlen
          übereinander, sobald sich zwei Kurven nähern. Dort trägt stattdessen
          die Zahl am laufenden Monat, die weiter unten steht.
        */}
        {series.length === 1 && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {paths[0].coords.map((point, index) => {
              const month = months[index]
              const value = paths[0].values[index]

              return (
                <span
                  key={month.key}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-[1.45rem] rounded-md px-1 text-xs font-medium tabular-nums whitespace-nowrap",
                    value === 0
                      ? "text-muted-foreground"
                      : value < 0
                        ? "text-state-error"
                        : month.isCurrent
                          ? "bg-skope-accent/15 text-skope-accent"
                          : "text-foreground/85"
                  )}
                  style={{
                    left: `${(point.x / width) * 100}%`,
                    top: `${(point.y / height) * 100}%`
                  }}
                >
                  {value === 0 ? "—" : paths[0].format(value)}
                </span>
              )
            })}
          </div>
        )}

        {/*
          Monatsnamen liegen genau unter ihrem Punkt, nicht in gleich breiten
          Spalten: Die Punkte sitzen im gepolsterten Koordinatenraum der Kurve,
          gleich breite Spalten liefen um einen halben Spaltenabstand daneben.
        */}
        <div className="absolute inset-x-0 top-full h-7">
          {months.map((month, index) => (
            <p
              key={month.key}
              className={cn(
                "absolute mt-1 -translate-x-1/2 text-xs whitespace-nowrap",
                month.isCurrent
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
              style={{ left: `${(xOf(index) / width) * 100}%` }}
            >
              {month.label}
            </p>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Herkunft der Kunden                                                 */
/* ------------------------------------------------------------------ */

/*
  Farben der Aufteilungen — bewusst getrennt von den Kennzahlfarben.

  Vorher griffen diese beiden Listen genau in die Palette der Kennzahlen:
  Grün stand für Umsatz *und* Empfehlung *und* Vor Ort, Cyan für Marge *und*
  Kleinanzeigen, Violett für Stück *und* Social Media *und* Telefon. Da beide
  Panels nebeneinander auf demselben Bildschirm stehen, las man aus gleichen
  Farben einen Zusammenhang heraus, den es nicht gibt.

  Reserviert und hier deshalb nicht verwendet:
  `skope-accent` (Umsatz), `state-live` (Marge), `state-done` (Stück).

  Kleinanzeigen und eBay tragen in beiden Listen dieselbe Farbe — es ist
  dieselbe Sache, einmal als Herkunft des Kunden und einmal als Verkaufskanal.
*/
const SOURCE_COLOR: Record<CustomerSource, string> = {
  WEBSITE: "bg-state-ready",
  GOOGLE: "bg-state-info",
  EBAY: "bg-chart-2",
  KLEINANZEIGEN: "bg-state-warn",
  SOCIAL_MEDIA: "bg-chart-4",
  EMPFEHLUNG: "bg-chart-3",
  STAMMKUNDE: "bg-state-progress",
  LAUFKUNDSCHAFT: "bg-state-error",
  SONSTIGE: "bg-state-neutral",
  UNBEKANNT: "bg-skope-line-strong"
}

const CHANNEL_COLOR: Record<SaleChannel, string> = {
  SHOPIFY: "bg-state-ready",
  EBAY: "bg-chart-2",
  KLEINANZEIGEN: "bg-state-warn",
  VOR_ORT: "bg-chart-3",
  TELEFON: "bg-chart-4",
  SONSTIGE: "bg-state-neutral"
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
                  label: CUSTOMER_SOURCE_META[entry.source].label
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
                  wurde die Herkunft nicht erfasst — die Anteile darüber
                  beziehen sich nur auf das, was tatsächlich erfragt wurde.
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
                    <span className="truncate text-foreground">
                      {entry.region}
                    </span>
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

/*
 * Farben der Prozessstufen.
 *
 * Deckungsgleich mit WORKFLOW_META: Dieselbe Stufe trug im Abzeichen eine
 * andere Farbe als im Balken — „in Prüfung" war als Abzeichen blau und im
 * Diagramm gelb. Wer die Farbe einmal gelernt hat, soll sie überall
 * wiederfinden. Die vier Töne liegen bewusst auf vier verschiedenen
 * Farbwinkeln: Grau, Blau, Orange, Türkis.
 */
const STAGE_COLOR: Record<string, string> = {
  EINGEGANGEN: "bg-state-neutral",
  IN_PRUEFUNG: "bg-state-info",
  AUFBEREITUNG: "bg-state-progress",
  VERKAUFSBEREIT: "bg-state-ready"
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
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-track ring-1 ring-white/[0.04] ring-inset">
                <div
                  className={cn(
                    "relative h-full rounded-full transition-[width] duration-base ease-out",
                    STAGE_COLOR[stage.key] ?? "bg-state-neutral"
                  )}
                  style={{
                    width: `${stage.tiedCents === 0 ? 0 : Math.max(2, (stage.tiedCents / max) * 100)}%`
                  }}
                >
                  <span
                    className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-black/10"
                    aria-hidden
                  />
                </div>
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

/**
 * Wertespalte links der Zeichenfläche.
 *
 * Drei Angaben derselben Breite, weil Raster, Balkenzone und Monatszeile exakt
 * gleich eingerückt sein müssen — schon zwei Pixel Unterschied lassen die
 * Beschriftung neben ihrer Säule stehen.
 *
 * Auf dem Telefon schmaler: Dort bleiben nach Abzug der Spalte sonst zu wenige
 * Pixel für sechs Säulen, und die Karte schob sich seitlich aus dem Bild.
 */
const AXIS_PAD = "pl-9 sm:pl-[3.25rem]"
/* Ausgeschrieben statt aus AXIS_PAD abgeleitet: Tailwind liest die Klassen
   aus dem Quelltext und findet nichts, was erst zur Laufzeit entsteht. */
const AXIS_MARGIN = "ml-9 sm:ml-[3.25rem]"
const AXIS_LEFT = "left-9 sm:left-[3.25rem]"
const AXIS_WIDTH = "w-9 sm:w-[3.25rem]"

/** Höhenlagen der Ableselinien in Prozent, von oben nach unten. */
const GRID_STEPS = [0, 25, 50, 75, 100]

/**
 * Untergrund der Zeichenfläche.
 *
 * Drei Lagen: ein Punktraster, das nach oben hin ausblendet, ein sehr schwacher
 * Schimmer in der Markenfarbe von unten, und vier waagerechte Linien als
 * Ableselinien. Das Raster gibt der Fläche Textur, die Linien machen Höhen
 * vergleichbar — beides bleibt deutlich unter dem Kontrast der Daten, sonst
 * konkurriert der Hintergrund mit dem Inhalt.
 */
function ChartGrid({
  className,
  ticks
}: {
  className?: string
  /**
   * Beschriftung der Ableselinien, von oben nach unten. Ohne sie sind die
   * Linien nur Dekoration: Man sieht, dass ein Balken höher ist, aber nicht,
   * um wie viel.
   */
  ticks?: string[]
}) {
  const patternId = `skope-dots-${useId().replace(/:/g, "")}`
  const inset = ticks ? AXIS_LEFT : "left-0"

  return (
    <div
      className={cn("pointer-events-none absolute inset-0", className)}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-y-0 right-0 text-foreground/[0.14]",
          inset
        )}
        style={{
          WebkitMaskImage:
            "linear-gradient(to top, black 25%, transparent 95%)",
          maskImage: "linear-gradient(to top, black 25%, transparent 95%)"
        }}
      >
        <svg className="h-full w-full">
          <defs>
            <pattern
              id={patternId}
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${patternId})`} />
        </svg>
      </div>

      <div
        className={cn(
          "absolute top-1/3 bottom-0 right-0 bg-gradient-to-t from-skope-accent/[0.06] to-transparent",
          inset
        )}
      />

      {GRID_STEPS.map((offset, index) => (
        <span key={offset}>
          <span
            className={cn(
              "absolute right-0 h-px",
              inset,
              offset === 100 ? "bg-skope-line-strong" : "bg-skope-line"
            )}
            style={{
              top: `${offset}%`,
              opacity: offset === 100 ? 1 : 0.3 + offset / 250
            }}
          />
          {ticks?.[index] && (
            <span
              className={cn(
                "absolute left-0 -translate-y-1/2 pr-1.5 text-right type-micro text-muted-foreground/75 sm:pr-2 sm:text-xs",
                AXIS_WIDTH
              )}
              style={{ top: `${offset}%` }}
            >
              {ticks[index]}
            </span>
          )}
        </span>
      ))}
    </div>
  )
}

function ShareBar({
  items
}: {
  items: { key: string; color: string; share: number; label: string }[]
}) {
  return (
    <div
      className="flex h-3 w-full gap-px overflow-hidden rounded-full bg-surface-track ring-1 ring-white/[0.04] ring-inset"
      role="img"
      aria-label={items
        .map((item) => `${item.label} ${Math.round(item.share * 100)} Prozent`)
        .join(", ")}
    >
      {items.map((item) => (
        <div
          key={item.key}
          /*
            Der Farbverlauf von oben hell nach unten satt lässt das Band
            plastisch wirken; die Fuge zwischen den Abschnitten trennt
            Farben, die sonst ineinanderlaufen.
          */
          className={cn(
            "relative transition-[width] duration-base ease-out",
            item.color
          )}
          style={{ width: `${item.share * 100}%` }}
        >
          <span
            className="absolute inset-0 bg-gradient-to-b from-white/25 to-black/15"
            aria-hidden
          />
        </div>
      ))}
    </div>
  )
}

function ShareRow({
  color,
  label,
  value,
  hint
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
          <span
            className={cn("size-2 shrink-0 rounded-full", color)}
            aria-hidden
          />
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
  disabled
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /**
   * Nicht wählbare Werte samt Begründung. Eine Schaltfläche, die sich
   * anklicken lässt und dann nichts tut, ist schlimmer als eine, die
   * erkennbar gesperrt ist und sagt warum.
   */
  disabled?: Partial<Record<T, string>>
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-skope-line bg-surface-sunken p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const blockedReason = disabled?.[option.value]
        const active = option.value === value && !blockedReason

        return (
          <button
            key={String(option.value)}
            type="button"
            aria-pressed={active}
            disabled={Boolean(blockedReason)}
            title={blockedReason}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              blockedReason
                ? "cursor-default text-muted-foreground/35"
                : active
                  ? "bg-skope-accent/18 text-skope-accent"
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

/**
 * Umschaltgruppe für mehrere gleichzeitig aktive Werte.
 *
 * Die letzte aktive Auswahl lässt sich nicht abwählen: Ein Diagramm ohne
 * Kennzahl ist keine leere Auswahl, sondern eine leere Fläche — und der Nutzer
 * müsste raten, warum nichts mehr zu sehen ist.
 */
function MultiSegmented<T extends string>({
  label,
  options,
  values,
  onChange,
  colors
}: {
  label: string
  options: { value: T; label: string }[]
  values: T[]
  onChange: (values: T[]) => void
  /**
   * Farbe je Wert, aktiv gesetzt.
   *
   * Der Umschalter zeigt damit dieselbe Farbe, die die Kennzahl im Diagramm
   * trägt. Vorher waren alle drei aktiven Knöpfe grün, während die Kurven
   * grün, türkis und violett liefen — man musste die Zuordnung aus der
   * Fußzeile holen, obwohl sie hier direkt danebensteht.
   */
  colors?: Partial<Record<T, string>>
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-skope-line bg-surface-sunken p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = values.includes(option.value)
        const isLastActive = active && values.length === 1
        const color = colors?.[option.value]

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={isLastActive}
            style={
              active && color
                ? {
                    backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                    color
                  }
                : undefined
            }
            title={
              isLastActive
                ? "Mindestens eine Kennzahl muss ausgewählt bleiben"
                : undefined
            }
            onClick={() =>
              onChange(
                active
                  ? values.filter((value) => value !== option.value)
                  : // Reihenfolge der Optionen beibehalten, damit die Leitgröße
                    // nicht von der Klickreihenfolge abhängt.
                    options
                      .map((o) => o.value)
                      .filter(
                        (value) =>
                          values.includes(value) || value === option.value
                      )
              )
            }
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? // Ohne eigene Farbe bleibt es beim Markenton.
                  !color && "bg-skope-accent/18 text-skope-accent"
                : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
              isLastActive && "cursor-default",
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

/**
 * Legendenmarke.
 *
 * Zeigt normalerweise einen Punkt. Im Verlauf mit mehreren Kurven zeigt sie
 * stattdessen ein Stück des echten Strichs samt Strichart — sonst steht in der
 * Legende ein Punkt, während im Diagramm eine gestrichelte Linie liegt, und
 * die Zuordnung muss geraten werden.
 */
function LegendDot({
  className,
  label,
  stroke,
  color
}: {
  className: string
  label: string
  /** Strichart der zugehörigen Kurve, falls es eine gibt. */
  stroke?: "solid" | "dashed" | "dotted"
  /**
   * Farbe des Strichs als CSS-Wert.
   *
   * Bewusst nicht aus `className` abgeleitet: Tailwind liest die Klassen aus
   * dem Quelltext und erzeugt nichts, was erst zur Laufzeit entsteht — ein
   * aus `bg-…` zusammengebautes `border-…` gäbe es im Stylesheet nie.
   */
  color?: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      {stroke ? (
        <span
          className={cn(
            "h-0 w-4 shrink-0 border-t-2",
            stroke === "dashed"
              ? "border-dashed"
              : stroke === "dotted"
                ? "border-dotted"
                : "border-solid"
          )}
          style={{ borderTopColor: color }}
          aria-hidden
        />
      ) : (
        <span className={cn("size-2 rounded-full", className)} aria-hidden />
      )}
      {label}
    </span>
  )
}
