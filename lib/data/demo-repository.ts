"use client"

/**
 * Demo-Implementierung der Datenschicht.
 *
 * Hier stehen die fachlichen Abläufe: veröffentlichen, verkaufen,
 * ausschlachten, buchen, synchronisieren. Der Store darunter kann Daten nur
 * halten und elementar ändern — er bleibt beim Wechsel auf Supabase zurück,
 * diese Abläufe wandern mit.
 *
 * Zwei Zusagen gelten in dieser Datei ohne Ausnahme:
 *
 *  1. **Keine stillen Fehler.** Jeder fehlgeschlagene Schritt landet als
 *     `ActionResult` mit Begründung beim Aufrufer und im Protokoll.
 *  2. **Kein Bestand ohne Gegenbuchung.** Menge entsteht und verschwindet
 *     ausschließlich über `StockMovement` — nie durch das Überschreiben
 *     einer Zahl.
 */

import {
  articleLabel,
  createArticle,
  createUnit,
  unitLabel,
} from "@/lib/domain/article-factory"
import {
  categoryPathLabel,
  descendantsOf,
  resolveCategorySettings,
  validateCategory,
} from "@/lib/domain/categories"
import { repairCostsCents } from "@/lib/domain/metrics"
import {
  createId,
  nextArticleSku,
  nextUnitNumber,
  normalizeReference,
} from "@/lib/domain/numbering"
import {
  buildArticleListing,
  buildArticleProposal,
  buildUnitListing,
  buildUnitProposal,
  evaluateArticleReadiness,
  evaluateUnitReadiness,
  isReady,
  resolveChannel,
  resolvePublishMode,
} from "@/lib/domain/publishing"
import { CHANNEL_META, canTransition } from "@/lib/domain/status"
import {
  checkAvailability,
  computeStockLevels,
  emptyStockLevel,
  isUnitInStock,
} from "@/lib/domain/stock"
import {
  distributeTeardownValue,
  teardownSourceValue,
  validateTeardown,
} from "@/lib/domain/teardown"
import type {
  Article,
  ArticleUnit,
  AuditCategory,
  AuditEvent,
  Category,
  Channel,
  ImportBatch,
  ImportIssue,
  IntegrationState,
  Listing,
  PublicationProposal,
  Sale,
  StockImage,
  StockLevel,
  StockMovement,
  StorageLocation,
  Teardown,
} from "@/lib/domain/types"
import { dataUrlBytes } from "@/lib/images/optimize"
import {
  DemoImportSource,
  ManualChannelAdapter,
  MockGoogleSheetsAdapter,
  MockShopifyAdapter,
} from "@/lib/integrations/mock-adapters"
import type {
  ListingPayload,
  MarketplaceAdapter,
} from "@/lib/integrations/types"
import { reportPersistenceProblem } from "@/lib/store/persistence-status"
import { SNAPSHOT_VERSION, getCockpitState } from "@/lib/store/cockpit-store"

import {
  actionFail,
  actionOk,
  type ActionResult,
  type ArticleRepository,
  type BookingInput,
  type CategoryRepository,
  type DemoRepositoryExtras,
  type ImportRepository,
  type ImportRow,
  type LocationRepository,
  type MarkAsSoldInput,
  type NewCategoryInput,
  type PublishingRepository,
  type Repositories,
  type SalesRepository,
  type SettingsRepository,
  type StockRepository,
  type TeardownRepository,
  type UnitRepository,
} from "./repository"

/* ------------------------------------------------------------------ */
/* Speichergrenze des Prototyps                                        */
/* ------------------------------------------------------------------ */

/**
 * Obergrenze für den gesamten gespeicherten Stand.
 *
 * Browser geben rund 5 MB je Origin frei. 4 MB lassen Luft für den Vorgang,
 * der gerade läuft — eine Grenze, die erst beim Schreiben zuschlägt, ist
 * keine Grenze, sondern ein Datenverlust.
 */
const IMAGE_BUDGET_BYTES = 4_000_000

function estimateStoredBytes(): number {
  const state = getCockpitState()
  // Nur die Bilder zählen; alles andere liegt zusammen im niedrigen
  // Kilobyte-Bereich und würde die Schätzung nur teuer machen.
  const sumImages = (images: StockImage[]) =>
    images.reduce((inner, image) => inner + dataUrlBytes(image.url), 0)

  return (
    state.articles.reduce((sum, article) => sum + sumImages(article.images), 0) +
    state.units.reduce((sum, unit) => sum + sumImages(unit.images), 0)
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
}

function checkImageBudget(incoming: { url: string }[]): string | null {
  const additional = incoming.reduce(
    (sum, image) => sum + dataUrlBytes(image.url),
    0
  )
  const projected = estimateStoredBytes() + additional
  if (projected <= IMAGE_BUDGET_BYTES) return null

  return (
    `Der Bildspeicher des Prototyps ist erschöpft (${formatBytes(projected)} von ` +
    `${formatBytes(IMAGE_BUDGET_BYTES)}). Bitte zuerst nicht benötigte Bilder entfernen. ` +
    `Mit angebundenem Dateispeicher entfällt diese Grenze.`
  )
}

/* ------------------------------------------------------------------ */
/* Adapter-Instanzen                                                   */
/* ------------------------------------------------------------------ */

const mockControls = {
  shouldFailShopify: () => getCockpitState().integrations.simulateShopifyError,
  shouldFailSheets: () => getCockpitState().integrations.simulateSheetsError,
  highestSheetsRow: () =>
    getCockpitState().sales.reduce(
      (max, sale) => Math.max(max, sale.sheetsRowNumber ?? 1),
      1
    ),
}

const shopifyAdapter = new MockShopifyAdapter(mockControls)
const ebayAdapter = new ManualChannelAdapter("EBAY", "eBay")
const kleinanzeigenAdapter = new ManualChannelAdapter(
  "KLEINANZEIGEN",
  "Kleinanzeigen"
)
const sheetsAdapter = new MockGoogleSheetsAdapter(mockControls)
const importSource = new DemoImportSource()

const ADAPTERS: Record<Channel, MarketplaceAdapter> = {
  SHOPIFY: shopifyAdapter,
  EBAY: ebayAdapter,
  KLEINANZEIGEN: kleinanzeigenAdapter,
}

export function getMarketplaceAdapter(channel: Channel): MarketplaceAdapter {
  return ADAPTERS[channel]
}

export const integrationAdapters = {
  shopify: shopifyAdapter,
  ebay: ebayAdapter,
  kleinanzeigen: kleinanzeigenAdapter,
  sheets: sheetsAdapter,
  imports: importSource,
}

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

function store() {
  return getCockpitState()
}

function findArticle(id: string): Article | undefined {
  return store().articles.find((article) => article.id === id)
}

function findUnit(id: string): ArticleUnit | undefined {
  return store().units.find((unit) => unit.id === id)
}

function settingsOf(article: Article) {
  return resolveCategorySettings(store().categories, article.categoryId)
}

/** Alle Bestände auf einmal — siehe `computeStockLevels`. */
function levels(): Map<string, StockLevel> {
  const state = store()
  return computeStockLevels({
    articles: state.articles,
    units: state.units,
    movements: state.movements,
    categories: state.categories,
  })
}

function levelOf(articleId: string): StockLevel {
  return levels().get(articleId) ?? emptyStockLevel(articleId)
}

interface LogInput {
  category: AuditCategory
  action: string
  detail: string
  article?: Article | null
  unit?: ArticleUnit | null
  level?: AuditEvent["level"]
  actor?: string
  at?: string
}

/** Schreibt einen Audit-Eintrag. Jede fachliche Änderung erzeugt genau einen. */
function log(input: LogInput): AuditEvent {
  const event: AuditEvent = {
    id: createId("evt"),
    at: input.at ?? new Date().toISOString(),
    actor: input.actor ?? store().user.name,
    category: input.category,
    action: input.action,
    detail: input.detail,
    articleId: input.article?.id ?? input.unit?.articleId ?? null,
    unitId: input.unit?.id ?? null,
    itemNumber: input.unit?.unitNumber ?? input.article?.sku ?? null,
    level: input.level ?? "info",
  }
  store().addActivity([event])
  return event
}

function mutateArticle(
  id: string,
  updater: (article: Article) => Article
): ActionResult<Article> {
  if (!findArticle(id)) return actionFail("Artikel nicht gefunden.")
  store().updateArticle(id, updater)
  const updated = findArticle(id)
  return updated ? actionOk(updated) : actionFail("Aktualisierung fehlgeschlagen.")
}

function mutateUnit(
  id: string,
  updater: (unit: ArticleUnit) => ArticleUnit
): ActionResult<ArticleUnit> {
  if (!findUnit(id)) return actionFail("Einzelstück nicht gefunden.")
  store().updateUnit(id, updater)
  const updated = findUnit(id)
  return updated ? actionOk(updated) : actionFail("Aktualisierung fehlgeschlagen.")
}

function withListing<T extends { listings: Listing[] }>(
  item: T,
  channel: Channel,
  patch: Partial<Listing>
): T {
  return {
    ...item,
    listings: item.listings.map((listing) =>
      listing.channel === channel ? { ...listing, ...patch } : listing
    ),
  }
}

function getListingOf(
  item: { listings: Listing[] },
  channel: Channel
): Listing | undefined {
  return item.listings.find((listing) => listing.channel === channel)
}

/** Bildpflege ist für Artikel und Einzelstücke identisch — hier einmal. */
function applyImageOperation(
  images: StockImage[],
  operation:
    | { kind: "add"; incoming: Omit<StockImage, "id" | "createdAt" | "sortOrder" | "isPrimary">[] }
    | { kind: "remove"; imageId: string }
    | { kind: "primary"; imageId: string }
    | { kind: "reorder"; imageIds: string[] }
): StockImage[] {
  if (operation.kind === "add") {
    const now = new Date().toISOString()
    const added = operation.incoming.map((image, index) => ({
      ...image,
      id: createId("img"),
      createdAt: now,
      sortOrder: images.length + index,
      isPrimary: images.length === 0 && index === 0,
    }))
    return [...images, ...added]
  }

  if (operation.kind === "remove") {
    const rest = images.filter((image) => image.id !== operation.imageId)
    // Ohne Titelbild entscheidet die Sortierung zufällig, welches Bild im
    // Kanal landet — deshalb rückt das erste verbliebene nach.
    if (rest.length > 0 && !rest.some((image) => image.isPrimary)) {
      rest[0] = { ...rest[0], isPrimary: true }
    }
    return rest.map((image, index) => ({ ...image, sortOrder: index }))
  }

  if (operation.kind === "primary") {
    return images.map((image) => ({
      ...image,
      isPrimary: image.id === operation.imageId,
    }))
  }

  const order = new Map(operation.imageIds.map((id, index) => [id, index]))
  return [...images]
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999))
    .map((image, index) => ({ ...image, sortOrder: index }))
}

/* ------------------------------------------------------------------ */
/* Bereiche                                                            */
/* ------------------------------------------------------------------ */

class DemoCategoryRepository implements CategoryRepository {
  async getAll() {
    return store().categories
  }

  async create(input: NewCategoryInput): Promise<ActionResult<Category>> {
    const state = store()
    const problem = validateCategory(state.categories, {
      parentId: input.parentId,
      name: input.name,
      numberPrefix: input.numberPrefix,
      stockMode: input.stockMode,
    })
    if (problem) return actionFail<Category>(problem, true)

    const now = new Date().toISOString()
    const category: Category = {
      id: createId("cat"),
      parentId: input.parentId,
      name: input.name.trim(),
      numberPrefix: input.numberPrefix.trim().toUpperCase(),
      description: input.description ?? "",
      stockMode: input.stockMode,
      attributes: input.attributes ?? [],
      reorderLevel: input.reorderLevel ?? null,
      defaultChannel: input.defaultChannel ?? null,
      publishMode: input.publishMode ?? "VORSCHLAG",
      requiresInspection: input.requiresInspection ?? false,
      sortOrder:
        Math.max(0, ...state.categories.map((entry) => entry.sortOrder)) + 10,
      createdAt: now,
      updatedAt: now,
    }

    store().upsertCategories([category])
    log({
      category: "KATEGORIE",
      action: "Bereich angelegt",
      detail: `${categoryPathLabel(store().categories, category.id)} (Präfix ${category.numberPrefix}).`,
      level: "success",
    })
    return actionOk(category)
  }

  async update(id: string, patch: Partial<Category>) {
    const state = store()
    const existing = state.categories.find((category) => category.id === id)
    if (!existing) return actionFail<Category>("Bereich nicht gefunden.")

    const merged = { ...existing, ...patch }
    const problem = validateCategory(state.categories, {
      id,
      parentId: merged.parentId,
      name: merged.name,
      numberPrefix: merged.numberPrefix,
      stockMode: merged.stockMode,
    })
    if (problem) return actionFail<Category>(problem, true)

    /*
      Die Bestandsart ist nach dem ersten Artikel gesperrt.

      Ein Wechsel würde aus 40 Bremsbelägen 40 einzeln zu prüfende Geräte
      machen (oder umgekehrt aus geprüften Geräten eine anonyme Stückzahl).
      Beides ist nicht rückrechenbar — die Sperre ist deshalb keine
      Bequemlichkeit, sondern der einzige Weg, den Bestand belastbar zu halten.
    */
    if (merged.stockMode !== existing.stockMode) {
      const affected = state.articles.filter(
        (article) => article.categoryId === id
      ).length
      if (affected > 0) {
        return actionFail<Category>(
          `Die Bestandsart lässt sich nicht mehr ändern: ${affected} Artikel liegen bereits in diesem Bereich.`,
          true
        )
      }
    }

    const updated: Category = {
      ...merged,
      numberPrefix: merged.numberPrefix.trim().toUpperCase(),
      name: merged.name.trim(),
      updatedAt: new Date().toISOString(),
    }
    store().upsertCategories([updated])

    log({
      category: "KATEGORIE",
      action: "Bereich geändert",
      detail: categoryPathLabel(store().categories, id),
    })
    return actionOk(updated)
  }

  async remove(id: string) {
    const state = store()
    const existing = state.categories.find((category) => category.id === id)
    if (!existing) return actionFail("Bereich nicht gefunden.")

    const children = descendantsOf(state.categories, id)
    if (children.length > 0) {
      return actionFail(
        `Der Bereich enthält ${children.length} Unterbereich(e). Diese zuerst verschieben oder löschen.`,
        true
      )
    }

    const articles = state.articles.filter(
      (article) => article.categoryId === id
    ).length
    if (articles > 0) {
      return actionFail(
        `Im Bereich liegen ${articles} Artikel. Ein Artikel ohne Bereich hätte weder Nummernkreis noch Merkmalsfelder.`,
        true
      )
    }

    const label = categoryPathLabel(state.categories, id)
    store().removeCategory(id)
    log({
      category: "KATEGORIE",
      action: "Bereich gelöscht",
      detail: label,
      level: "warning",
    })
    return actionOk(undefined)
  }

  async move(id: string, parentId: string | null) {
    return this.update(id, { parentId })
  }
}

/* ------------------------------------------------------------------ */
/* Lagerplätze                                                         */
/* ------------------------------------------------------------------ */

class DemoLocationRepository implements LocationRepository {
  async getAll() {
    return store().locations
  }

  async create(input: { code: string; name: string; note?: string }) {
    const code = input.code.trim().toUpperCase()
    if (!code) return actionFail<StorageLocation>("Der Lagerplatz braucht einen Code.")

    const taken = store().locations.some(
      (location) => location.code.toUpperCase() === code
    )
    if (taken) {
      return actionFail<StorageLocation>(
        `Den Code „${code}“ gibt es bereits.`,
        true
      )
    }

    const location: StorageLocation = {
      id: createId("loc"),
      code,
      name: input.name.trim() || code,
      note: input.note ?? "",
      sortOrder:
        Math.max(0, ...store().locations.map((entry) => entry.sortOrder)) + 10,
      createdAt: new Date().toISOString(),
    }
    store().upsertLocations([location])
    log({
      category: "SYSTEM",
      action: "Lagerplatz angelegt",
      detail: `${location.code} – ${location.name}`,
    })
    return actionOk(location)
  }

  async update(id: string, patch: Partial<StorageLocation>) {
    const existing = store().locations.find((location) => location.id === id)
    if (!existing) return actionFail<StorageLocation>("Lagerplatz nicht gefunden.")
    const updated = { ...existing, ...patch }
    store().upsertLocations([updated])
    return actionOk(updated)
  }

  async remove(id: string) {
    const state = store()
    const used =
      state.units.some((unit) => unit.locationId === id) ||
      state.movements.some(
        (movement) => movement.locationId === id || movement.toLocationId === id
      )
    if (used) {
      return actionFail(
        "Auf diesen Lagerplatz verweisen noch Bestände oder Buchungen. Zuerst umlagern.",
        true
      )
    }
    store().removeLocation(id)
    return actionOk(undefined)
  }
}

/* ------------------------------------------------------------------ */
/* Artikel                                                             */
/* ------------------------------------------------------------------ */

class DemoArticleRepository implements ArticleRepository {
  async getAll() {
    return store().articles
  }

  async getById(id: string) {
    return findArticle(id)
  }

  async getBySku(sku: string) {
    return store().articles.find((article) => article.sku === sku)
  }

  async create(input: Parameters<ArticleRepository["create"]>[0]) {
    const state = store()
    const category = state.categories.find(
      (entry) => entry.id === input.categoryId
    )
    if (!category) return actionFail<Article>("Bereich nicht gefunden.", true)

    if (!input.name.trim()) {
      return actionFail<Article>("Der Artikel braucht eine Bezeichnung.", true)
    }

    const settings = resolveCategorySettings(state.categories, input.categoryId)

    // Teilenummern sind der belastbarste Schlüssel gegen Dubletten — ein
    // zweiter Stammsatz für dasselbe Teil zerlegt den Bestand in zwei Hälften,
    // von denen keine stimmt.
    const mpn = normalizeReference(input.mpn ?? "")
    if (mpn) {
      const twin = state.articles.find(
        (article) => normalizeReference(article.mpn) === mpn
      )
      if (twin) {
        return actionFail<Article>(
          `Die Teilenummer gehört bereits zu ${twin.sku} – ${articleLabel(twin)}.`,
          true
        )
      }
    }

    const sku = nextArticleSku(
      state.articles.map((article) => article.sku),
      settings.numberPrefix
    )
    const article = createArticle(input, sku, settings)
    store().upsertArticles([article])

    log({
      category: "ARTIKEL",
      action: "Artikel angelegt",
      detail: `${article.sku} – ${articleLabel(article)} in ${settings.pathLabel}.`,
      article,
      level: "success",
    })
    return actionOk(article)
  }

  async update(id: string, patch: Partial<Article>) {
    const before = findArticle(id)
    if (!before) return actionFail<Article>("Artikel nicht gefunden.")

    // Die Bestandsart bleibt, was sie beim Anlegen war — sie ist die Grundlage
    // jeder bisherigen Buchung.
    const { stockMode: _ignored, ...safe } = patch
    void _ignored

    const result = mutateArticle(id, (article) => ({ ...article, ...safe }))
    if (!result.ok) return result

    const changes = describeArticleChanges(before, result.data)
    if (changes) {
      log({
        category: "ARTIKEL",
        action: "Artikel geändert",
        detail: changes,
        article: result.data,
      })
    }
    return result
  }

  async archive(id: string) {
    const level = levelOf(id)
    if (level.quantity > 0) {
      return actionFail<Article>(
        `Es liegen noch ${level.quantity} Stück auf Bestand. Archivierte Artikel dürfen keinen Bestand führen.`,
        true
      )
    }
    const result = mutateArticle(id, (article) => ({
      ...article,
      archivedAt: new Date().toISOString(),
    }))
    if (result.ok) {
      log({
        category: "ARTIKEL",
        action: "Artikel archiviert",
        detail: `${result.data.sku} – ${articleLabel(result.data)}`,
        article: result.data,
        level: "warning",
      })
    }
    return result
  }

  async restore(id: string) {
    return mutateArticle(id, (article) => ({ ...article, archivedAt: null }))
  }

  async addImages(id: string, incoming: Parameters<ArticleRepository["addImages"]>[1]) {
    const problem = checkImageBudget(incoming)
    if (problem) return actionFail<Article>(problem, true)

    const result = mutateArticle(id, (article) => ({
      ...article,
      images: applyImageOperation(article.images, { kind: "add", incoming }),
    }))
    if (result.ok) {
      log({
        category: "BILDER",
        action: "Bilder hinzugefügt",
        detail: `${incoming.length} Bild(er) zu ${result.data.sku}.`,
        article: result.data,
      })
    }
    return result
  }

  async removeImage(id: string, imageId: string) {
    return mutateArticle(id, (article) => ({
      ...article,
      images: applyImageOperation(article.images, { kind: "remove", imageId }),
    }))
  }

  async setPrimaryImage(id: string, imageId: string) {
    return mutateArticle(id, (article) => ({
      ...article,
      images: applyImageOperation(article.images, { kind: "primary", imageId }),
    }))
  }

  async reorderImages(id: string, imageIds: string[]) {
    return mutateArticle(id, (article) => ({
      ...article,
      images: applyImageOperation(article.images, { kind: "reorder", imageIds }),
    }))
  }
}

function describeArticleChanges(before: Article, after: Article): string {
  const parts: string[] = []
  if (before.name !== after.name) parts.push(`Bezeichnung: „${after.name}“`)
  if (before.salePriceCents !== after.salePriceCents) {
    parts.push(`Preis: ${formatEuro(after.salePriceCents)}`)
  }
  if (before.condition !== after.condition) parts.push(`Zustand: ${after.condition}`)
  if (before.categoryId !== after.categoryId) {
    parts.push(`Bereich: ${categoryPathLabel(store().categories, after.categoryId)}`)
  }
  if (JSON.stringify(before.attributes) !== JSON.stringify(after.attributes)) {
    parts.push("Merkmale angepasst")
  }
  return parts.join(" · ")
}

function formatEuro(cents: number | null): string {
  if (cents === null) return "—"
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}

/* ------------------------------------------------------------------ */
/* Einzelstücke                                                        */
/* ------------------------------------------------------------------ */

class DemoUnitRepository implements UnitRepository {
  async getAll() {
    return store().units
  }

  async getById(id: string) {
    return findUnit(id)
  }

  async getByNumber(unitNumber: string) {
    return store().units.find((unit) => unit.unitNumber === unitNumber)
  }

  async create(input: Parameters<UnitRepository["create"]>[0]) {
    const state = store()
    const article = findArticle(input.articleId)
    if (!article) return actionFail<ArticleUnit>("Artikel nicht gefunden.", true)
    if (article.stockMode !== "SERIALISIERT") {
      return actionFail<ArticleUnit>(
        `${articleLabel(article)} ist ein Mengenartikel. Dort wird Zugang gebucht, kein Einzelstück angelegt.`,
        true
      )
    }

    const serial = normalizeReference(input.serialNumber ?? "")
    if (serial) {
      const twin = state.units.find(
        (unit) => normalizeReference(unit.serialNumber) === serial
      )
      if (twin) {
        return actionFail<ArticleUnit>(
          `Die Seriennummer ist bereits als ${twin.unitNumber} erfasst.`,
          true
        )
      }
    }

    const settings = settingsOf(article)
    const unitNumber = nextUnitNumber(
      state.units.map((unit) => unit.unitNumber),
      settings.numberPrefix
    )
    const unit = createUnit(input, unitNumber)
    store().upsertUnits([unit])

    log({
      category: "ARTIKEL",
      action: "Gerät erfasst",
      detail: `${unit.unitNumber} – ${unitLabel(article, unit)} im Wareneingang aufgenommen.`,
      unit,
      level: "success",
    })
    return actionOk(unit)
  }

  async update(id: string, patch: Partial<ArticleUnit>) {
    const before = findUnit(id)
    if (!before) return actionFail<ArticleUnit>("Einzelstück nicht gefunden.")

    if (patch.serialNumber !== undefined) {
      const serial = normalizeReference(patch.serialNumber)
      const twin = store().units.find(
        (unit) =>
          unit.id !== id && serial && normalizeReference(unit.serialNumber) === serial
      )
      if (twin) {
        return actionFail<ArticleUnit>(
          `Die Seriennummer ist bereits als ${twin.unitNumber} erfasst.`,
          true
        )
      }
    }

    const result = mutateUnit(id, (unit) => ({ ...unit, ...patch }))
    if (result.ok) {
      const changes = describeUnitChanges(before, result.data)
      if (changes) {
        log({
          category: "ARTIKEL",
          action: "Gerät geändert",
          detail: changes,
          unit: result.data,
        })
      }
    }
    return result
  }

  async updateWorkflowStatus(id: string, status: ArticleUnit["workflowStatus"]) {
    const unit = findUnit(id)
    if (!unit) return actionFail<ArticleUnit>("Einzelstück nicht gefunden.")

    if (unit.workflowStatus === status) return actionOk(unit)

    if (!canTransition(unit.workflowStatus, status)) {
      return actionFail<ArticleUnit>(
        `Der Wechsel von „${unit.workflowStatus}“ nach „${status}“ ist nicht vorgesehen.`,
        true
      )
    }

    const article = findArticle(unit.articleId)
    if (status === "VERKAUFSBEREIT" && article) {
      const open = evaluateUnitReadiness(unit, settingsOf(article)).filter(
        (check) => !check.ok
      )
      if (open.length > 0) {
        return actionFail<ArticleUnit>(
          `Noch offen: ${open.map((check) => check.label).join(", ")}.`,
          true
        )
      }
    }

    const result = mutateUnit(id, (current) => ({
      ...current,
      workflowStatus: status,
    }))
    if (result.ok) {
      log({
        category: "ARTIKEL",
        action: "Status geändert",
        detail: `${unit.unitNumber}: ${unit.workflowStatus} → ${status}`,
        unit: result.data,
      })
    }
    return result
  }

  async updateSaleStatus(id: string, status: "VERFUEGBAR" | "RESERVIERT") {
    const result = mutateUnit(id, (unit) => ({ ...unit, saleStatus: status }))
    if (result.ok) {
      log({
        category: "VERKAUF",
        action: status === "RESERVIERT" ? "Reserviert" : "Reservierung aufgehoben",
        detail: result.data.unitNumber,
        unit: result.data,
      })
    }
    return result
  }

  async markAsSold(id: string, input: MarkAsSoldInput) {
    const unit = findUnit(id)
    if (!unit) return actionFail<Sale>("Einzelstück nicht gefunden.")
    if (unit.saleStatus === "VERKAUFT") {
      return actionFail<Sale>("Das Gerät ist bereits als verkauft erfasst.", true)
    }
    if (!Number.isFinite(input.salePriceCents) || input.salePriceCents <= 0) {
      return actionFail<Sale>("Ein Verkauf ohne Preis wird nicht gebucht.", true)
    }

    const article = findArticle(unit.articleId)
    if (!article) return actionFail<Sale>("Artikel nicht gefunden.")

    const sale: Sale = {
      id: createId("sale"),
      articleId: article.id,
      unitId: unit.id,
      itemNumber: unit.unitNumber,
      itemLabel: unitLabel(article, unit),
      serialNumber: unit.serialNumber,
      categoryLabel: settingsOf(article).pathLabel,
      quantity: 1,
      channel: input.channel,
      customerSource: input.customerSource,
      customerRegion: input.customerRegion,
      saleLocation: input.saleLocation,
      salePriceCents: input.salePriceCents,
      purchasePriceCents: unit.purchasePriceCents,
      repairCostsCents: repairCostsCents(unit),
      additionalCostsCents: unit.additionalCostsCents,
      soldAt: input.soldAt,
      note: input.note,
      sheetsSyncStatus: "WARTET",
      sheetsSyncedAt: null,
      sheetsError: null,
      sheetsRowNumber: null,
      createdAt: new Date().toISOString(),
    }

    store().addSale(sale)
    store().updateUnit(id, (current) => ({
      ...current,
      saleStatus: "VERKAUFT",
      workflowStatus: "ARCHIVIERT",
      salePriceCents: input.salePriceCents,
    }))
    store().addMovements([
      {
        id: createId("mov"),
        at: input.soldAt,
        actor: store().user.name,
        articleId: article.id,
        unitId: unit.id,
        quantity: -1,
        type: "VERKAUF",
        unitCostCents: null,
        locationId: unit.locationId,
        toLocationId: null,
        referenceId: sale.id,
        note: `Verkauf ${unit.unitNumber}`,
      },
    ])

    log({
      category: "VERKAUF",
      action: "Verkauft",
      detail: `${unit.unitNumber} für ${formatEuro(input.salePriceCents)} über ${input.channel}.`,
      unit,
      level: "success",
    })

    // Angebote sofort schließen: Ein verkauftes Gerät, das noch online steht,
    // erzeugt eine zweite Bestellung, die niemand erfüllen kann.
    await deactivateAllChannels({ type: "UNIT", id })
    await syncSaleToSheets(sale.id)

    const stored = store().sales.find((entry) => entry.id === sale.id)
    return actionOk(stored ?? sale)
  }

  /* Prüfung */

  async setInspectionCheck(
    id: string,
    checkKey: string,
    result: ArticleUnit["inspection"]["checks"][number]["result"],
    note = ""
  ) {
    const updated = mutateUnit(id, (unit) => ({
      ...unit,
      workflowStatus:
        unit.workflowStatus === "EINGEGANGEN" ? "IN_PRUEFUNG" : unit.workflowStatus,
      inspection: {
        ...unit.inspection,
        checks: unit.inspection.checks.map((check) =>
          check.key === checkKey ? { ...check, result, note } : check
        ),
      },
    }))
    return updated
  }

  async setInspectionNote(id: string, note: string) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      inspection: { ...unit.inspection, note },
    }))
  }

  async completeInspection(id: string) {
    const unit = findUnit(id)
    if (!unit) return actionFail<ArticleUnit>("Einzelstück nicht gefunden.")

    const open = unit.inspection.checks.filter(
      (check) => check.result === "NICHT_GEPRUEFT"
    )
    if (open.length > 0) {
      return actionFail<ArticleUnit>(
        `${open.length} Prüfpunkt(e) sind noch unbewertet.`,
        true
      )
    }

    const problems = unit.inspection.checks.filter(
      (check) => check.result === "PROBLEM"
    ).length

    const result = mutateUnit(id, (current) => ({
      ...current,
      workflowStatus: "AUFBEREITUNG",
      inspection: {
        ...current.inspection,
        completedAt: new Date().toISOString(),
        completedBy: store().user.initials,
      },
    }))

    if (result.ok) {
      log({
        category: "PRUEFUNG",
        action: "Prüfung abgeschlossen",
        detail:
          problems > 0
            ? `${unit.unitNumber}: ${problems} Punkt(e) mit Befund.`
            : `${unit.unitNumber} ohne Beanstandung.`,
        unit: result.data,
        level: problems > 0 ? "warning" : "success",
      })
    }
    return result
  }

  async reopenInspection(id: string) {
    const result = mutateUnit(id, (unit) => ({
      ...unit,
      workflowStatus: "IN_PRUEFUNG",
      inspection: { ...unit.inspection, completedAt: null, completedBy: null },
    }))
    if (result.ok) {
      log({
        category: "PRUEFUNG",
        action: "Prüfung wieder geöffnet",
        detail: result.data.unitNumber,
        unit: result.data,
        level: "warning",
      })
    }
    return result
  }

  /* Aufbereitung */

  async setCleaning(id: string, done: boolean, note = "") {
    return mutateUnit(id, (unit) => ({
      ...unit,
      cleaning: { done, doneAt: done ? new Date().toISOString() : null, note },
    }))
  }

  async addRepair(id: string, repair: Parameters<UnitRepository["addRepair"]>[1]) {
    const unit = findUnit(id)
    if (!unit) return actionFail<ArticleUnit>("Einzelstück nicht gefunden.")

    let partCostCents = repair.partCostCents
    let consumed: StockMovement | null = null

    /*
      Ersatzteil aus dem eigenen Lager: Verbrauch buchen und mit dem
      Einstandswert bewerten.

      Ohne diese Kopplung wäre der Kreis offen: Ein Display aus einem
      Spendergerät verschwände beim Einbau still aus dem Regal, und die
      Reparaturkosten wären ein geschätzter Wert statt des tatsächlichen
      Einstands.
    */
    if (repair.partArticleId && repair.partQuantity > 0) {
      const partArticle = findArticle(repair.partArticleId)
      if (!partArticle) {
        return actionFail<ArticleUnit>("Ersatzteil-Artikel nicht gefunden.", true)
      }
      const level = levelOf(repair.partArticleId)
      const problem = checkAvailability(level, repair.partQuantity)
      if (problem) {
        return actionFail<ArticleUnit>(
          `${articleLabel(partArticle)}: ${problem}`,
          true
        )
      }

      partCostCents = level.averageCostCents * repair.partQuantity
      consumed = {
        id: createId("mov"),
        at: new Date().toISOString(),
        actor: store().user.name,
        articleId: repair.partArticleId,
        unitId: unit.id,
        quantity: -repair.partQuantity,
        type: "VERBRAUCH",
        unitCostCents: null,
        locationId: null,
        toLocationId: null,
        referenceId: unit.id,
        note: `Eingebaut in ${unit.unitNumber}`,
      }
    }

    const result = mutateUnit(id, (current) => ({
      ...current,
      workflowStatus:
        current.workflowStatus === "EINGEGANGEN" ||
        current.workflowStatus === "IN_PRUEFUNG"
          ? "AUFBEREITUNG"
          : current.workflowStatus,
      repairs: [
        ...current.repairs,
        {
          ...repair,
          partCostCents,
          id: createId("rep"),
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    if (!result.ok) return result

    if (consumed) {
      store().addMovements([consumed])
      log({
        category: "BESTAND",
        action: "Ersatzteil verbaut",
        detail: `${repair.partQuantity} × ${articleLabel(findArticle(repair.partArticleId!)!)} in ${unit.unitNumber} (${formatEuro(partCostCents)}).`,
        unit: result.data,
      })
    }

    log({
      category: "AUFBEREITUNG",
      action: "Reparatur erfasst",
      detail: `${unit.unitNumber}: ${repair.problem || "ohne Beschreibung"}`,
      unit: result.data,
    })
    return result
  }

  async updateRepair(id: string, repairId: string, patch: Parameters<UnitRepository["updateRepair"]>[2]) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      repairs: unit.repairs.map((repair) =>
        repair.id === repairId ? { ...repair, ...patch } : repair
      ),
    }))
  }

  async removeRepair(id: string, repairId: string) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      repairs: unit.repairs.filter((repair) => repair.id !== repairId),
    }))
  }

  /* Bilder */

  async addImages(id: string, incoming: Parameters<UnitRepository["addImages"]>[1]) {
    const problem = checkImageBudget(incoming)
    if (problem) return actionFail<ArticleUnit>(problem, true)

    const result = mutateUnit(id, (unit) => ({
      ...unit,
      images: applyImageOperation(unit.images, { kind: "add", incoming }),
    }))
    if (result.ok) {
      log({
        category: "BILDER",
        action: "Bilder hinzugefügt",
        detail: `${incoming.length} Bild(er) zu ${result.data.unitNumber}.`,
        unit: result.data,
      })
    }
    return result
  }

  async removeImage(id: string, imageId: string) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      images: applyImageOperation(unit.images, { kind: "remove", imageId }),
    }))
  }

  async setPrimaryImage(id: string, imageId: string) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      images: applyImageOperation(unit.images, { kind: "primary", imageId }),
    }))
  }

  async reorderImages(id: string, imageIds: string[]) {
    return mutateUnit(id, (unit) => ({
      ...unit,
      images: applyImageOperation(unit.images, { kind: "reorder", imageIds }),
    }))
  }
}

function describeUnitChanges(before: ArticleUnit, after: ArticleUnit): string {
  const parts: string[] = []
  if (before.salePriceCents !== after.salePriceCents) {
    parts.push(`Preis: ${formatEuro(after.salePriceCents)}`)
  }
  if (before.purchasePriceCents !== after.purchasePriceCents) {
    parts.push(`Einkauf: ${formatEuro(after.purchasePriceCents)}`)
  }
  if (before.condition !== after.condition) parts.push(`Zustand: ${after.condition}`)
  if (before.mileageKm !== after.mileageKm) parts.push(`Laufleistung: ${after.mileageKm} km`)
  if (before.locationId !== after.locationId) {
    const location = store().locations.find(
      (entry) => entry.id === after.locationId
    )
    parts.push(`Lagerplatz: ${location?.code ?? "—"}`)
  }
  if (before.serialNumber !== after.serialNumber) parts.push("Seriennummer geändert")
  return parts.join(" · ")
}

/* ------------------------------------------------------------------ */
/* Bestand                                                             */
/* ------------------------------------------------------------------ */

function bookMovement(input: BookingInput): StockMovement {
  const movement: StockMovement = {
    id: createId("mov"),
    at: new Date().toISOString(),
    actor: store().user.name,
    articleId: input.articleId,
    unitId: null,
    quantity: input.quantity,
    type: input.type,
    unitCostCents: input.unitCostCents ?? null,
    locationId: input.locationId ?? null,
    toLocationId: input.toLocationId ?? null,
    referenceId: input.referenceId ?? null,
    note: input.note ?? "",
  }
  store().addMovements([movement])
  return movement
}

class DemoStockRepository implements StockRepository {
  async getMovements() {
    return store().movements
  }

  async receive(input: Parameters<StockRepository["receive"]>[0]) {
    const article = findArticle(input.articleId)
    if (!article) return actionFail<StockMovement>("Artikel nicht gefunden.")
    if (article.stockMode !== "MENGE") {
      return actionFail<StockMovement>(
        `${articleLabel(article)} wird als Einzelstück geführt. Zugang bedeutet dort: neues Gerät erfassen.`,
        true
      )
    }
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return actionFail<StockMovement>("Die Menge muss eine ganze Zahl größer als null sein.", true)
    }
    if (!Number.isFinite(input.unitCostCents) || input.unitCostCents < 0) {
      return actionFail<StockMovement>("Der Einstandspreis kann nicht negativ sein.", true)
    }

    const movement = bookMovement({
      articleId: input.articleId,
      quantity: input.quantity,
      type: "ZUGANG",
      unitCostCents: input.unitCostCents,
      locationId: input.locationId,
      note: input.note,
    })

    log({
      category: "BESTAND",
      action: "Zugang gebucht",
      detail: `${input.quantity} × ${articleLabel(article)} zu ${formatEuro(input.unitCostCents)} je Stück.`,
      article,
      level: "success",
    })
    return actionOk(movement)
  }

  async issue(input: Parameters<StockRepository["issue"]>[0]) {
    const article = findArticle(input.articleId)
    if (!article) return actionFail<StockMovement>("Artikel nicht gefunden.")

    const problem = checkAvailability(levelOf(input.articleId), input.quantity)
    if (problem) return actionFail<StockMovement>(problem, true)

    const movement = bookMovement({
      articleId: input.articleId,
      quantity: -input.quantity,
      type: input.type,
      locationId: input.locationId,
      note: input.note,
    })

    log({
      category: "BESTAND",
      action: input.type === "VERLUST" ? "Verlust gebucht" : "Verbrauch gebucht",
      detail: `${input.quantity} × ${articleLabel(article)}${input.note ? ` — ${input.note}` : ""}`,
      article,
      level: input.type === "VERLUST" ? "warning" : "info",
    })
    return actionOk(movement)
  }

  async correct(input: Parameters<StockRepository["correct"]>[0]) {
    const article = findArticle(input.articleId)
    if (!article) return actionFail<StockMovement | null>("Artikel nicht gefunden.")
    if (!input.reason.trim()) {
      return actionFail<StockMovement | null>(
        "Eine Korrektur ohne Begründung ist nicht nachvollziehbar.",
        true
      )
    }
    if (!Number.isInteger(input.countedQuantity) || input.countedQuantity < 0) {
      return actionFail<StockMovement | null>(
        "Eine gezählte Menge muss eine ganze Zahl ab null sein.",
        true
      )
    }

    const level = levelOf(input.articleId)
    const difference = input.countedQuantity - level.quantity
    if (difference === 0) {
      // Keine Abweichung: keine Buchung. Eine Nullbuchung im Journal wäre
      // Rauschen, das echte Korrekturen schwerer auffindbar macht.
      return actionOk(null)
    }

    const movement = bookMovement({
      articleId: input.articleId,
      quantity: difference,
      type: "KORREKTUR",
      // Zugänge aus einer Korrektur werden mit dem bisherigen Durchschnitt
      // bewertet — ein Fund im Regal ist keine neue Beschaffung.
      unitCostCents: difference > 0 ? level.averageCostCents : null,
      locationId: input.locationId,
      note: input.reason,
    })

    log({
      category: "BESTAND",
      action: "Inventurkorrektur",
      detail: `${articleLabel(article)}: ${level.quantity} → ${input.countedQuantity} (${difference > 0 ? "+" : ""}${difference}). Grund: ${input.reason}`,
      article,
      level: "warning",
    })
    return actionOk(movement)
  }

  async transfer(input: Parameters<StockRepository["transfer"]>[0]) {
    const article = findArticle(input.articleId)
    if (!article) return actionFail<StockMovement>("Artikel nicht gefunden.")
    if (input.fromLocationId === input.toLocationId) {
      return actionFail<StockMovement>("Quelle und Ziel sind identisch.", true)
    }

    const level = levelOf(input.articleId)
    const available = level.byLocation[input.fromLocationId ?? ""] ?? 0
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      return actionFail<StockMovement>("Die Menge muss eine ganze Zahl größer als null sein.", true)
    }
    if (input.quantity > available) {
      return actionFail<StockMovement>(
        `Auf diesem Lagerplatz liegen nur ${available} Stück.`,
        true
      )
    }

    const movement = bookMovement({
      articleId: input.articleId,
      quantity: input.quantity,
      type: "UMLAGERUNG",
      locationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      note: input.note,
    })

    log({
      category: "BESTAND",
      action: "Umgelagert",
      detail: `${input.quantity} × ${articleLabel(article)} → ${locationCode(input.toLocationId)}`,
      article,
    })
    return actionOk(movement)
  }

  async sell(input: Parameters<StockRepository["sell"]>[0]) {
    const article = findArticle(input.articleId)
    if (!article) return actionFail<Sale>("Artikel nicht gefunden.")
    if (!Number.isFinite(input.salePriceCents) || input.salePriceCents <= 0) {
      return actionFail<Sale>("Ein Verkauf ohne Preis wird nicht gebucht.", true)
    }

    const level = levelOf(input.articleId)
    const problem = checkAvailability(level, input.quantity)
    if (problem) return actionFail<Sale>(problem, true)

    const sale: Sale = {
      id: createId("sale"),
      articleId: article.id,
      unitId: null,
      itemNumber: article.sku,
      itemLabel: articleLabel(article),
      serialNumber: "",
      categoryLabel: settingsOf(article).pathLabel,
      quantity: input.quantity,
      channel: input.channel,
      customerSource: input.customerSource,
      customerRegion: input.customerRegion,
      saleLocation: input.saleLocation,
      salePriceCents: input.salePriceCents,
      // Der Einstand kommt aus dem gleitenden Durchschnitt — dieselbe Zahl,
      // die auch den Lagerwert bildet. Alles andere ergäbe zwei Wahrheiten.
      purchasePriceCents: level.averageCostCents * input.quantity,
      repairCostsCents: 0,
      additionalCostsCents: 0,
      soldAt: input.soldAt,
      note: input.note,
      sheetsSyncStatus: "WARTET",
      sheetsSyncedAt: null,
      sheetsError: null,
      sheetsRowNumber: null,
      createdAt: new Date().toISOString(),
    }

    store().addSale(sale)
    bookMovement({
      articleId: article.id,
      quantity: -input.quantity,
      type: "VERKAUF",
      locationId: input.locationId,
      referenceId: sale.id,
      note: `Verkauf ${article.sku}`,
    })

    log({
      category: "VERKAUF",
      action: "Verkauft",
      detail: `${input.quantity} × ${articleLabel(article)} für ${formatEuro(input.salePriceCents)} über ${input.channel}.`,
      article,
      level: "success",
    })

    // Bestand auf null: Das Angebot muss vom Markt, sonst gehen Bestellungen
    // ein, die niemand erfüllen kann.
    if (levelOf(article.id).quantity === 0) {
      await deactivateAllChannels({ type: "ARTICLE", id: article.id })
    } else {
      await refreshChannelInventory(article.id)
    }

    await syncSaleToSheets(sale.id)
    const stored = store().sales.find((entry) => entry.id === sale.id)
    return actionOk(stored ?? sale)
  }
}

function locationCode(locationId: string | null): string {
  if (!locationId) return "ohne Lagerplatz"
  return (
    store().locations.find((location) => location.id === locationId)?.code ??
    "unbekannt"
  )
}

/* ------------------------------------------------------------------ */
/* Ausschlachtung                                                      */
/* ------------------------------------------------------------------ */

class DemoTeardownRepository implements TeardownRepository {
  async getAll() {
    return store().teardowns
  }

  async book(input: Parameters<TeardownRepository["book"]>[0]) {
    const unit = findUnit(input.sourceUnitId)
    if (!unit) return actionFail<Teardown>("Spendergerät nicht gefunden.")
    if (!isUnitInStock(unit)) {
      return actionFail<Teardown>(
        "Das Gerät ist nicht mehr im Bestand und kann nicht zerlegt werden.",
        true
      )
    }

    const article = findArticle(unit.articleId)
    if (!article) return actionFail<Teardown>("Artikel des Spenders nicht gefunden.")

    const sourceValueCents = teardownSourceValue(unit)
    const { lines, scrapValueCents } = distributeTeardownValue(
      sourceValueCents,
      input.lines,
      input.distribution
    )

    const problem = validateTeardown({ lines, sourceValueCents, scrapValueCents })
    if (problem) return actionFail<Teardown>(problem, true)

    // Zielartikel prüfen, bevor irgendetwas gebucht wird: Eine halb gebuchte
    // Ausschlachtung hinterlässt Teile ohne Spender oder umgekehrt.
    for (const line of lines) {
      if (line.quantity <= 0) continue
      const target = findArticle(line.articleId)
      if (!target) {
        return actionFail<Teardown>(
          "Mindestens ein Zielartikel existiert nicht mehr.",
          true
        )
      }
      if (target.stockMode !== "MENGE") {
        return actionFail<Teardown>(
          `${articleLabel(target)} wird als Einzelstück geführt und kann keine Teilemenge aufnehmen.`,
          true
        )
      }
    }

    const now = new Date().toISOString()
    const teardown: Teardown = {
      id: createId("tdn"),
      at: now,
      actor: store().user.name,
      sourceUnitId: unit.id,
      sourceArticleId: article.id,
      sourceLabel: unitLabel(article, unit),
      sourceNumber: unit.unitNumber,
      sourceValueCents,
      distribution: input.distribution,
      lines,
      scrapValueCents,
      status: "GEBUCHT",
      note: input.note,
      createdAt: now,
    }

    const movements: StockMovement[] = lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        id: createId("mov"),
        at: now,
        actor: store().user.name,
        articleId: line.articleId,
        unitId: null,
        quantity: line.quantity,
        type: "AUSSCHLACHTUNG" as const,
        unitCostCents: line.valueShareCents,
        locationId: line.locationId,
        toLocationId: null,
        referenceId: teardown.id,
        note: `Aus ${unit.unitNumber}`,
      }))

    store().addTeardown(teardown)
    store().addMovements(movements)
    store().updateUnit(unit.id, (current) => ({
      ...current,
      workflowStatus: "AUSGESCHLACHTET",
      teardownId: teardown.id,
      locationId: null,
    }))

    const pieces = lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0)
    log({
      category: "AUSSCHLACHTUNG",
      action: "Gerät zerlegt",
      detail:
        `${unit.unitNumber}: ${pieces} Teile entnommen, ${formatEuro(sourceValueCents)} Einkaufswert verteilt` +
        (scrapValueCents > 0 ? `, ${formatEuro(scrapValueCents)} als Schrott abgeschrieben.` : "."),
      unit,
      level: "warning",
    })

    // Ein zerlegtes Gerät darf nirgends mehr angeboten werden.
    await deactivateAllChannels({ type: "UNIT", id: unit.id })

    return actionOk(teardown)
  }
}

/* ------------------------------------------------------------------ */
/* Veröffentlichung                                                    */
/* ------------------------------------------------------------------ */

type PublishTarget = { type: "UNIT" | "ARTICLE"; id: string }

/** Baut die Nutzlast für einen Kanal — für beide Bestandsarten gleich. */
function payloadFor(target: PublishTarget, channel: Channel): ListingPayload | null {
  if (target.type === "UNIT") {
    const unit = findUnit(target.id)
    if (!unit) return null
    const article = findArticle(unit.articleId)
    if (!article) return null
    const content = buildUnitListing(article, unit, settingsOf(article))
    return {
      sku: unit.unitNumber,
      title: content.title,
      description: content.description,
      priceCents: content.priceCents,
      quantity: content.quantity,
      imageUrls: content.imageUrls,
      attributeLines: content.attributeLines,
      externalIds: getListingOf(unit, channel)?.externalIds ?? {},
    }
  }

  const article = findArticle(target.id)
  if (!article) return null
  const content = buildArticleListing(article, levelOf(article.id), settingsOf(article))
  return {
    sku: article.sku,
    title: content.title,
    description: content.description,
    priceCents: content.priceCents,
    quantity: content.quantity,
    imageUrls: content.imageUrls,
    attributeLines: content.attributeLines,
    externalIds: getListingOf(article, channel)?.externalIds ?? {},
  }
}

function patchListing(
  target: PublishTarget,
  channel: Channel,
  patch: Partial<Listing>
): void {
  if (target.type === "UNIT") {
    store().updateUnit(target.id, (unit) => withListing(unit, channel, patch))
  } else {
    store().updateArticle(target.id, (article) =>
      withListing(article, channel, patch)
    )
  }
}

function targetNumber(target: PublishTarget): string {
  if (target.type === "UNIT") return findUnit(target.id)?.unitNumber ?? "?"
  return findArticle(target.id)?.sku ?? "?"
}

/**
 * Veröffentlicht oder aktualisiert ein Angebot auf einem Kanal.
 *
 * Der Ablauf ist für alle Kanäle gleich; nur der Adapter unterscheidet sich.
 * `SYNC_AUSSTEHEND` wird vor dem Aufruf gesetzt, damit ein Abbruch mitten im
 * Vorgang als offener Zustand sichtbar bleibt und nicht als "nie versucht".
 */
async function runPublish(
  target: PublishTarget,
  channel: Channel,
  mode: "publish" | "update"
): Promise<ActionResult> {
  const payload = payloadFor(target, channel)
  if (!payload) return actionFail("Datensatz nicht gefunden.")

  const adapter = getMarketplaceAdapter(channel)
  patchListing(target, channel, { status: "SYNC_AUSSTEHEND", lastError: null })

  const response =
    mode === "publish"
      ? await adapter.publishProduct(payload)
      : await adapter.updateProduct(payload)

  const number = targetNumber(target)

  if (!response.ok) {
    patchListing(target, channel, {
      status: "FEHLER",
      lastError: response.error.message,
      retryCount:
        (target.type === "UNIT"
          ? getListingOf(findUnit(target.id)!, channel)?.retryCount
          : getListingOf(findArticle(target.id)!, channel)?.retryCount) ?? 0,
    })
    log({
      category: "KANAL",
      action: `${CHANNEL_META[channel].label}: Veröffentlichung fehlgeschlagen`,
      detail: `${number}: ${response.error.message}`,
      unit: target.type === "UNIT" ? findUnit(target.id) : null,
      article: target.type === "ARTICLE" ? findArticle(target.id) : null,
      level: "error",
    })
    return actionFail(response.error.message)
  }

  patchListing(target, channel, {
    status: "VEROEFFENTLICHT",
    externalIds: response.data.externalIds,
    externalUrl: response.data.externalUrl,
    priceCents: payload.priceCents,
    inventory: payload.quantity,
    lastSyncedAt: response.data.publishedAt,
    lastError: null,
    retryCount: 0,
  })

  if (channel === "SHOPIFY") {
    store().setIntegrations({ shopifyLastSyncAt: response.data.publishedAt })
  }

  log({
    category: "KANAL",
    action: CHANNEL_META[channel].automated
      ? `${CHANNEL_META[channel].label}: veröffentlicht`
      : `${CHANNEL_META[channel].label}: als inseriert vermerkt`,
    detail: `${number} — ${payload.title}`,
    unit: target.type === "UNIT" ? findUnit(target.id) : null,
    article: target.type === "ARTICLE" ? findArticle(target.id) : null,
    level: "success",
  })
  return actionOk(undefined)
}

/** Setzt den Bestand eines veröffentlichten Mengenartikels nach. */
async function refreshChannelInventory(articleId: string): Promise<void> {
  const article = findArticle(articleId)
  if (!article) return
  for (const listing of article.listings) {
    if (listing.status !== "VEROEFFENTLICHT") continue
    if (!CHANNEL_META[listing.channel].automated) {
      // Kanäle ohne Schnittstelle können nicht nachgeführt werden. Der interne
      // Bestand stimmt trotzdem — die Anzeige dort ist Sache des Betriebs.
      continue
    }
    await runPublish({ type: "ARTICLE", id: articleId }, listing.channel, "update")
  }
}

async function deactivateAllChannels(target: PublishTarget): Promise<void> {
  const item =
    target.type === "UNIT" ? findUnit(target.id) : findArticle(target.id)
  if (!item) return

  for (const listing of item.listings) {
    if (listing.status !== "VEROEFFENTLICHT") continue
    const adapter = getMarketplaceAdapter(listing.channel)
    const payload = payloadFor(target, listing.channel)
    if (!payload) continue

    const response = await adapter.setUnavailable(payload)
    if (!response.ok) {
      patchListing(target, listing.channel, {
        status: "FEHLER",
        lastError: `Angebot konnte nicht geschlossen werden: ${response.error.message}`,
      })
      log({
        category: "KANAL",
        action: `${CHANNEL_META[listing.channel].label}: Deaktivierung fehlgeschlagen`,
        detail: `${targetNumber(target)}: ${response.error.message}`,
        level: "error",
      })
      continue
    }

    patchListing(target, listing.channel, {
      status: "DEAKTIVIERT",
      inventory: 0,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
  }
}

class DemoPublishingRepository implements PublishingRepository {
  async getProposals() {
    return store().proposals
  }

  /**
   * Baut die Freigabeliste neu auf.
   *
   * Der Kern der Automatik: Das System sucht selbst, was bereit ist, wählt den
   * Kanal selbst und schreibt das Inserat selbst. Bereits entschiedene
   * Vorschläge bleiben unangetastet — sonst käme ein abgelehnter Vorschlag
   * bei jeder Aktualisierung zurück.
   */
  async refreshProposals() {
    const state = store()
    const stock = levels()
    const existing = state.proposals

    const decided = existing.filter((proposal) => proposal.status !== "OFFEN")
    const decidedKeys = new Set(
      decided.map((proposal) => `${proposal.targetId}:${proposal.channel}`)
    )

    const fresh: PublicationProposal[] = []
    let autoPublished = 0

    for (const article of state.articles) {
      if (article.archivedAt !== null) continue
      const settings = settingsOf(article)
      const channel = resolveChannel(article, settings)
      if (!channel) continue
      const mode = resolvePublishMode(article, settings)
      if (mode === "MANUELL") continue

      if (article.stockMode === "MENGE") {
        const level = stock.get(article.id) ?? emptyStockLevel(article.id)
        const listing = getListingOf(article, channel)
        if (listing?.status === "VEROEFFENTLICHT") continue
        if (decidedKeys.has(`${article.id}:${channel}`)) continue
        if (!isReady(evaluateArticleReadiness(article, level, settings))) continue

        if (mode === "AUTOMATISCH") {
          const result = await runPublish(
            { type: "ARTICLE", id: article.id },
            channel,
            "publish"
          )
          if (result.ok) autoPublished += 1
          continue
        }

        fresh.push(buildArticleProposal(article, level, settings, channel))
        continue
      }

      for (const unit of state.units) {
        if (unit.articleId !== article.id) continue
        if (!isUnitInStock(unit)) continue
        if (unit.saleStatus !== "VERFUEGBAR") continue
        const listing = getListingOf(unit, channel)
        if (listing?.status === "VEROEFFENTLICHT") continue
        if (decidedKeys.has(`${unit.id}:${channel}`)) continue
        if (!isReady(evaluateUnitReadiness(unit, settings))) continue

        if (mode === "AUTOMATISCH") {
          const result = await runPublish(
            { type: "UNIT", id: unit.id },
            channel,
            "publish"
          )
          if (result.ok) autoPublished += 1
          continue
        }

        fresh.push(buildUnitProposal(article, unit, settings, channel))
      }
    }

    // Offene Vorschläge, die es weiterhin gibt, behalten ihre ID — sonst
    // verlöre eine laufende Mehrfachauswahl in der Oberfläche ihren Bezug.
    const byKey = new Map(
      existing
        .filter((proposal) => proposal.status === "OFFEN")
        .map((proposal) => [`${proposal.targetId}:${proposal.channel}`, proposal])
    )
    const merged = fresh.map((proposal) => {
      const previous = byKey.get(`${proposal.targetId}:${proposal.channel}`)
      return previous ? { ...proposal, id: previous.id, createdAt: previous.createdAt } : proposal
    })

    const removed = Math.max(0, byKey.size - merged.length)
    const created = merged.filter((proposal) => !byKey.has(`${proposal.targetId}:${proposal.channel}`)).length

    store().setProposals([...merged, ...decided])

    if (created > 0 || autoPublished > 0) {
      log({
        category: "KANAL",
        action: "Freigabeliste aktualisiert",
        detail:
          `${created} neue(r) Vorschlag/Vorschläge` +
          (autoPublished > 0 ? `, ${autoPublished} automatisch veröffentlicht` : "") +
          ".",
        level: created > 0 ? "warning" : "success",
      })
    }

    return actionOk({ created, removed })
  }

  async approve(proposalId: string) {
    const proposal = store().proposals.find((entry) => entry.id === proposalId)
    if (!proposal) return actionFail<PublicationProposal>("Vorschlag nicht gefunden.")
    if (proposal.status !== "OFFEN") {
      return actionFail<PublicationProposal>("Der Vorschlag ist bereits entschieden.", true)
    }

    const result = await runPublish(
      { type: proposal.targetType, id: proposal.targetId },
      proposal.channel,
      "publish"
    )
    if (!result.ok) return actionFail<PublicationProposal>(result.message)

    store().patchProposal(proposalId, {
      status: "FREIGEGEBEN",
      decidedAt: new Date().toISOString(),
      decidedBy: store().user.initials,
    })

    const updated = store().proposals.find((entry) => entry.id === proposalId)!
    return actionOk(updated)
  }

  async approveMany(proposalIds: string[]) {
    let approved = 0
    let failed = 0
    for (const id of proposalIds) {
      const result = await this.approve(id)
      if (result.ok) approved += 1
      else failed += 1
    }

    log({
      category: "KANAL",
      action: "Vorschläge freigegeben",
      detail:
        `${approved} Angebot(e) eingestellt` +
        (failed > 0 ? `, ${failed} fehlgeschlagen.` : "."),
      level: failed > 0 ? "warning" : "success",
    })

    // Auch ein Teilerfolg ist ein Erfolg — die Fehlschläge stehen einzeln im
    // Protokoll und bleiben als offene Vorschläge stehen.
    return actionOk({ approved, failed })
  }

  async reject(proposalId: string, note: string) {
    const proposal = store().proposals.find((entry) => entry.id === proposalId)
    if (!proposal) return actionFail<PublicationProposal>("Vorschlag nicht gefunden.")

    store().patchProposal(proposalId, {
      status: "ABGELEHNT",
      decidedAt: new Date().toISOString(),
      decidedBy: store().user.initials,
      note,
    })

    log({
      category: "KANAL",
      action: "Vorschlag abgelehnt",
      detail: `${proposal.title}${note ? ` — ${note}` : ""}`,
    })
    const updated = store().proposals.find((entry) => entry.id === proposalId)!
    return actionOk(updated)
  }

  async publishUnit(unitId: string, channel: Channel) {
    const result = await runPublish({ type: "UNIT", id: unitId }, channel, "publish")
    if (!result.ok) return actionFail<ArticleUnit>(result.message)
    const unit = findUnit(unitId)
    return unit ? actionOk(unit) : actionFail<ArticleUnit>("Einzelstück nicht gefunden.")
  }

  async publishArticle(articleId: string, channel: Channel) {
    const article = findArticle(articleId)
    if (!article) return actionFail<Article>("Artikel nicht gefunden.")
    if (article.stockMode !== "MENGE") {
      return actionFail<Article>(
        "Einzelstücke werden je Gerät veröffentlicht, nicht als Artikel.",
        true
      )
    }
    const result = await runPublish({ type: "ARTICLE", id: articleId }, channel, "publish")
    if (!result.ok) return actionFail<Article>(result.message)
    const updated = findArticle(articleId)
    return updated ? actionOk(updated) : actionFail<Article>("Artikel nicht gefunden.")
  }

  async updateListing(target: PublishTarget, channel: Channel) {
    return runPublish(target, channel, "update")
  }

  async deactivate(target: PublishTarget, channel: Channel) {
    const payload = payloadFor(target, channel)
    if (!payload) return actionFail("Datensatz nicht gefunden.")

    const response = await getMarketplaceAdapter(channel).setUnavailable(payload)
    if (!response.ok) {
      patchListing(target, channel, {
        status: "FEHLER",
        lastError: response.error.message,
      })
      return actionFail(response.error.message)
    }

    patchListing(target, channel, {
      status: "DEAKTIVIERT",
      inventory: 0,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    })
    log({
      category: "KANAL",
      action: `${CHANNEL_META[channel].label}: deaktiviert`,
      detail: targetNumber(target),
      level: "warning",
    })
    return actionOk(undefined)
  }

  async retry(target: PublishTarget, channel: Channel) {
    const item =
      target.type === "UNIT" ? findUnit(target.id) : findArticle(target.id)
    if (!item) return actionFail("Datensatz nicht gefunden.")

    const listing = getListingOf(item, channel)
    patchListing(target, channel, { retryCount: (listing?.retryCount ?? 0) + 1 })

    const mode = listing?.externalIds.productId ? "update" : "publish"
    return runPublish(target, channel, mode)
  }
}

/* ------------------------------------------------------------------ */
/* Verkäufe & Reporting                                                */
/* ------------------------------------------------------------------ */

/** Schreibt eine Verkaufszeile Richtung Google Sheets. Idempotent über sale.id. */
async function syncSaleToSheets(saleId: string): Promise<ActionResult<Sale>> {
  const sale = store().sales.find((entry) => entry.id === saleId)
  if (!sale) return actionFail<Sale>("Verkauf nicht gefunden.")

  // Bereits geschrieben: kein zweiter Schreibvorgang, auch nicht nach einem
  // Neuladen. Der Wiederholen-Knopf darf keine Doppelzeile erzeugen.
  if (sale.sheetsSyncStatus === "SYNCHRONISIERT") return actionOk(sale)

  store().patchSale(saleId, { sheetsSyncStatus: "WARTET", sheetsError: null })

  const response = await sheetsAdapter.appendSale(sale)

  if (!response.ok) {
    store().patchSale(saleId, {
      sheetsSyncStatus: "FEHLER",
      sheetsError: response.error.message,
    })
    log({
      category: "SYNC",
      action: "Google-Sheets-Synchronisation fehlgeschlagen",
      detail: `${sale.itemNumber}: ${response.error.message}`,
      level: "error",
    })
    return actionFail<Sale>(response.error.message)
  }

  const now = new Date().toISOString()
  store().patchSale(saleId, {
    sheetsSyncStatus: "SYNCHRONISIERT",
    sheetsSyncedAt: now,
    sheetsError: null,
    sheetsRowNumber: response.data.rowNumber,
  })
  store().setIntegrations({ sheetsLastSyncAt: now })

  log({
    category: "SYNC",
    action: "Google Sheets synchronisiert",
    detail: `Verkaufszeile ${response.data.rowNumber} in die Umsatztabelle geschrieben.`,
    level: "success",
  })

  const updated = store().sales.find((entry) => entry.id === saleId)
  return updated ? actionOk(updated) : actionFail<Sale>("Verkauf nicht gefunden.")
}

class DemoSalesRepository implements SalesRepository {
  async getAll() {
    return store().sales
  }

  async retrySheetsSync(saleId: string) {
    return syncSaleToSheets(saleId)
  }
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

class DemoImportRepository implements ImportRepository {
  async getBatches() {
    return store().importBatches
  }

  async importRows(input: Parameters<ImportRepository["importRows"]>[0]) {
    const state = store()
    const category = state.categories.find(
      (entry) => entry.id === input.categoryId
    )
    if (!category) return actionFail<ImportBatch>("Bereich nicht gefunden.", true)

    const settings = resolveCategorySettings(state.categories, input.categoryId)
    const issues: ImportIssue[] = []

    const result =
      settings.stockMode === "SERIALISIERT"
        ? importUnits(input.rows, input.categoryId, settings.numberPrefix, issues)
        : importQuantities(input.rows, input.categoryId, settings.numberPrefix, issues)

    const batch: ImportBatch = {
      id: createId("imp"),
      fileName: input.fileName,
      source: input.source,
      categoryId: input.categoryId,
      categoryLabel: settings.pathLabel,
      stockMode: settings.stockMode,
      rowsTotal: input.rows.length,
      rowsImported: result.imported,
      rowsSkipped: input.rows.length - result.imported,
      issues,
      createdAt: new Date().toISOString(),
      createdBy: store().user.name,
    }

    store().addImportBatch(batch)
    log({
      category: "IMPORT",
      action: "Datei eingelesen",
      detail:
        `${input.fileName} nach ${settings.pathLabel}: ${result.imported} von ` +
        `${input.rows.length} Zeilen übernommen` +
        (issues.length > 0 ? `, ${issues.length} Hinweis(e).` : "."),
      level: issues.some((issue) => issue.severity === "error")
        ? "warning"
        : "success",
    })

    return actionOk(batch)
  }

  async saveMapping(categoryId: string, mapping: Parameters<ImportRepository["saveMapping"]>[1]) {
    store().setSavedMapping(categoryId, mapping)
    return actionOk(undefined)
  }

  async loadDemoTable() {
    try {
      return actionOk(await importSource.loadDemoTable())
    } catch (error) {
      return actionFail<Awaited<ReturnType<typeof importSource.loadDemoTable>>>(
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}

/**
 * Geräteimport: je Zeile ein Einzelstück.
 *
 * Der Artikel (das Modell) wird bei Bedarf mit angelegt — wer eine
 * Lieferliste einliest, soll nicht vorher von Hand vier Modellstammsätze
 * pflegen müssen. Zusammengefasst wird über Hersteller + Bezeichnung.
 */
function importUnits(
  rows: ImportRow[],
  categoryId: string,
  prefix: string,
  issues: ImportIssue[]
): { imported: number } {
  const state = store()
  const settings = resolveCategorySettings(state.categories, categoryId)

  const skuPool = state.articles.map((article) => article.sku)
  const numberPool = state.units.map((unit) => unit.unitNumber)
  const seenSerials = new Set(
    state.units.map((unit) => normalizeReference(unit.serialNumber)).filter(Boolean)
  )

  const articleByKey = new Map(
    state.articles
      .filter((article) => article.categoryId === categoryId)
      .map((article) => [
        `${article.manufacturer.toLowerCase()}|${article.name.toLowerCase()}`,
        article,
      ])
  )

  const newArticles: Article[] = []
  const newUnits: ArticleUnit[] = []

  rows.forEach((row, index) => {
    const rowNumber = index + 1
    const serial = normalizeReference(row.serialNumber ?? "")

    if (!serial) {
      issues.push({
        row: rowNumber,
        reference: row.name ?? "",
        reason: "Ohne Seriennummer lässt sich das Gerät nicht eindeutig führen.",
        severity: "error",
      })
      return
    }
    if (seenSerials.has(serial)) {
      issues.push({
        row: rowNumber,
        reference: row.serialNumber ?? "",
        reason: "Seriennummer bereits im Bestand — Zeile übersprungen, nichts überschrieben.",
        severity: "warning",
      })
      return
    }

    const name = (row.name ?? "").trim()
    if (!name) {
      issues.push({
        row: rowNumber,
        reference: row.serialNumber ?? "",
        reason: "Ohne Bezeichnung lässt sich kein Artikel zuordnen.",
        severity: "error",
      })
      return
    }

    const manufacturer = (row.manufacturer ?? "").trim()
    const key = `${manufacturer.toLowerCase()}|${name.toLowerCase()}`
    let article = articleByKey.get(key)

    if (!article) {
      const sku = nextArticleSku(skuPool, prefix)
      skuPool.push(sku)
      article = createArticle(
        { categoryId, name, manufacturer, attributes: row.attributes },
        sku,
        settings
      )
      articleByKey.set(key, article)
      newArticles.push(article)
    }

    const unitNumber = nextUnitNumber(numberPool, prefix)
    numberPool.push(unitNumber)
    seenSerials.add(serial)

    newUnits.push(
      createUnit(
        {
          articleId: article.id,
          serialNumber: row.serialNumber,
          variant: row.variant,
          color: row.color,
          mileageKm: row.mileageKm,
          condition: row.condition,
          purchasePriceCents: row.purchasePriceCents,
          salePriceCents: row.salePriceCents ?? null,
          purchaseDate: row.purchaseDate,
          notes: row.notes,
          attributes: row.attributes,
        },
        unitNumber
      )
    )
  })

  if (newArticles.length > 0) store().upsertArticles(newArticles)
  if (newUnits.length > 0) store().upsertUnits(newUnits)

  return { imported: newUnits.length }
}

/**
 * Teileimport: je Zeile ein Artikel mit Zugangsbuchung.
 *
 * Ist die Teilenummer bereits bekannt, entsteht kein zweiter Stammsatz,
 * sondern ein Zugang auf den vorhandenen. Genau das verhindert die
 * Zersplitterung, an der Teilelager in der Praxis scheitern.
 */
function importQuantities(
  rows: ImportRow[],
  categoryId: string,
  prefix: string,
  issues: ImportIssue[]
): { imported: number } {
  const state = store()
  const settings = resolveCategorySettings(state.categories, categoryId)
  const skuPool = state.articles.map((article) => article.sku)

  const byMpn = new Map(
    state.articles
      .filter((article) => article.mpn)
      .map((article) => [normalizeReference(article.mpn), article])
  )
  const byName = new Map(
    state.articles
      .filter((article) => article.categoryId === categoryId)
      .map((article) => [
        `${article.manufacturer.toLowerCase()}|${article.name.toLowerCase()}`,
        article,
      ])
  )

  const locationsByCode = new Map(
    state.locations.map((location) => [location.code.toUpperCase(), location.id])
  )

  const newArticles: Article[] = []
  const movements: StockMovement[] = []
  const now = new Date().toISOString()
  let imported = 0

  rows.forEach((row, index) => {
    const rowNumber = index + 1
    const name = (row.name ?? "").trim()
    const mpn = normalizeReference(row.mpn ?? "")

    if (!name && !mpn) {
      issues.push({
        row: rowNumber,
        reference: "",
        reason: "Weder Bezeichnung noch Teilenummer — nicht zuordenbar.",
        severity: "error",
      })
      return
    }

    const quantity = row.quantity ?? 0
    if (quantity <= 0) {
      issues.push({
        row: rowNumber,
        reference: row.mpn ?? name,
        reason: "Ohne Menge gibt es nichts zu buchen.",
        severity: "error",
      })
      return
    }

    const manufacturer = (row.manufacturer ?? "").trim()
    const nameKey = `${manufacturer.toLowerCase()}|${name.toLowerCase()}`
    let article = (mpn ? byMpn.get(mpn) : undefined) ?? byName.get(nameKey)

    if (article) {
      issues.push({
        row: rowNumber,
        reference: row.mpn ?? name,
        reason: `Artikel ${article.sku} bereits bekannt — Zugang gebucht statt neu angelegt.`,
        severity: "warning",
      })
    } else {
      const sku = nextArticleSku(skuPool, prefix)
      skuPool.push(sku)
      article = createArticle(
        {
          categoryId,
          name: name || (row.mpn ?? ""),
          manufacturer,
          mpn: row.mpn,
          ean: row.ean,
          condition: row.condition,
          salePriceCents: row.salePriceCents ?? null,
          notes: row.notes,
          attributes: row.attributes,
        },
        sku,
        settings
      )
      if (mpn) byMpn.set(mpn, article)
      byName.set(nameKey, article)
      newArticles.push(article)
    }

    movements.push({
      id: createId("mov"),
      at: now,
      actor: store().user.name,
      articleId: article.id,
      unitId: null,
      quantity,
      type: "ZUGANG",
      unitCostCents: row.purchasePriceCents ?? 0,
      locationId: row.location
        ? (locationsByCode.get(row.location.trim().toUpperCase()) ?? null)
        : null,
      toLocationId: null,
      referenceId: null,
      note: `Import ${row.mpn ?? name}`,
    })
    imported += 1
  })

  if (newArticles.length > 0) store().upsertArticles(newArticles)
  if (movements.length > 0) store().addMovements(movements)

  return { imported }
}

/* ------------------------------------------------------------------ */
/* Einstellungen & Datensicherung                                      */
/* ------------------------------------------------------------------ */

/** Kennzeichnet eine Sicherungsdatei, damit fremde JSON-Dateien auffallen. */
const SNAPSHOT_MARKER = "skope-cockpit-snapshot"

interface Snapshot {
  marker: typeof SNAPSHOT_MARKER
  version: number
  exportedAt: string
  categories: Category[]
  locations: StorageLocation[]
  articles: Article[]
  units: ArticleUnit[]
  movements: StockMovement[]
  teardowns: Teardown[]
  proposals: PublicationProposal[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
}

type SnapshotSummary = { articles: number; units: number; sales: number }

class DemoSettingsRepository implements SettingsRepository {
  async setIntegrationFlags(patch: Partial<IntegrationState>) {
    store().setIntegrations(patch)
    return actionOk(undefined)
  }

  async exportSnapshot() {
    const state = store()
    const snapshot: Snapshot = {
      marker: SNAPSHOT_MARKER,
      version: SNAPSHOT_VERSION,
      exportedAt: new Date().toISOString(),
      categories: state.categories,
      locations: state.locations,
      articles: state.articles,
      units: state.units,
      movements: state.movements,
      teardowns: state.teardowns,
      proposals: state.proposals,
      sales: state.sales,
      activity: state.activity,
      importBatches: state.importBatches,
    }

    const stamp = snapshot.exportedAt.slice(0, 10)
    return actionOk({
      fileName: `skope-sicherung-${stamp}.json`,
      json: JSON.stringify(snapshot, null, 2),
    })
  }

  async importSnapshot(json: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return actionFail<SnapshotSummary>("Die Datei ist kein gültiges JSON.", true)
    }

    const snapshot = parsed as Partial<Snapshot>
    if (snapshot?.marker !== SNAPSHOT_MARKER || !Array.isArray(snapshot.articles)) {
      return actionFail<SnapshotSummary>(
        "Das ist keine SKOPE-Sicherungsdatei im Artikel-Format.",
        true
      )
    }

    /*
      Die Version der Sicherung wird gelesen, nicht nur geschrieben.

      Eine Sicherung aus einer neueren Fassung kann Felder mitbringen, die es
      hier noch nicht gibt — die werden ohne Prüfung zu stillen Fehlern.
      Ältere Sicherungen sind unkritisch: Fehlende Felder werden aufgefüllt.
    */
    const version = Number(snapshot.version ?? 0)
    if (version > SNAPSHOT_VERSION) {
      return actionFail<SnapshotSummary>(
        `Die Sicherung stammt aus einer neueren Fassung (Version ${version}, ` +
          `diese Installation kennt Version ${SNAPSHOT_VERSION}).`,
        true
      )
    }

    /*
      Jede Liste wird einzeln geprüft, bevor irgendetwas geschrieben wird.

      `?? []` fängt nur `null` und `undefined` ab: Ein Feld, das in einer
      halb geschriebenen oder von Hand bearbeiteten Datei als Objekt statt
      als Liste ankommt, rutscht durch und lässt die Bestandsrechnung beim
      nächsten Rendern abstürzen — mit bereits überschriebenem Vorgänger.
    */
    const LIST_FIELDS = [
      "categories",
      "locations",
      "articles",
      "units",
      "movements",
      "teardowns",
      "proposals",
      "sales",
      "activity",
      "importBatches",
    ] as const

    const record = snapshot as unknown as Record<string, unknown>
    const broken = LIST_FIELDS.filter((field) => {
      const value = record[field]
      return value !== undefined && value !== null && !Array.isArray(value)
    })
    if (broken.length > 0) {
      return actionFail<SnapshotSummary>(
        `Die Sicherungsdatei ist beschädigt: ${broken.join(", ")} ist keine Liste. ` +
          "Es wurde nichts überschrieben.",
        true
      )
    }

    const list = <T,>(value: unknown): T[] =>
      Array.isArray(value) ? (value as T[]) : []

    const sales = list<Sale>(snapshot.sales).map((sale) => ({
      ...sale,
      sheetsRowNumber: sale.sheetsRowNumber ?? null,
    }))

    store().replaceAll({
      categories: list(snapshot.categories),
      locations: list(snapshot.locations),
      articles: snapshot.articles,
      units: list(snapshot.units),
      movements: list(snapshot.movements),
      teardowns: list(snapshot.teardowns),
      proposals: list(snapshot.proposals),
      sales,
      activity: list(snapshot.activity),
      importBatches: list(snapshot.importBatches),
    })

    log({
      category: "SYSTEM",
      action: "Sicherung eingespielt",
      detail:
        `${snapshot.articles.length} Artikel, ${list(snapshot.units).length} Einzelstücke und ` +
        `${sales.length} Verkäufe aus einer Sicherung vom ` +
        `${formatSnapshotDate(snapshot.exportedAt)} übernommen.`,
      level: "warning",
    })

    return actionOk({
      articles: snapshot.articles.length,
      units: list(snapshot.units).length,
      sales: sales.length,
    })
  }
}

function formatSnapshotDate(iso: string | undefined): string {
  if (!iso) return "unbekannten Datum"
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? "unbekannten Datum"
    : date.toLocaleDateString("de-DE")
}

/* ------------------------------------------------------------------ */
/* Demo-Funktionen                                                     */
/* ------------------------------------------------------------------ */

class DemoExtras implements DemoRepositoryExtras {
  /**
   * Simuliert eine eingehende Shopify-Bestellung.
   *
   * Bildet exakt den Ablauf ab, den später der echte Webhook auslöst:
   * Bestellung auswerten → Gerät identifizieren → intern auf VERKAUFT →
   * andere Kanäle deaktivieren → Reporting synchronisieren → Protokoll.
   */
  async simulateShopifyOrder(unitId: string): Promise<ActionResult<Sale>> {
    const unit = findUnit(unitId)
    if (!unit) return actionFail<Sale>("Einzelstück nicht gefunden.")

    const listing = getListingOf(unit, "SHOPIFY")
    if (listing?.status !== "VEROEFFENTLICHT") {
      return actionFail<Sale>(
        "Das Gerät ist nicht auf Shopify veröffentlicht — es kann keine Bestellung eingehen.",
        true
      )
    }

    log({
      category: "SYNC",
      action: "Shopify-Bestellung empfangen",
      detail: `Webhook orders/create für SKU ${unit.unitNumber} verarbeitet.`,
      unit,
      actor: "System (Shopify Webhook)",
    })

    // Kein Rückfall auf 0 €: Ein Verkauf ohne Preis ist unumkehrbar und
    // verfälscht Umsatz und Marge des Monats.
    const salePriceCents = unit.salePriceCents ?? listing.priceCents
    if (salePriceCents === null || salePriceCents <= 0) {
      return actionFail<Sale>(
        `${unit.unitNumber} hat keinen Verkaufspreis. Der Vorgang wurde abgebrochen, ` +
          `damit kein Verkauf über 0 € entsteht.`,
        true
      )
    }

    return new DemoUnitRepository().markAsSold(unitId, {
      channel: "SHOPIFY",
      // Bei einer echten Bestellung käme die Herkunft aus den UTM-Feldern der
      // Shopify-Order. Solange die Schnittstelle nicht steht, wird nichts
      // behauptet: WEBSITE ist gesichert, die Quelle davor nicht.
      customerSource: "WEBSITE",
      customerRegion: "",
      saleLocation: "Versand",
      salePriceCents,
      soldAt: new Date().toISOString(),
      note: "Automatisch über Shopify-Bestellung erfasst (Demo-Webhook).",
    })
  }

  async resetDemoData(): Promise<ActionResult> {
    store().resetDemoData()
    // Der Log-Eintrag gehört bewusst in den frischen Zustand, nicht davor.
    log({
      category: "SYSTEM",
      action: "Demo-Daten zurückgesetzt",
      detail: "Der Beispielbestand wurde auf den Auslieferungszustand gebracht.",
      level: "warning",
    })
    return actionOk(undefined)
  }
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export const repositories: Repositories = {
  categories: new DemoCategoryRepository(),
  locations: new DemoLocationRepository(),
  articles: new DemoArticleRepository(),
  units: new DemoUnitRepository(),
  stock: new DemoStockRepository(),
  teardowns: new DemoTeardownRepository(),
  publishing: new DemoPublishingRepository(),
  sales: new DemoSalesRepository(),
  imports: new DemoImportRepository(),
  settings: new DemoSettingsRepository(),
  demo: new DemoExtras(),
}

// Der Prototyp meldet Speicherprobleme über denselben Weg wie der Store.
export { reportPersistenceProblem }
