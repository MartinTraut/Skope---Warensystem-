/**
 * Anlegen von Artikeln und Einzelstücken.
 *
 * Ein neuer Datensatz entsteht ausschließlich hier — damit gibt es keine
 * halbfertigen Artikel, denen später ein Feld fehlt, und die geerbten
 * Kategorie-Voreinstellungen greifen zuverlässig.
 */

import { createEmptyInspection } from "./inspection"
import { createId } from "./numbering"
import type {
  Article,
  ArticleUnit,
  Channel,
  Condition,
  Listing,
  ResolvedCategorySettings,
  StockMode,
} from "./types"
import { CHANNELS } from "./types"

export function createEmptyListing(channel: Channel): Listing {
  return {
    channel,
    status: "NICHT_VEROEFFENTLICHT",
    externalIds: {},
    externalUrl: null,
    priceCents: null,
    inventory: 0,
    lastSyncedAt: null,
    lastError: null,
    retryCount: 0,
  }
}

/* ------------------------------------------------------------------ */
/* Artikel                                                             */
/* ------------------------------------------------------------------ */

export interface NewArticleInput {
  categoryId: string
  name: string
  manufacturer?: string
  mpn?: string
  ean?: string
  description?: string
  attributes?: Record<string, string>
  condition?: Condition
  salePriceCents?: number | null
  reorderLevel?: number | null
  channelOverride?: Channel | null
  notes?: string
  /** Nur setzen, wenn bewusst von der Kategorie abgewichen wird. */
  stockMode?: StockMode
}

export function createArticle(
  input: NewArticleInput,
  sku: string,
  settings: ResolvedCategorySettings
): Article {
  const now = new Date().toISOString()

  return {
    id: createId("art"),
    sku,
    categoryId: input.categoryId,
    name: input.name.trim(),
    manufacturer: input.manufacturer?.trim() ?? "",
    mpn: input.mpn?.trim() ?? "",
    ean: input.ean?.trim() ?? "",
    stockMode: input.stockMode ?? settings.stockMode,
    description: input.description ?? "",
    attributes: input.attributes ?? {},
    condition: input.condition ?? "GEBRAUCHT",
    salePriceCents: input.salePriceCents ?? null,
    reorderLevel: input.reorderLevel ?? null,
    channelOverride: input.channelOverride ?? null,
    publishModeOverride: null,
    images: [],
    listings: CHANNELS.map(createEmptyListing),
    notes: input.notes ?? "",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

/* ------------------------------------------------------------------ */
/* Einzelstück                                                         */
/* ------------------------------------------------------------------ */

export interface NewUnitInput {
  articleId: string
  serialNumber?: string
  variant?: string
  color?: string
  mileageKm?: number
  condition?: Condition
  description?: string
  attributes?: Record<string, string>
  purchasePriceCents?: number
  additionalCostsCents?: number
  salePriceCents?: number | null
  purchaseDate?: string
  arrivalDate?: string
  locationId?: string | null
  notes?: string
  documents?: ArticleUnit["documents"]
  importBatchId?: string | null
}

/**
 * Erzeugt ein vollständiges, konsistentes Einzelstück.
 *
 * Jedes neue Gerät startet in EINGEGANGEN / VERFÜGBAR mit leerem
 * Prüfprotokoll und Inseraten auf allen bekannten Kanälen.
 */
export function createUnit(
  input: NewUnitInput,
  unitNumber: string
): ArticleUnit {
  const now = new Date().toISOString()

  return {
    id: createId("unt"),
    articleId: input.articleId,
    unitNumber,
    serialNumber: input.serialNumber?.trim() ?? "",
    variant: input.variant?.trim() ?? "",
    color: input.color?.trim() ?? "",
    mileageKm: input.mileageKm ?? 0,
    condition: input.condition ?? "GEBRAUCHT",
    description: input.description ?? "",
    attributes: input.attributes ?? {},
    purchasePriceCents: input.purchasePriceCents ?? 0,
    additionalCostsCents: input.additionalCostsCents ?? 0,
    salePriceCents: input.salePriceCents ?? null,
    purchaseDate: input.purchaseDate ?? now,
    arrivalDate: input.arrivalDate ?? now,
    locationId: input.locationId ?? null,
    notes: input.notes ?? "",
    workflowStatus: "EINGEGANGEN",
    saleStatus: "VERFUEGBAR",
    documents: input.documents ?? {
      abe: false,
      invoice: false,
      other: false,
      note: "",
    },
    inspection: createEmptyInspection(),
    cleaning: { done: false, doneAt: null, note: "" },
    repairs: [],
    images: [],
    listings: CHANNELS.map(createEmptyListing),
    teardownId: null,
    importBatchId: input.importBatchId ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

/* ------------------------------------------------------------------ */
/* Bezeichnungen                                                       */
/* ------------------------------------------------------------------ */

export function articleLabel(article: Article): string {
  return [article.manufacturer, article.name].filter(Boolean).join(" ")
}

export function unitLabel(article: Article, unit: ArticleUnit): string {
  return [article.manufacturer, article.name, unit.variant]
    .filter(Boolean)
    .join(" ")
}

/**
 * Zusammengeführte Merkmale: Artikelwerte, überlagert von den gerätespezifischen.
 *
 * Ein Gerät erbt „Motorleistung" vom Artikel, bringt aber eine eigene
 * „Akkukapazität nach Messung" mit.
 */
export function mergedAttributes(
  article: Article,
  unit?: ArticleUnit | null
): Record<string, string> {
  return { ...article.attributes, ...(unit?.attributes ?? {}) }
}

/** Fehlende Pflichtmerkmale — leer heißt vollständig. */
export function missingRequiredAttributes(
  settings: ResolvedCategorySettings,
  values: Record<string, string>
): string[] {
  return settings.attributes
    .filter((definition) => definition.required)
    .filter((definition) => !values[definition.key]?.trim())
    .map((definition) => definition.label)
}
