"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Coins, Receipt, TrendingUp } from "lucide-react"

import { SyncBadge } from "@/components/scooters/badges"
import { InlineSelect, SearchInput } from "@/components/skope/form"
import {
  EmptyState,
  Metric,
  Panel,
  PageHeader,
} from "@/components/skope/primitives"
import { useRowNavigation } from "@/components/skope/row-link"
import { MetricGridSkeleton, TableSkeleton } from "@/components/skope/skeletons"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { formatCents, formatCentsCompact, formatDate } from "@/lib/domain/money"
import {
  computeSalesMetrics,
  filterSalesThisMonth,
  saleCostCents,
  saleMarginCents,
} from "@/lib/domain/metrics"
import { SALE_CHANNEL_META } from "@/lib/domain/status"
import { SALE_CHANNELS, type Sale } from "@/lib/domain/types"
import { useHydrated, useSales } from "@/hooks/use-cockpit"
import { cn } from "@/lib/utils"

/** Verkaufsübersicht mit Umsatz, Marge und Reporting-Zustand. */
export function SalesView() {
  const hydrated = useHydrated()
  const sales = useSales()

  const [scope, setScope] = useState("monat")
  const [channel, setChannel] = useState("alle")
  const [query, setQuery] = useState("")

  const scoped = scope === "monat" ? filterSalesThisMonth(sales) : sales
  const metrics = computeSalesMetrics(scoped)

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return scoped
      .filter((sale) => channel === "alle" || sale.channel === channel)
      .filter((sale) => {
        if (!needle) return true
        return [sale.scooterNumber, sale.modelLabel, sale.serialNumber]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime())
  }, [scoped, channel, query])

  const failedSyncs = sales.filter(
    (sale) => sale.sheetsSyncStatus === "FEHLER"
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Verkäufe"
        description="Umsatz, Marge und Abgleich mit der Umsatztabelle."
      />

      {!hydrated ? (
        <MetricGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label={scope === "monat" ? "Umsatz diesen Monat" : "Umsatz gesamt"}
            value={formatCentsCompact(metrics.revenueCents)}
            icon={<TrendingUp className="size-4" />}
            accent
          />
          <Metric
            label="Verkäufe"
            value={metrics.count}
            icon={<Receipt className="size-4" />}
          />
          <Metric
            label="Marge gesamt"
            value={formatCentsCompact(metrics.marginCents)}
            hint="operativ, ohne Steuerbetrachtung"
            icon={<Coins className="size-4" />}
          />
          <Metric
            label="Ø Verkaufspreis"
            value={formatCentsCompact(metrics.averagePriceCents)}
          />
        </div>
      )}

      {hydrated && failedSyncs > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-state-error/25 bg-state-error/8 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-foreground">
            <span className="font-medium">
              {failedSyncs} Verkauf{failedSyncs === 1 ? "" : "e"} nicht in der
              Umsatztabelle
            </span>{" "}
            <span className="text-muted-foreground">
              — die Zeilen wurden nicht geschrieben und lassen sich einzeln
              wiederholen.
            </span>
          </p>
        </div>
      )}

      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-skope-line p-3 sm:p-4">
          <SearchInput
            placeholder="Scooter-Nummer, Modell oder Seriennummer …"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-0 flex-1 sm:max-w-xs"
            aria-label="Verkäufe durchsuchen"
          />
          <InlineSelect
            aria-label="Zeitraum"
            className="w-[10rem]"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            options={[
              { value: "monat", label: "Dieser Monat" },
              { value: "alle", label: "Alle Verkäufe" },
            ]}
          />
          <InlineSelect
            aria-label="Verkaufskanal"
            className="w-[10rem]"
            value={channel}
            onChange={(event) => setChannel(event.target.value)}
            options={[
              { value: "alle", label: "Kanal: alle" },
              ...SALE_CHANNELS.map((value) => ({
                value,
                label: SALE_CHANNEL_META[value].label,
              })),
            ]}
          />
        </div>

        {!hydrated ? (
          <TableSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-5" />}
            title={
              sales.length === 0 ? "Noch keine Verkäufe" : "Keine Treffer"
            }
            description={
              sales.length === 0
                ? "Sobald ein Scooter verkauft wird, erscheint der Vorgang hier — unabhängig vom Kanal."
                : "Für diesen Zeitraum und Kanal gibt es keine Verkäufe."
            }
          />
        ) : (
          <SalesTable sales={filtered} />
        )}
      </Panel>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tabelle                                                             */
/* ------------------------------------------------------------------ */

function SalesTable({ sales }: { sales: Sale[] }) {
  const openRow = useRowNavigation()

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-skope-line">
              <Th className="pl-5">Datum</Th>
              <Th>Scooter</Th>
              <Th>Kanal</Th>
              <Th align="right">EK</Th>
              <Th align="right">Kosten</Th>
              <Th align="right">VK</Th>
              <Th align="right">Marge</Th>
              <Th className="pr-5">Sheets</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-skope-line">
            {sales.map((sale) => (
              <tr
                key={sale.id}
                onClick={(event) => openRow(`/scooters/${sale.scooterId}`, event)}
                className="cursor-pointer transition-colors hover:bg-surface-sunken"
              >
                <td className="py-3 pr-3 pl-5 whitespace-nowrap text-muted-foreground">
                  {formatDate(sale.soldAt)}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/scooters/${sale.scooterId}`}
                    className="rounded font-mono type-body-sm font-medium text-foreground transition-colors hover:text-skope-gold"
                  >
                    {sale.scooterNumber}
                  </Link>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {sale.modelLabel}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {SALE_CHANNEL_META[sale.channel].label}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCents(sale.purchasePriceCents)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCents(
                    sale.repairCostsCents + sale.additionalCostsCents
                  )}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums text-foreground">
                  {formatCents(sale.salePriceCents)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-medium tabular-nums",
                    saleMarginCents(sale) < 0
                      ? "text-state-error"
                      : "text-state-ready"
                  )}
                >
                  {formatCents(saleMarginCents(sale))}
                </td>
                <td className="py-3 pr-5 pl-3">
                  <SyncCell sale={sale} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-skope-line lg:hidden">
        {sales.map((sale) => (
          <li
            key={sale.id}
            onClick={(event) => openRow(`/scooters/${sale.scooterId}`, event)}
            className="cursor-pointer px-4 py-4 transition-colors active:bg-surface-sunken"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/scooters/${sale.scooterId}`}
                  className="rounded font-mono text-sm font-medium text-foreground"
                >
                  {sale.scooterNumber}
                </Link>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {sale.modelLabel}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
                {formatCents(sale.salePriceCents)}
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {formatDate(sale.soldAt)} ·{" "}
                {SALE_CHANNEL_META[sale.channel].label}
              </span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  saleMarginCents(sale) < 0
                    ? "text-state-error"
                    : "text-state-ready"
                )}
              >
                Marge {formatCents(saleMarginCents(sale))}
              </span>
            </div>
            <div className="mt-2.5">
              <SyncCell sale={sale} />
            </div>
            <p className="mt-2 type-caption text-muted-foreground">
              Kosten gesamt {formatCents(saleCostCents(sale))}
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}

function SyncCell({ sale }: { sale: Sale }) {
  const [busy, setBusy] = useState(false)

  if (sale.sheetsSyncStatus !== "FEHLER") {
    return <SyncBadge status={sale.sheetsSyncStatus} />
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SyncBadge status="FEHLER" />
      <Button
        variant="outline"
        className="h-8 px-2.5 text-xs"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          const result = await repositories.sales.retrySheetsSync(sale.id)
          setBusy(false)
          if (!result.ok) {
            toast.error("Erneut fehlgeschlagen", { description: result.message })
            return
          }
          toast.success("Google Sheets synchronisiert")
        }}
      >
        {busy ? "…" : "Erneut"}
      </Button>
    </div>
  )
}

function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2.5 text-[10px] font-medium tracking-[0.1em] text-muted-foreground/80 uppercase",
        align === "right" && "text-right",
        className
      )}
    >
      {children}
    </th>
  )
}
