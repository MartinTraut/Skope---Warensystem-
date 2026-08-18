/**
 * Bestandsrechnung.
 *
 * Der Bestand ist kein Feld, sondern das Ergebnis aller Buchungen. Diese
 * Entscheidung ist der Kern des Systems: Ein von Hand überschreibbarer Zähler
 * läuft in der Praxis auseinander — und ein Lagerbestand, dem man nicht
 * glaubt, ist genauso wertlos wie gar keiner. Weicht die Zählung im Regal ab,
 * ist das eine **Korrekturbuchung mit Grund**, kein stilles Überschreiben.
 *
 * Für Einzelstücke gilt dieselbe Regel in anderer Form: Dort ist der Bestand
 * die Anzahl der Geräte, die noch im Haus sind. Bewegungen werden trotzdem
 * geschrieben — sie sind dort das Protokoll, nicht die Rechengrundlage.
 */

import type {
  Article,
  ArticleUnit,
  Category,
  MovementType,
  StockLevel,
  StockMovement,
  WorkflowStatus,
} from "./types"
import { resolveCategorySettings } from "./categories"

/** Zählt ein Einzelstück noch zum Bestand? */
export function isUnitInStock(unit: ArticleUnit): boolean {
  return (
    unit.saleStatus !== "VERKAUFT" &&
    unit.workflowStatus !== "ARCHIVIERT" &&
    unit.workflowStatus !== "AUSGESCHLACHTET"
  )
}

/** Endgültig aus dem Bestand ausgeschiedene Zustände. */
export const CLOSED_WORKFLOW_STATUSES: WorkflowStatus[] = [
  "ARCHIVIERT",
  "AUSGESCHLACHTET",
]

/** Bewegungsarten, die einen Zugang darstellen. */
export function isInbound(movement: StockMovement): boolean {
  return movement.quantity > 0
}

/**
 * Gleitender Durchschnitts-Einstandspreis.
 *
 * Bewusst gleitend und nicht FIFO: Bei ausgeschlachteten Teilen gibt es keine
 * saubere Lieferreihenfolge, und ein Betrieb mit einem Lager voller
 * Gebrauchtteile kann keine Charge je Schraube führen. Der Durchschnitt ist
 * ehrlich genug für die Margenrechnung und nachvollziehbar erklärbar.
 */
interface Running {
  quantity: number
  averageCostCents: number
  byLocation: Record<string, number>
}

function applyMovement(running: Running, movement: StockMovement): void {
  const locationKey = movement.locationId ?? ""

  if (movement.type === "UMLAGERUNG") {
    // Umlagerungen verschieben nur, sie verändern weder Menge noch Wert.
    const amount = Math.abs(movement.quantity)
    const target = movement.toLocationId ?? ""
    running.byLocation[locationKey] = (running.byLocation[locationKey] ?? 0) - amount
    running.byLocation[target] = (running.byLocation[target] ?? 0) + amount
    return
  }

  if (movement.quantity > 0) {
    const cost = movement.unitCostCents ?? running.averageCostCents
    const totalValue =
      running.quantity * running.averageCostCents + movement.quantity * cost
    running.quantity += movement.quantity
    running.averageCostCents =
      running.quantity > 0 ? Math.round(totalValue / running.quantity) : 0
  } else {
    // Abgänge verändern den Durchschnittspreis nicht. Fällt der Bestand auf
    // null, bleibt der letzte Preis stehen — sonst wäre der nächste Zugang
    // ohne Preisangabe wertlos.
    //
    // Der laufende Zähler wird hier bewusst **nicht** bei null gekappt: Die
    // Buchungen werden chronologisch verarbeitet, und eine rückdatierte
    // Abbuchung steht dann vor dem Zugang, der sie deckt. Wer hier kappt,
    // verschluckt genau diese Abbuchung und meldet dauerhaft zu viel Bestand.
    running.quantity += movement.quantity
  }

  running.byLocation[locationKey] =
    (running.byLocation[locationKey] ?? 0) + movement.quantity
}

export interface StockContext {
  articles: Article[]
  units: ArticleUnit[]
  movements: StockMovement[]
  categories: Category[]
}

/**
 * Bestände aller Artikel auf einen Schlag.
 *
 * Einmal über alle Bewegungen statt je Artikel einmal über alles: Bei ein paar
 * tausend Buchungen ist der Unterschied zwischen linear und quadratisch der
 * zwischen flüssig und unbenutzbar.
 */
export function computeStockLevels(
  context: StockContext
): Map<string, StockLevel> {
  const { articles, units, movements, categories } = context

  const running = new Map<string, Running>()
  for (const article of articles) {
    running.set(article.id, {
      quantity: 0,
      averageCostCents: 0,
      byLocation: {},
    })
  }

  const chronological = [...movements].sort((a, b) => a.at.localeCompare(b.at))
  for (const movement of chronological) {
    const state = running.get(movement.articleId)
    if (!state) continue
    applyMovement(state, movement)
  }

  // Einzelstücke: die Geräte selbst sind die Wahrheit über die Menge.
  const unitsByArticle = new Map<string, ArticleUnit[]>()
  for (const unit of units) {
    const list = unitsByArticle.get(unit.articleId)
    if (list) list.push(unit)
    else unitsByArticle.set(unit.articleId, [unit])
  }

  const levels = new Map<string, StockLevel>()

  for (const article of articles) {
    const state = running.get(article.id)!
    const settings = resolveCategorySettings(categories, article.categoryId)
    const reorderLevel = article.reorderLevel ?? settings.reorderLevel

    if (article.stockMode === "SERIALISIERT") {
      const inStock = (unitsByArticle.get(article.id) ?? []).filter(isUnitInStock)
      const value = inStock.reduce(
        (sum, unit) => sum + unit.purchasePriceCents + unit.additionalCostsCents,
        0
      )
      const byLocation: Record<string, number> = {}
      for (const unit of inStock) {
        const key = unit.locationId ?? ""
        byLocation[key] = (byLocation[key] ?? 0) + 1
      }

      levels.set(article.id, {
        articleId: article.id,
        quantity: inStock.length,
        byLocation,
        averageCostCents:
          inStock.length > 0 ? Math.round(value / inStock.length) : 0,
        valueCents: value,
        reorderLevel,
        belowReorderLevel:
          reorderLevel !== null && inStock.length <= reorderLevel,
        inconsistent: false,
      })
      continue
    }

    // Ein negativer Bestand ist rechnerisch möglich, im Regal aber nicht. Er
    // wird für die Anzeige auf null gezogen und zugleich als Widerspruch
    // gemeldet, statt still verschluckt zu werden — sonst sucht niemand nach
    // der fehlenden Buchung.
    const quantity = Math.max(0, state.quantity)
    levels.set(article.id, {
      articleId: article.id,
      quantity,
      byLocation: state.byLocation,
      averageCostCents: state.averageCostCents,
      valueCents: quantity * state.averageCostCents,
      reorderLevel,
      belowReorderLevel: reorderLevel !== null && quantity <= reorderLevel,
      inconsistent: state.quantity < 0,
    })
  }

  return levels
}

/** Leerer Bestand — für Artikel, die es (noch) nicht gibt. */
export function emptyStockLevel(articleId: string): StockLevel {
  return {
    articleId,
    quantity: 0,
    byLocation: {},
    averageCostCents: 0,
    valueCents: 0,
    reorderLevel: null,
    belowReorderLevel: false,
    inconsistent: false,
  }
}

/* ------------------------------------------------------------------ */
/* Buchungsregeln                                                      */
/* ------------------------------------------------------------------ */

export const MOVEMENT_DIRECTION: Record<MovementType, "ZUGANG" | "ABGANG" | "NEUTRAL"> = {
  ZUGANG: "ZUGANG",
  AUSSCHLACHTUNG: "ZUGANG",
  VERKAUF: "ABGANG",
  VERBRAUCH: "ABGANG",
  KORREKTUR: "NEUTRAL",
  UMLAGERUNG: "NEUTRAL",
  VERLUST: "ABGANG",
}

/**
 * Darf so viel abgebucht werden?
 *
 * Ein Abgang unter null wäre ein Bestand, den es nie gab — und der Fehler
 * fiele erst Wochen später bei der Inventur auf. Deshalb hier und nicht
 * irgendwo in der Oberfläche.
 */
export function checkAvailability(
  level: StockLevel,
  quantity: number
): string | null {
  if (!Number.isInteger(quantity)) {
    // NaN rutscht sonst durch jeden Vergleich hindurch (NaN <= 0 ist false)
    // und landet als Menge in einer Buchung, die den Artikel dauerhaft auf
    // NaN setzt — rückbuchen lässt sich das nicht mehr.
    return "Bitte eine ganze Zahl als Menge eingeben."
  }
  if (quantity <= 0) return "Die Menge muss größer als null sein."
  if (quantity > level.quantity) {
    return `Es sind nur ${level.quantity} Stück auf Bestand.`
  }
  return null
}

/** Menge an einem bestimmten Lagerplatz. */
export function quantityAt(level: StockLevel, locationId: string | null): number {
  return level.byLocation[locationId ?? ""] ?? 0
}

/**
 * Wie lange liegt der Artikel schon?
 *
 * Grundlage der Ladenhüter-Auswertung: Kapital, das im Regal steht, ist die
 * eigentliche Kostenstelle eines Lagers.
 */
export function daysInStock(since: string, now: Date = new Date()): number {
  const start = new Date(since).getTime()
  if (Number.isNaN(start)) return 0
  return Math.max(0, Math.floor((now.getTime() - start) / 86_400_000))
}
