/**
 * SKOPE Domain-Modell.
 *
 * Diese Typen bilden den fachlichen Kern ab und sind bewusst frei von
 * UI-, Storage- und Integrationsdetails. Beim Wechsel von der Demo-Persistenz
 * auf Supabase ändert sich dieses Modul idealerweise gar nicht.
 *
 * Geldbeträge werden durchgängig als ganze Cent gespeichert (nie als Float),
 * damit Margen nicht durch Rundungsfehler auseinanderlaufen.
 *
 * ---------------------------------------------------------------------------
 * Die drei tragenden Begriffe
 *
 *  - **Kategorie** — ein selbst angelegter Lagerbereich (Scooter, Ersatzteile
 *    › Elektrik › Displays). Trägt die Voreinstellungen, die Artikel erben:
 *    Nummernpräfix, Bestandsart, eigene Merkmalsfelder, Meldebestand, Kanal.
 *
 *  - **Artikel** — der Stammsatz einer Sache: "Xiaomi Pro 2" oder
 *    "Reifen 8,5 Zoll Tubeless". Führt Name, Merkmale, Bilder, Preis.
 *
 *  - **Einzelstück (Unit)** — ein konkretes, seriennummerngeführtes Gerät.
 *    Existiert nur bei Artikeln der Bestandsart SERIALISIERT. Trägt
 *    Prüfprotokoll, Reparaturen, eigene Bilder und die eigene Marge.
 *
 * Mengenartikel (Displays, Reifen, Schrauben) haben keine Einzelstücke. Ihr
 * Bestand ergibt sich ausschließlich aus den gebuchten Lagerbewegungen.
 */

/* ------------------------------------------------------------------ */
/* Bestandsart                                                         */
/* ------------------------------------------------------------------ */

/**
 * Wie wird der Bestand eines Artikels geführt?
 *
 * Diese eine Entscheidung bestimmt fast alles Weitere: ob es Einzelstücke
 * gibt, ob geprüft wird, ob es eine laufende Nummer je Stück gibt und wie
 * der Bestand berechnet wird.
 */
export const STOCK_MODES = ["SERIALISIERT", "MENGE"] as const
export type StockMode = (typeof STOCK_MODES)[number]

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Wo steht ein Einzelstück im internen Warenprozess? */
export const WORKFLOW_STATUSES = [
  "EINGEGANGEN",
  "IN_PRUEFUNG",
  "AUFBEREITUNG",
  "VERKAUFSBEREIT",
  "AUSGESCHLACHTET",
  "ARCHIVIERT",
] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

/** Ist das Einzelstück verkäuflich, vorgemerkt oder weg? */
export const SALE_STATUSES = ["VERFUEGBAR", "RESERVIERT", "VERKAUFT"] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

/** Zustand eines Inserats — pro Verkaufskanal getrennt geführt. */
export const LISTING_STATUSES = [
  "NICHT_VEROEFFENTLICHT",
  "VEROEFFENTLICHT",
  "SYNC_AUSSTEHEND",
  "FEHLER",
  "DEAKTIVIERT",
] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

/**
 * Kanäle, auf denen inseriert wird.
 *
 * `SHOPIFY` ist angebunden (im Prototyp simuliert). `EBAY` und
 * `KLEINANZEIGEN` werden vom Cockpit *vorbereitet*, aber nicht selbst
 * eingestellt: Das System erzeugt das fertige Inserat zum Übernehmen und
 * führt den Status intern mit. Siehe `CHANNEL_META`.
 */
export const CHANNELS = ["SHOPIFY", "EBAY", "KLEINANZEIGEN"] as const
export type Channel = (typeof CHANNELS)[number]

/** Über welchen Weg wurde tatsächlich verkauft? Mehr als nur die Inseratskanäle. */
export const SALE_CHANNELS = [
  "SHOPIFY",
  "EBAY",
  "KLEINANZEIGEN",
  "VOR_ORT",
  "TELEFON",
  "SONSTIGE",
] as const
export type SaleChannel = (typeof SALE_CHANNELS)[number]

/**
 * Woher kam der Kunde?
 *
 * Bewusst getrennt vom Verkaufskanal: Ein Kunde, der über Google auf die
 * Website kommt und dort im Shop kauft, ist Kanal SHOPIFY und Herkunft
 * GOOGLE — beides zusammen beantwortet erst, welche Werbung sich lohnt.
 */
export const CUSTOMER_SOURCES = [
  "UNBEKANNT",
  "WEBSITE",
  "GOOGLE",
  "EBAY",
  "KLEINANZEIGEN",
  "SOCIAL_MEDIA",
  "EMPFEHLUNG",
  "STAMMKUNDE",
  "LAUFKUNDSCHAFT",
  "SONSTIGE",
] as const
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number]

export const INSPECTION_RESULTS = [
  "NICHT_GEPRUEFT",
  "BESTANDEN",
  "PROBLEM",
] as const
export type InspectionResult = (typeof INSPECTION_RESULTS)[number]

export const REPAIR_STATUSES = ["OFFEN", "IN_ARBEIT", "ERLEDIGT"] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const CONDITIONS = [
  "NEU",
  "WIE_NEU",
  "SEHR_GUT",
  "GUT",
  "GEBRAUCHT",
  "DEFEKT",
] as const
export type Condition = (typeof CONDITIONS)[number]

/** Übertragungszustand Richtung Google Sheets. */
export const SYNC_STATUSES = [
  "NICHT_ERFORDERLICH",
  "WARTET",
  "SYNCHRONISIERT",
  "FEHLER",
] as const
export type SyncStatus = (typeof SYNC_STATUSES)[number]

/* ------------------------------------------------------------------ */
/* Kategorien                                                          */
/* ------------------------------------------------------------------ */

/**
 * Ein selbst definiertes Merkmalsfeld.
 *
 * Der Grund für diesen Umweg: "Wie viele 8,5-Zoll-Reifen von Xiaomi habe
 * ich?" ist nur beantwortbar, wenn Zollgröße ein *Feld* ist und nicht ein
 * Wort in der Beschreibung. Feste Spalten scheiden aus, weil jede Kategorie
 * andere Merkmale braucht — Reifen andere als Displays.
 */
export const ATTRIBUTE_TYPES = ["TEXT", "ZAHL", "AUSWAHL", "JA_NEIN"] as const
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number]

export interface AttributeDefinition {
  key: string
  label: string
  type: AttributeType
  /** Nur bei type === "AUSWAHL". */
  options: string[]
  /** Einheit hinter dem Wert, z. B. "Zoll", "Ah", "mm". */
  unit: string
  /** Ohne diese Angabe lässt sich der Artikel nicht speichern. */
  required: boolean
  /** Erscheint als eigener Filter in der Bestandsliste. */
  filterable: boolean
}

/**
 * Wie selbstständig veröffentlicht das System auf diesem Kanal?
 *
 * `VORSCHLAG` ist die Voreinstellung: Das Cockpit baut das Inserat vollständig
 * fertig und legt es in die Freigabeliste. Ein Klick stellt es ein. So bleibt
 * genau ein Knopf übrig, aber kein Blindflug.
 */
export const PUBLISH_MODES = ["AUTOMATISCH", "VORSCHLAG", "MANUELL"] as const
export type PublishMode = (typeof PUBLISH_MODES)[number]

/**
 * Ein Lagerbereich, den der Betrieb selbst anlegt.
 *
 * Kategorien bilden einen Baum. Was hier nicht gesetzt ist (`null`), erbt der
 * Zweig vom übergeordneten Bereich — siehe `resolveCategorySettings`.
 * Merkmalsfelder sind die Ausnahme: die sammeln sich über den Pfad an, statt
 * überschrieben zu werden.
 */
export interface Category {
  id: string
  parentId: string | null
  name: string
  /** Kurzform für Nummern und SKU, z. B. "SK", "ET-DISP". */
  numberPrefix: string
  /** Kurzbeschreibung für die Kategorieverwaltung. */
  description: string

  /** Nicht vererbbar: jede Kategorie führt entweder Einzelstücke oder Mengen. */
  stockMode: StockMode

  /** Eigene Merkmalsfelder dieser Ebene. Erben sich nach unten weiter. */
  attributes: AttributeDefinition[]

  /** Warnschwelle für Mengenartikel. `null` = keine Überwachung. */
  reorderLevel: number | null

  /** Auf welchem Kanal landen Artikel dieses Bereichs standardmäßig? */
  defaultChannel: Channel | null
  publishMode: PublishMode

  /** Muss ein Einzelstück ein Prüfprotokoll durchlaufen? */
  requiresInspection: boolean

  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** Zusammengeführte Einstellungen einer Kategorie inklusive Vererbung. */
export interface ResolvedCategorySettings {
  categoryId: string
  /** Von der Wurzel bis zur Kategorie selbst. */
  path: Category[]
  /** "Ersatzteile › Elektrik › Displays" */
  pathLabel: string
  numberPrefix: string
  stockMode: StockMode
  /** Merkmale aller Ebenen, Wurzel zuerst; gleiche Schlüssel gewinnen unten. */
  attributes: AttributeDefinition[]
  reorderLevel: number | null
  defaultChannel: Channel | null
  publishMode: PublishMode
  requiresInspection: boolean
}

/* ------------------------------------------------------------------ */
/* Lagerplätze                                                         */
/* ------------------------------------------------------------------ */

/**
 * Ein physischer Ort im Lager.
 *
 * Bewusst getrennt von der Artikelnummer: Wandert eine Kiste in ein anderes
 * Regal, ist das eine Umlagerungsbuchung — und keine neue Nummer.
 */
export interface StorageLocation {
  id: string
  /** Kurzcode, wie er am Regal steht: "A-03". */
  code: string
  name: string
  note: string
  sortOrder: number
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

export interface InspectionCheckDefinition {
  key: string
  label: string
  /** Ohne diesen Punkt darf kein Einzelstück verkaufsbereit werden. */
  critical: boolean
  group: "Mechanik" | "Elektrik" | "Fahrbetrieb" | "Dokumente"
}

export interface InspectionCheck {
  key: string
  result: InspectionResult
  note: string
}

export interface InspectionRecord {
  checks: InspectionCheck[]
  /** Gesetzt, sobald die Prüfung bewusst abgeschlossen wurde. */
  completedAt: string | null
  completedBy: string | null
  note: string
}

/* ------------------------------------------------------------------ */
/* Aufbereitung                                                        */
/* ------------------------------------------------------------------ */

export interface Repair {
  id: string
  /** Was war defekt? */
  problem: string
  /** Was wurde dagegen getan? */
  action: string
  sparePart: string
  /**
   * Aus dem eigenen Lager entnommenes Ersatzteil.
   *
   * Ist das gesetzt, bucht die Reparatur den Verbrauch als Lagerbewegung ab
   * und übernimmt den Einstandswert als Teilekosten. Genau das schließt den
   * Kreis zwischen Ausschlachtung und Aufbereitung: ein Display aus einem
   * Spendergerät verschwindet nicht still, sondern verlässt den Bestand
   * nachvollziehbar.
   */
  partArticleId: string | null
  partQuantity: number
  partCostCents: number
  laborMinutes: number
  status: RepairStatus
  createdAt: string
}

export interface Cleaning {
  done: boolean
  doneAt: string | null
  note: string
}

/* ------------------------------------------------------------------ */
/* Dokumente & Bilder                                                  */
/* ------------------------------------------------------------------ */

export interface UnitDocuments {
  abe: boolean
  invoice: boolean
  other: boolean
  note: string
}

export interface StockImage {
  id: string
  /**
   * Im Prototyp eine Data-URL oder ein Pfad auf ein Demo-Bild.
   * Später die öffentliche URL aus Supabase Storage — der Rest der
   * Anwendung kennt nur dieses Feld und bleibt unverändert.
   */
  url: string
  name: string
  isPrimary: boolean
  sortOrder: number
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Inserate                                                            */
/* ------------------------------------------------------------------ */

export interface Listing {
  channel: Channel
  status: ListingStatus
  /** Externe IDs des Kanals — bei Shopify Product/Variant/InventoryItem. */
  externalIds: Record<string, string>
  externalUrl: string | null
  priceCents: number | null
  inventory: number
  lastSyncedAt: string | null
  /** Bei status === "FEHLER" gefüllt. Fehler werden nie still verschluckt. */
  lastError: string | null
  retryCount: number
}

/* ------------------------------------------------------------------ */
/* Artikel                                                             */
/* ------------------------------------------------------------------ */

export interface Article {
  id: string
  /** Sichtbare Artikelnummer, z. B. "ET-REI-0031". Dient zugleich als SKU. */
  sku: string
  categoryId: string

  name: string
  manufacturer: string
  /** Hersteller-Teilenummer. Bester Dublettenschlüssel beim Import. */
  mpn: string
  /** Barcode / EAN, soweit vorhanden. */
  ean: string

  /**
   * Aus der Kategorie geerbt und beim Anlegen festgeschrieben.
   *
   * Festgeschrieben, weil ein nachträglicher Wechsel den gesamten Bestand
   * dieses Artikels bedeutungslos machen würde: aus 40 Bremsbelägen würden
   * 40 einzeln zu prüfende Geräte.
   */
  stockMode: StockMode

  description: string
  /** Werte zu den Merkmalsfeldern der Kategorie, Schlüssel = attribute.key. */
  attributes: Record<string, string>

  condition: Condition
  /** Null, solange kein Verkaufspreis kalkuliert wurde. */
  salePriceCents: number | null

  /** Übersteuert den Meldebestand der Kategorie. Nur bei MENGE wirksam. */
  reorderLevel: number | null
  /** Übersteuert den Kanal der Kategorie. */
  channelOverride: Channel | null
  publishModeOverride: PublishMode | null

  images: StockImage[]
  /** Nur bei MENGE: der Bestand liegt am Artikel, nicht am Einzelstück. */
  listings: Listing[]

  notes: string
  /** Aus dem Verkehr genommen, ohne die Historie zu verlieren. */
  archivedAt: string | null

  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Einzelstücke                                                        */
/* ------------------------------------------------------------------ */

/**
 * Ein konkretes, einzeln geführtes Gerät.
 *
 * Existiert nur zu Artikeln mit `stockMode === "SERIALISIERT"`. Alles, was
 * gerätespezifisch ist — Laufleistung, Prüfprotokoll, Reparaturen, Bilder,
 * Preis, Marge — hängt hier und nicht am Artikel.
 */
export interface ArticleUnit {
  id: string
  articleId: string
  /** Sichtbare Nummer, z. B. "SK-2026-0042". */
  unitNumber: string
  serialNumber: string

  variant: string
  color: string
  mileageKm: number
  condition: Condition
  description: string
  /** Gerätespezifische Merkmalswerte; überlagern die des Artikels. */
  attributes: Record<string, string>

  purchasePriceCents: number
  additionalCostsCents: number
  salePriceCents: number | null

  purchaseDate: string
  arrivalDate: string

  locationId: string | null
  notes: string

  workflowStatus: WorkflowStatus
  saleStatus: SaleStatus

  documents: UnitDocuments
  inspection: InspectionRecord
  cleaning: Cleaning
  repairs: Repair[]
  images: StockImage[]
  listings: Listing[]

  /** Gesetzt, wenn dieses Gerät durch eine Ausschlachtung zerlegt wurde. */
  teardownId: string | null
  /** Herkunft des Datensatzes, falls über einen Import entstanden. */
  importBatchId: string | null

  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Lagerbewegungen                                                     */
/* ------------------------------------------------------------------ */

/**
 * Warum hat sich der Bestand geändert?
 *
 * Der Bestand ist kein Feld, sondern die Summe dieser Buchungen. Ein von Hand
 * überschreibbarer Zähler läuft in der Praxis auseinander — und dann ist die
 * Übersicht wieder genauso wertlos wie eine Excel-Liste.
 */
export const MOVEMENT_TYPES = [
  "ZUGANG",
  "AUSSCHLACHTUNG",
  "VERKAUF",
  "VERBRAUCH",
  "KORREKTUR",
  "UMLAGERUNG",
  "VERLUST",
] as const
export type MovementType = (typeof MOVEMENT_TYPES)[number]

export interface StockMovement {
  id: string
  at: string
  actor: string

  articleId: string
  /** Gesetzt, wenn die Buchung ein konkretes Einzelstück betrifft. */
  unitId: string | null

  /** Vorzeichenbehaftet: positiv = Zugang, negativ = Abgang. */
  quantity: number
  type: MovementType

  /** Einstandswert je Stück. Nur bei Zugängen gesetzt. */
  unitCostCents: number | null

  locationId: string | null
  /** Nur bei UMLAGERUNG: Ziel der Bewegung. */
  toLocationId: string | null

  /** Verweis auf den auslösenden Vorgang: Ausschlachtung, Verkauf, Reparatur. */
  referenceId: string | null
  note: string
}

/** Berechneter Bestand eines Artikels. */
export interface StockLevel {
  articleId: string
  /** Gesamtmenge über alle Lagerplätze. */
  quantity: number
  /** Menge je Lagerplatz; Schlüssel "" steht für "ohne Platz". */
  byLocation: Record<string, number>
  /** Gleitender Durchschnitts-Einstandspreis je Stück. */
  averageCostCents: number
  /** quantity × averageCostCents. */
  valueCents: number
  /** Wirksamer Meldebestand aus Artikel bzw. Kategorie. */
  reorderLevel: number | null
  belowReorderLevel: boolean
  /**
   * Die Buchungen ergeben rechnerisch einen negativen Bestand.
   *
   * Angezeigt wird dann null, aber der Widerspruch bleibt sichtbar: Irgendwo
   * fehlt ein Zugang oder es wurde doppelt abgebucht.
   */
  inconsistent: boolean
}

/* ------------------------------------------------------------------ */
/* Ausschlachtung                                                      */
/* ------------------------------------------------------------------ */

/** Wie wird der Restwert des Spenders auf die entnommenen Teile verteilt? */
export const TEARDOWN_DISTRIBUTIONS = ["GLEICH", "NACH_WERT", "MANUELL"] as const
export type TeardownDistribution = (typeof TEARDOWN_DISTRIBUTIONS)[number]

export interface TeardownLine {
  id: string
  /** Zielartikel, auf den die Teile gebucht werden. */
  articleId: string
  quantity: number
  /**
   * Geschätzter Marktwert je Stück. Grundlage der Verteilung `NACH_WERT` und
   * ausdrücklich keine Preiszusage — er dient nur der Gewichtung.
   */
  marketValueCents: number | null
  /** Ergebnis der Verteilung: Einstandswert je Stück. */
  valueShareCents: number
  locationId: string | null
  note: string
}

/**
 * Das Zerlegen eines Spendergeräts in Ersatzteile.
 *
 * Der wichtigste neue Vorgang: Ohne ihn verschwindet ein ausgeschlachteter
 * Scooter still aus dem Bestand und die Teile tauchen ohne Einstandswert
 * auf — jede spätere Marge wäre dann erfunden.
 */
export interface Teardown {
  id: string
  at: string
  actor: string

  sourceUnitId: string
  sourceArticleId: string
  /** Kopien, damit der Vorgang auch nach Archivierung lesbar bleibt. */
  sourceLabel: string
  sourceNumber: string

  /** Einkauf + Zusatzkosten des Spenders — der zu verteilende Betrag. */
  sourceValueCents: number
  distribution: TeardownDistribution
  lines: TeardownLine[]

  /**
   * Nicht zugeordneter Rest (Schrott, Rundungsdifferenz). Wird bewusst
   * ausgewiesen statt stillschweigend auf die Teile verteilt.
   */
  scrapValueCents: number

  status: "ENTWURF" | "GEBUCHT"
  note: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Freigabeliste                                                       */
/* ------------------------------------------------------------------ */

export const PROPOSAL_STATUSES = [
  "OFFEN",
  "FREIGEGEBEN",
  "ABGELEHNT",
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

/**
 * Ein fertig vorbereitetes Inserat, das nur noch freigegeben werden muss.
 *
 * Das System erzeugt diese Vorschläge selbst, sobald ein Artikel oder
 * Einzelstück alle Voraussetzungen erfüllt. Der Bediener sieht Titel, Text,
 * Preis und Bilder auf einen Blick und entscheidet — einzeln oder als Stapel.
 */
export interface PublicationProposal {
  id: string
  createdAt: string

  /** Mengenartikel werden als Artikel inseriert, Geräte als Einzelstück. */
  targetType: "ARTICLE" | "UNIT"
  targetId: string
  articleId: string
  channel: Channel

  /** Der vorbereitete Inseratsinhalt. */
  title: string
  description: string
  priceCents: number
  quantity: number
  imageUrls: string[]
  /** Merkmale als Zeilen "Label: Wert" — für eBay-Artikelmerkmale. */
  attributeLines: string[]

  status: ProposalStatus
  decidedAt: string | null
  decidedBy: string | null
  note: string
}

/* ------------------------------------------------------------------ */
/* Verkauf                                                             */
/* ------------------------------------------------------------------ */

export interface Sale {
  id: string
  articleId: string
  /** Null bei Mengenartikeln — dort wird kein Einzelstück verkauft. */
  unitId: string | null
  /** Kopien, damit die Verkaufsliste auch nach Archivierung lesbar bleibt. */
  itemNumber: string
  itemLabel: string
  serialNumber: string
  categoryLabel: string

  quantity: number
  channel: SaleChannel
  /** Wie der Kunde auf SKOPE aufmerksam wurde. */
  customerSource: CustomerSource
  /** Ort oder PLZ des Käufers. Freiwillig — leer heißt „nicht erfasst". */
  customerRegion: string
  /** Standort, an dem übergeben wurde (Lager, Versand, Filiale). */
  saleLocation: string

  salePriceCents: number
  purchasePriceCents: number
  repairCostsCents: number
  additionalCostsCents: number

  soldAt: string
  note: string

  /** Reporting-Sync Richtung Google Sheets. */
  sheetsSyncStatus: SyncStatus
  sheetsSyncedAt: string | null
  sheetsError: string | null
  /**
   * Bereits belegte Zeile in der Umsatztabelle. Wird mitgespeichert, damit ein
   * Wiederholungsversuch nach einem Neuladen dieselbe Zeile aktualisiert und
   * keine zweite anlegt.
   */
  sheetsRowNumber: number | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Audit Log                                                           */
/* ------------------------------------------------------------------ */

export const AUDIT_CATEGORIES = [
  "ARTIKEL",
  "BESTAND",
  "AUSSCHLACHTUNG",
  "PRUEFUNG",
  "AUFBEREITUNG",
  "BILDER",
  "KANAL",
  "VERKAUF",
  "SYNC",
  "IMPORT",
  "KATEGORIE",
  "SYSTEM",
] as const
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]

export interface AuditEvent {
  id: string
  at: string
  actor: string
  category: AuditCategory
  action: string
  detail: string
  articleId: string | null
  unitId: string | null
  /** Sichtbare Nummer des betroffenen Objekts. */
  itemNumber: string | null
  /** Markiert Ereignisse, die einen Fehlerzustand beschreiben. */
  level: "info" | "success" | "warning" | "error"
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportBatch {
  id: string
  fileName: string
  source: "DEMO" | "DATEI"
  /** In welche Kategorie wurde importiert? */
  categoryId: string
  categoryLabel: string
  stockMode: StockMode
  rowsTotal: number
  rowsImported: number
  rowsSkipped: number
  /** Warum eine Zeile nicht importiert wurde — Fehler bleiben sichtbar. */
  issues: ImportIssue[]
  createdAt: string
  createdBy: string
}

export interface ImportIssue {
  row: number
  reference: string
  reason: string
  severity: "warning" | "error"
}

/**
 * Zielfelder des Imports.
 *
 * Neben diesen festen Feldern kann jede Spalte zusätzlich auf ein
 * Merkmalsfeld der gewählten Kategorie gemappt werden — dafür trägt
 * `ColumnMapping.target` den Präfix `attr:`.
 */
export const IMPORT_TARGET_FIELDS = [
  "name",
  "manufacturer",
  "mpn",
  "ean",
  "serialNumber",
  "variant",
  "color",
  "quantity",
  "purchasePriceCents",
  "salePriceCents",
  "mileageKm",
  "condition",
  "purchaseDate",
  "location",
  "notes",
] as const
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number]

export interface ColumnMapping {
  /** Zielfeld im SKOPE-Modell oder `attr:<key>` für ein Merkmalsfeld. */
  target: string
  /** Spaltenname der Quelldatei. Leer = nicht zugeordnet. */
  source: string
}

/** Gespeichertes Mapping, je Kategorie getrennt. */
export interface SavedMapping {
  categoryId: string
  columns: ColumnMapping[]
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Integrationen                                                       */
/* ------------------------------------------------------------------ */

export interface IntegrationState {
  /** Für die Demo: erzwingt einen Fehlschlag beim nächsten Shopify-Aufruf. */
  simulateShopifyError: boolean
  simulateSheetsError: boolean
  sheetsLastSyncAt: string | null
  shopifyLastSyncAt: string | null
}

export interface CurrentUser {
  name: string
  role: "admin" | "employee"
  initials: string
}

/* ------------------------------------------------------------------ */
/* Zusammengesetzte Sichten                                            */
/* ------------------------------------------------------------------ */

/**
 * Artikel mit allem, was die Oberfläche zum Anzeigen braucht.
 *
 * Wird in der Datenschicht zusammengesetzt, damit Komponenten nicht selbst
 * Bestände summieren oder Kategoriepfade auflösen — sonst tut es jede
 * Ansicht anders.
 */
export interface ArticleView {
  article: Article
  settings: ResolvedCategorySettings
  stock: StockLevel
  /** Nur bei SERIALISIERT gefüllt. */
  units: ArticleUnit[]
  /** Einzelstücke, die noch im Bestand sind. */
  unitsInStock: ArticleUnit[]
}
