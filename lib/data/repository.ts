/**
 * Vertrag der Datenschicht.
 *
 * Die Oberfläche kennt ausschließlich diese Interfaces. Aktuell steht
 * dahinter `DemoRepository` (Zustand + localStorage), später eine
 * Supabase-Implementierung — ohne dass Komponenten angefasst werden müssen.
 *
 * Alle Methoden sind asynchron, obwohl der Prototyp synchron arbeiten könnte.
 * Das ist Absicht: Der spätere echte Datenzugriff ist asynchron, und die
 * Aufrufstellen sollen dafür heute schon richtig geschrieben sein.
 */

import type {
  Article,
  ArticleUnit,
  Category,
  Channel,
  ColumnMapping,
  Condition,
  CustomerSource,
  ImportBatch,
  InspectionResult,
  IntegrationState,
  MovementType,
  PublicationProposal,
  Repair,
  Sale,
  SaleChannel,
  StockImage,
  StockMovement,
  StorageLocation,
  Teardown,
  TeardownLine,
  WorkflowStatus,
} from "@/lib/domain/types"
import type { NewArticleInput, NewUnitInput } from "@/lib/domain/article-factory"
import type { ParsedTable } from "@/lib/integrations/types"

/** Einheitliches Ergebnis schreibender Operationen. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false
      message: string
      /** Fachlicher Konflikt statt technischem Fehler. */
      conflict?: boolean
    }

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function actionFail<T = void>(
  message: string,
  conflict = false
): ActionResult<T> {
  return { ok: false, message, conflict }
}

/* ------------------------------------------------------------------ */
/* Bereiche und Lagerplätze                                            */
/* ------------------------------------------------------------------ */

export type NewCategoryInput = Pick<
  Category,
  "parentId" | "name" | "numberPrefix" | "stockMode"
> &
  Partial<
    Pick<
      Category,
      | "description"
      | "attributes"
      | "reorderLevel"
      | "defaultChannel"
      | "publishMode"
      | "requiresInspection"
    >
  >

export interface CategoryRepository {
  getAll(): Promise<Category[]>
  create(input: NewCategoryInput): Promise<ActionResult<Category>>
  update(id: string, patch: Partial<Category>): Promise<ActionResult<Category>>
  /**
   * Löschen ist nur möglich, solange weder Artikel noch Unterbereiche
   * darauf verweisen — ein Artikel ohne Bereich hätte weder Nummernkreis
   * noch Merkmalsfelder.
   */
  remove(id: string): Promise<ActionResult>
  move(id: string, parentId: string | null): Promise<ActionResult<Category>>
}

export interface LocationRepository {
  getAll(): Promise<StorageLocation[]>
  create(
    input: Pick<StorageLocation, "code" | "name"> &
      Partial<Pick<StorageLocation, "note">>
  ): Promise<ActionResult<StorageLocation>>
  update(
    id: string,
    patch: Partial<StorageLocation>
  ): Promise<ActionResult<StorageLocation>>
  remove(id: string): Promise<ActionResult>
}

/* ------------------------------------------------------------------ */
/* Artikel                                                             */
/* ------------------------------------------------------------------ */

export interface ArticleRepository {
  getAll(): Promise<Article[]>
  getById(id: string): Promise<Article | undefined>
  getBySku(sku: string): Promise<Article | undefined>

  create(input: NewArticleInput): Promise<ActionResult<Article>>
  update(id: string, patch: Partial<Article>): Promise<ActionResult<Article>>

  /** Nimmt den Artikel aus dem Verkehr, ohne die Historie zu verlieren. */
  archive(id: string): Promise<ActionResult<Article>>
  restore(id: string): Promise<ActionResult<Article>>

  addImages(
    id: string,
    images: Omit<StockImage, "id" | "createdAt" | "sortOrder" | "isPrimary">[]
  ): Promise<ActionResult<Article>>
  removeImage(id: string, imageId: string): Promise<ActionResult<Article>>
  setPrimaryImage(id: string, imageId: string): Promise<ActionResult<Article>>
  reorderImages(id: string, imageIds: string[]): Promise<ActionResult<Article>>
}

/* ------------------------------------------------------------------ */
/* Einzelstücke                                                        */
/* ------------------------------------------------------------------ */

export interface MarkAsSoldInput {
  channel: SaleChannel
  /** Woher der Kunde kam — Grundlage der Herkunftsauswertung. */
  customerSource: CustomerSource
  /** Ort oder PLZ des Käufers, freiwillig. */
  customerRegion: string
  /** Wo übergeben wurde (Lager, Versand, Filiale). */
  saleLocation: string
  salePriceCents: number
  soldAt: string
  note: string
}

export interface UnitRepository {
  getAll(): Promise<ArticleUnit[]>
  getById(id: string): Promise<ArticleUnit | undefined>
  getByNumber(unitNumber: string): Promise<ArticleUnit | undefined>

  create(input: NewUnitInput): Promise<ActionResult<ArticleUnit>>
  update(
    id: string,
    patch: Partial<ArticleUnit>
  ): Promise<ActionResult<ArticleUnit>>

  updateWorkflowStatus(
    id: string,
    status: WorkflowStatus
  ): Promise<ActionResult<ArticleUnit>>
  updateSaleStatus(
    id: string,
    status: "VERFUEGBAR" | "RESERVIERT"
  ): Promise<ActionResult<ArticleUnit>>

  /** Zentraler Verkaufsvorgang. Deaktiviert anschließend alle Kanäle. */
  markAsSold(id: string, input: MarkAsSoldInput): Promise<ActionResult<Sale>>

  /* Prüfung */
  setInspectionCheck(
    id: string,
    checkKey: string,
    result: InspectionResult,
    note?: string
  ): Promise<ActionResult<ArticleUnit>>
  setInspectionNote(id: string, note: string): Promise<ActionResult<ArticleUnit>>
  completeInspection(id: string): Promise<ActionResult<ArticleUnit>>
  reopenInspection(id: string): Promise<ActionResult<ArticleUnit>>

  /* Aufbereitung */
  setCleaning(
    id: string,
    done: boolean,
    note?: string
  ): Promise<ActionResult<ArticleUnit>>
  /**
   * Legt eine Reparatur an. Ist `partArticleId` gesetzt, wird das Ersatzteil
   * zugleich aus dem Lager abgebucht und mit seinem Einstandswert bewertet.
   */
  addRepair(
    id: string,
    repair: Omit<Repair, "id" | "createdAt">
  ): Promise<ActionResult<ArticleUnit>>
  updateRepair(
    id: string,
    repairId: string,
    patch: Partial<Repair>
  ): Promise<ActionResult<ArticleUnit>>
  removeRepair(id: string, repairId: string): Promise<ActionResult<ArticleUnit>>

  /* Bilder */
  addImages(
    id: string,
    images: Omit<StockImage, "id" | "createdAt" | "sortOrder" | "isPrimary">[]
  ): Promise<ActionResult<ArticleUnit>>
  removeImage(id: string, imageId: string): Promise<ActionResult<ArticleUnit>>
  setPrimaryImage(id: string, imageId: string): Promise<ActionResult<ArticleUnit>>
  reorderImages(id: string, imageIds: string[]): Promise<ActionResult<ArticleUnit>>
}

/* ------------------------------------------------------------------ */
/* Bestand                                                             */
/* ------------------------------------------------------------------ */

export interface BookingInput {
  articleId: string
  quantity: number
  type: MovementType
  unitCostCents?: number | null
  locationId?: string | null
  toLocationId?: string | null
  referenceId?: string | null
  note?: string
}

export interface StockRepository {
  getMovements(): Promise<StockMovement[]>

  /** Zugang buchen — Einkauf, Lieferung, Rückläufer. */
  receive(input: {
    articleId: string
    quantity: number
    unitCostCents: number
    locationId: string | null
    note?: string
  }): Promise<ActionResult<StockMovement>>

  /** Abgang buchen — Verbrauch, Verlust, Entsorgung. */
  issue(input: {
    articleId: string
    quantity: number
    type: Extract<MovementType, "VERBRAUCH" | "VERLUST">
    locationId: string | null
    note?: string
  }): Promise<ActionResult<StockMovement>>

  /**
   * Inventur: Zählmenge eintragen. Die Differenz wird als Korrektur mit
   * Begründung gebucht — ein stilles Überschreiben gibt es nicht.
   */
  correct(input: {
    articleId: string
    countedQuantity: number
    locationId: string | null
    reason: string
  }): Promise<ActionResult<StockMovement | null>>

  transfer(input: {
    articleId: string
    quantity: number
    fromLocationId: string | null
    toLocationId: string | null
    note?: string
  }): Promise<ActionResult<StockMovement>>

  /** Direktverkauf eines Mengenartikels, z. B. über die Ladentheke. */
  sell(input: {
    articleId: string
    quantity: number
    locationId: string | null
    salePriceCents: number
    channel: SaleChannel
    customerSource: CustomerSource
    customerRegion: string
    saleLocation: string
    soldAt: string
    note: string
  }): Promise<ActionResult<Sale>>
}

/* ------------------------------------------------------------------ */
/* Ausschlachtung                                                      */
/* ------------------------------------------------------------------ */

export interface TeardownRepository {
  getAll(): Promise<Teardown[]>

  /**
   * Bucht eine Ausschlachtung in einem Zug: Das Spendergerät geht auf
   * AUSGESCHLACHTET, jede Zeile erzeugt einen Zugang mit dem verteilten
   * Einstandswert. Beides zusammen oder gar nicht — sonst entstünde Bestand
   * ohne Gegenbuchung.
   */
  book(input: {
    sourceUnitId: string
    distribution: Teardown["distribution"]
    lines: TeardownLine[]
    note: string
  }): Promise<ActionResult<Teardown>>
}

/* ------------------------------------------------------------------ */
/* Veröffentlichung                                                    */
/* ------------------------------------------------------------------ */

export interface PublishingRepository {
  getProposals(): Promise<PublicationProposal[]>

  /**
   * Baut die Freigabeliste neu auf: Alles, was bereit ist und noch nicht
   * inseriert, bekommt einen Vorschlag. Bereits entschiedene Vorschläge
   * bleiben unangetastet.
   */
  refreshProposals(): Promise<ActionResult<{ created: number; removed: number }>>

  approve(proposalId: string): Promise<ActionResult<PublicationProposal>>
  approveMany(
    proposalIds: string[]
  ): Promise<ActionResult<{ approved: number; failed: number }>>
  reject(proposalId: string, note: string): Promise<ActionResult<PublicationProposal>>

  /** Manuelle Veröffentlichung, unabhängig von der Freigabeliste. */
  publishUnit(unitId: string, channel: Channel): Promise<ActionResult<ArticleUnit>>
  publishArticle(articleId: string, channel: Channel): Promise<ActionResult<Article>>
  updateListing(
    target: { type: "UNIT" | "ARTICLE"; id: string },
    channel: Channel
  ): Promise<ActionResult>
  deactivate(
    target: { type: "UNIT" | "ARTICLE"; id: string },
    channel: Channel
  ): Promise<ActionResult>
  retry(
    target: { type: "UNIT" | "ARTICLE"; id: string },
    channel: Channel
  ): Promise<ActionResult>
}

/* ------------------------------------------------------------------ */
/* Verkauf, Import, Einstellungen                                      */
/* ------------------------------------------------------------------ */

export interface SalesRepository {
  getAll(): Promise<Sale[]>
  /** Reporting-Sync erneut anstoßen. */
  retrySheetsSync(saleId: string): Promise<ActionResult<Sale>>
}

/** Eine importierte Zeile, bereits auf Zielfelder abgebildet. */
export interface ImportRow {
  name?: string
  manufacturer?: string
  mpn?: string
  ean?: string
  serialNumber?: string
  variant?: string
  color?: string
  quantity?: number
  purchasePriceCents?: number
  salePriceCents?: number | null
  mileageKm?: number
  condition?: Condition
  purchaseDate?: string
  location?: string
  notes?: string
  attributes?: Record<string, string>
}

export interface ImportRepository {
  getBatches(): Promise<ImportBatch[]>

  /**
   * Legt aus zugeordneten Zeilen Bestand an — in der gewählten Kategorie.
   *
   * Bei SERIALISIERT entsteht je Zeile ein Einzelstück, Dubletten anhand der
   * Seriennummer werden übersprungen und nie überschrieben. Bei MENGE wird
   * je Zeile ein Artikel angelegt oder — wenn Teilenummer bzw. Name schon
   * bekannt sind — ein Zugang auf den vorhandenen Artikel gebucht.
   */
  importRows(input: {
    fileName: string
    source: ImportBatch["source"]
    categoryId: string
    rows: ImportRow[]
  }): Promise<ActionResult<ImportBatch>>

  /** Bestätigte Spaltenzuordnung sichern, damit Folge-Importe schneller gehen. */
  saveMapping(
    categoryId: string,
    mapping: ColumnMapping[]
  ): Promise<ActionResult>

  /** Beispiel-Lieferliste für den Demo-Modus. */
  loadDemoTable(): Promise<ActionResult<ParsedTable>>
}

/**
 * Systemeinstellungen und Datensicherung.
 *
 * Die Sicherung ist im Prototyp kein Komfort, sondern die einzige
 * Ausstiegstür: Der gesamte Bestand hängt an einem Browserprofil. Dieselbe
 * Exportdatei ist später der Eingang für die einmalige Übernahme nach
 * Postgres.
 */
export interface SettingsRepository {
  setIntegrationFlags(patch: Partial<IntegrationState>): Promise<ActionResult>
  /** Vollständiger Abzug als JSON-Text, inklusive Versionsnummer. */
  exportSnapshot(): Promise<ActionResult<{ fileName: string; json: string }>>
  /** Spielt einen zuvor erzeugten Abzug wieder ein. Ersetzt den Bestand. */
  importSnapshot(
    json: string
  ): Promise<ActionResult<{ articles: number; units: number; sales: number }>>
}

export interface DemoRepositoryExtras {
  /** Simuliert eine eingehende Shopify-Bestellung inklusive Folgeprozess. */
  simulateShopifyOrder(unitId: string): Promise<ActionResult<Sale>>
  resetDemoData(): Promise<ActionResult>
}

export interface Repositories {
  categories: CategoryRepository
  locations: LocationRepository
  articles: ArticleRepository
  units: UnitRepository
  stock: StockRepository
  teardowns: TeardownRepository
  publishing: PublishingRepository
  sales: SalesRepository
  imports: ImportRepository
  settings: SettingsRepository
  demo: DemoRepositoryExtras
}
