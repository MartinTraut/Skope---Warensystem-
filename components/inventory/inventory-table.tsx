"use client"

import Link from "next/link"
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react"

import {
  ChannelIndicators,
  ConditionBadge,
  ItemIdentity,
  StockModeBadge,
} from "@/components/shared/badges"
import { RelativeTime } from "@/components/skope/client-time"
import { EmptyState } from "@/components/skope/primitives"
import { useRowNavigation } from "@/components/skope/row-link"
import { FOCUS_RING } from "@/components/skope/focus"
import { articleLabel } from "@/lib/domain/article-factory"
import { formatCents } from "@/lib/domain/money"
import type { ArticleView } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Bestandstabelle.
 *
 * Ab 1024 px eine echte Tabelle, darunter Karten — eine horizontal scrollende
 * Tabelle mit zehn Spalten ist am Telefon unbenutzbar. Beide Darstellungen
 * zeigen dieselben Daten und führen auf dieselbe Detailseite.
 *
 * Die Mengenspalte ist die wichtigste der Ansicht und deshalb die einzige mit
 * eigener Farbgebung: Ein Bestand unter dem Meldebestand muss beim Überfliegen
 * auffallen, ohne dass man die Zahl mit einer Schwelle im Kopf vergleicht.
 *
 * `compact` lässt Ø Einstand, Verkaufspreis und Kanäle weg. Zehn Spalten
 * passen in die volle Seitenbreite, nicht aber in eine Dashboard-Kachel von
 * zwei Dritteln — dort wurde die letzte Zahlenspalte am Rand abgeschnitten.
 * Weniger Spalten statt kleinerer Schrift: Lesbarkeit ist der Grund, warum
 * die Tabelle überhaupt dort steht.
 */
/**
 * Spaltenschlüssel der Sortierung.
 *
 * Er liegt hier und nicht in der Ansicht: Die Spalten stehen in dieser Datei,
 * und eine Sortierung, die nicht zu einer Spalte gehört, wäre am Kopf der
 * Tabelle nicht anzeigbar.
 */
export type InventorySortKey =
  | "updated"
  | "number"
  | "name"
  | "category"
  | "mode"
  | "quantity"
  | "cost"
  | "price"
  | "value"

export interface InventorySort {
  key: InventorySortKey
  dir: "asc" | "desc"
}

export function InventoryTable({
  views,
  emptyTitle = "Keine Artikel gefunden",
  emptyDescription = "Passe die Filter an oder lege einen neuen Artikel an.",
  emptyAction,
  compact = false,
  sort,
  onSort,
}: {
  views: ArticleView[]
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  compact?: boolean
  /** Aktuelle Sortierung — ohne sie bleiben die Spaltenköpfe unbeweglich. */
  sort?: InventorySort
  onSort?: (key: InventorySortKey) => void
}) {
  if (views.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <>
      <div className="hidden overflow-x-auto lg:block">
        <DesktopTable
          views={views}
          compact={compact}
          sort={sort}
          onSort={onSort}
        />
      </div>
      <ul className="divide-y divide-skope-line lg:hidden">
        {views.map((view) => (
          <li key={view.article.id}>
            <MobileCard view={view} />
          </li>
        ))}
      </ul>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Desktop                                                             */
/* ------------------------------------------------------------------ */

function DesktopTable({
  views,
  compact,
  sort,
  onSort,
}: {
  views: ArticleView[]
  compact: boolean
  sort?: InventorySort
  onSort?: (key: InventorySortKey) => void
}) {
  const openRow = useRowNavigation()
  const sortable = (key: InventorySortKey) =>
    onSort ? { sortKey: key, sort, onSort } : {}

  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-skope-accent/[0.11]">
        <tr className="border-b border-skope-accent/25">
          <Th className="pl-4 sm:pl-5" {...sortable("name")}>
            Artikel
          </Th>
          <Th {...sortable("category")}>Bereich</Th>
          <Th {...sortable("mode")}>Art</Th>
          <Th align="right" {...sortable("quantity")}>
            Bestand
          </Th>
          {!compact && (
            <Th align="right" {...sortable("cost")}>
              Ø Einstand
            </Th>
          )}
          {!compact && (
            <Th align="right" {...sortable("price")}>
              Verkaufspreis
            </Th>
          )}
          <Th align="right" {...sortable("value")}>
            Lagerwert
          </Th>
          {!compact && <Th>Kanäle</Th>}
          <Th align="right" className="pr-4 sm:pr-5" {...sortable("updated")}>
            Geändert
          </Th>
          <Th className="w-10 pr-4 sm:pr-5">
            <span className="sr-only">Öffnen</span>
          </Th>
        </tr>
      </thead>
      <tbody className="divide-y divide-skope-line">
        {views.map(({ article, settings, stock }) => (
          <tr
            key={article.id}
            onClick={(event) => openRow(`/inventory/${article.id}`, event)}
            className={cn(
              "group cursor-pointer transition-colors duration-150 hover:bg-surface-sunken",
              article.archivedAt !== null && "opacity-55"
            )}
          >
            <Td className="pl-4 sm:pl-5">
              <ItemIdentity
                number={article.sku}
                label={articleLabel(article)}
                href={`/inventory/${article.id}`}
                className={compact ? "max-w-[11rem]" : "max-w-[14rem]"}
              />
            </Td>
            {/*
              Nur das letzte Pfadsegment.

              „Ersatzteile › Elektrik › Controller" wiederholt in jeder Zeile
              dieselbe Ahnenkette und kostete allein 218 px — die Tabelle war
              dadurch 150 px breiter als ihr Container und schnitt Kanäle und
              Änderungsdatum ab. Der vollständige Pfad steht im Titel.
            */}
            <Td
              className="max-w-[9rem] truncate text-xs text-muted-foreground"
              title={settings.pathLabel}
            >
              {settings.pathLabel.split(" › ").pop()}
            </Td>
            <Td>
              <StockModeBadge mode={article.stockMode} />
            </Td>
            <Td align="right">
              <QuantityCell
                quantity={stock.quantity}
                reorderLevel={stock.reorderLevel}
                below={stock.belowReorderLevel}
                inconsistent={stock.inconsistent}
              />
            </Td>
            {!compact && (
              <Td align="right" className="tabular-nums text-muted-foreground">
                {stock.quantity > 0 ? formatCents(stock.averageCostCents) : "—"}
              </Td>
            )}
            {!compact && (
              <Td
                align="right"
                className="tabular-nums font-medium text-foreground"
              >
                {formatCents(article.salePriceCents)}
              </Td>
            )}
            <Td align="right" className="tabular-nums text-foreground/85">
              {formatCents(stock.valueCents)}
            </Td>
            {!compact && (
              <Td>
                <ChannelIndicators listings={article.listings} />
              </Td>
            )}
            <Td
              align="right"
              className="pr-4 text-xs whitespace-nowrap text-muted-foreground sm:pr-5"
            >
              <RelativeTime iso={article.updatedAt} />
            </Td>
            <Td className="pr-4 sm:pr-5">
              <Link
                href={`/inventory/${article.id}`}
                aria-label={`${article.sku} öffnen`}
                className="grid size-8 place-items-center rounded-md text-muted-foreground/50 transition-colors group-hover:text-skope-accent focus-visible:ring-3 focus-visible:ring-skope-accent/25 focus-visible:outline-none"
              >
                <ChevronRight className="size-4" />
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function QuantityCell({
  quantity,
  reorderLevel,
  below,
  inconsistent = false,
}: {
  quantity: number
  reorderLevel: number | null
  below: boolean
  /** Die Buchungen ergeben rechnerisch weniger als null. */
  inconsistent?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 font-medium tabular-nums",
        quantity === 0
          ? "text-state-error"
          : below
            ? "text-state-warn"
            : "text-foreground"
      )}
      title={
        inconsistent
          ? "Die Buchungen ergeben einen negativen Bestand. Es fehlt ein Zugang oder es wurde doppelt abgebucht."
          : reorderLevel !== null
            ? `Meldebestand: ${reorderLevel}`
            : undefined
      }
    >
      {quantity}
      {inconsistent && (
        <span
          aria-label="Bestand widersprüchlich"
          className="text-state-error"
        >
          !
        </span>
      )}
      {reorderLevel !== null && (
        <span className="text-[11px] font-normal text-muted-foreground">
          / {reorderLevel}
        </span>
      )}
    </span>
  )
}

/**
 * Spaltenkopf — mit `sortKey` zugleich der Schalter für die Sortierung.
 *
 * Die Sortierung lag ausschließlich in einem Auswahlfeld über der Tabelle.
 * Wer eine Spalte sortieren will, greift aber an ihren Kopf; das Auswahlfeld
 * wurde übersehen, und die Richtung ließ sich dort überhaupt nicht drehen.
 * Beides bleibt jetzt in Deckung: Der Kopf setzt Spalte und Richtung, das
 * Auswahlfeld zeigt weiterhin dieselbe Sortierung an und bedient die
 * Kartenansicht am Telefon, die keine Spaltenköpfe hat.
 *
 * `aria-sort` steht am `<th>`, nicht am Knopf darin — Vorleser lesen die
 * Sortierung an der Spalte, nicht am Bedienelement.
 */
function Th({
  children,
  align = "left",
  className,
  sortKey,
  sort,
  onSort,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
  sortKey?: InventorySortKey
  sort?: InventorySort
  onSort?: (key: InventorySortKey) => void
}) {
  const active = sortKey !== undefined && sort?.key === sortKey
  const base =
    "px-2.5 py-3 text-[11px] font-semibold tracking-[0.1em] whitespace-nowrap text-skope-accent/85 uppercase"

  if (!sortKey || !onSort) {
    return (
      <th
        scope="col"
        className={cn(base, align === "right" && "text-right", className)}
      >
        {children}
      </th>
    )
  }

  const Arrow = active && sort?.dir === "asc" ? ChevronUp : ChevronDown

  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"
      }
      className={cn(base, "p-0", className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex w-full items-center gap-1 px-2.5 py-3 transition-colors duration-150 hover:text-skope-accent",
          FOCUS_RING,
          align === "right" && "justify-end",
          active ? "text-skope-accent" : "text-skope-accent/85"
        )}
      >
        {align === "right" && (
          <Arrow
            className={cn("size-3.5 shrink-0", !active && "opacity-0")}
            aria-hidden
          />
        )}
        {children}
        {align !== "right" && (
          <Arrow
            className={cn("size-3.5 shrink-0", !active && "opacity-0")}
            aria-hidden
          />
        )}
      </button>
    </th>
  )
}

function Td({
  children,
  align = "left",
  className,
  title,
}: {
  children: React.ReactNode
  align?: "left" | "right"
  className?: string
  title?: string
}) {
  return (
    <td
      title={title}
      className={cn("px-2.5 py-3", align === "right" && "text-right", className)}
    >
      {children}
    </td>
  )
}

/* ------------------------------------------------------------------ */
/* Mobil                                                               */
/* ------------------------------------------------------------------ */

function MobileCard({ view }: { view: ArticleView }) {
  const { article, settings, stock } = view

  return (
    <Link
      href={`/inventory/${article.id}`}
      className="block px-4 py-4 transition-colors active:bg-surface-raised focus-visible:bg-surface-raised focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium text-foreground">
            {article.sku}
          </p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {articleLabel(article)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-medium tabular-nums text-foreground">
          {formatCents(article.salePriceCents)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StockModeBadge mode={article.stockMode} />
        <ConditionBadge condition={article.condition} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <ChannelIndicators listings={article.listings} />
        <p className="type-caption text-muted-foreground">
          <QuantityCell
            quantity={stock.quantity}
            reorderLevel={stock.reorderLevel}
            below={stock.belowReorderLevel}
            inconsistent={stock.inconsistent}
          />{" "}
          Stück · {settings.pathLabel}
        </p>
      </div>
    </Link>
  )
}
