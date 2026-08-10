/**
 * SKOPE Domain-Modell.
 *
 * Diese Typen bilden den fachlichen Kern ab und sind bewusst frei von
 * UI-, Storage- und Integrationsdetails. Beim Wechsel von der Demo-Persistenz
 * auf Supabase ändert sich dieses Modul idealerweise gar nicht.
 *
 * Geldbeträge werden durchgängig als ganze Cent gespeichert (nie als Float),
 * damit Margen nicht durch Rundungsfehler auseinanderlaufen.
 */

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Wo steht der Scooter im internen Warenprozess? */
export const WORKFLOW_STATUSES = [
  "EINGEGANGEN",
  "IN_PRUEFUNG",
  "AUFBEREITUNG",
  "VERKAUFSBEREIT",
  "ARCHIVIERT",
] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

/** Ist der Scooter verkäuflich, vorgemerkt oder weg? */
export const SALE_STATUSES = ["VERFUEGBAR", "RESERVIERT", "VERKAUFT"] as const
export type SaleStatus = (typeof SALE_STATUSES)[number]

/** Zustand eines Listings — pro Verkaufskanal getrennt geführt. */
export const LISTING_STATUSES = [
  "NICHT_VEROEFFENTLICHT",
  "VEROEFFENTLICHT",
  "SYNC_AUSSTEHEND",
  "FEHLER",
  "DEAKTIVIERT",
] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

/** Kanäle, auf denen inseriert wird. */
export const CHANNELS = ["SHOPIFY", "KLEINANZEIGEN"] as const
export type Channel = (typeof CHANNELS)[number]

/** Über welchen Weg wurde tatsächlich verkauft? Mehr als nur die Listing-Kanäle. */
export const SALE_CHANNELS = [
  "SHOPIFY",
  "KLEINANZEIGEN",
  "VOR_ORT",
  "TELEFON",
  "SONSTIGE",
] as const
export type SaleChannel = (typeof SALE_CHANNELS)[number]

export const INSPECTION_RESULTS = [
  "NICHT_GEPRUEFT",
  "BESTANDEN",
  "PROBLEM",
] as const
export type InspectionResult = (typeof INSPECTION_RESULTS)[number]

export const REPAIR_STATUSES = ["OFFEN", "IN_ARBEIT", "ERLEDIGT"] as const
export type RepairStatus = (typeof REPAIR_STATUSES)[number]

export const CONDITIONS = [
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
/* Prüfung                                                             */
/* ------------------------------------------------------------------ */

/**
 * Prüfpunkte liegen als Liste vor, nicht als feste Spalten. Ein neuer
 * Prüfpunkt ist damit später eine Konfigurationsänderung und keine Migration.
 */
export interface InspectionCheckDefinition {
  key: string
  label: string
  /** Ohne diesen Punkt darf kein Scooter verkaufsbereit werden. */
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

export interface ScooterDocuments {
  abe: boolean
  invoice: boolean
  other: boolean
  note: string
}

export interface ScooterImage {
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
/* Listings                                                            */
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
/* Scooter                                                             */
/* ------------------------------------------------------------------ */

export interface TechnicalSpec {
  key: string
  value: string
}

export interface Scooter {
  /** Technischer Schlüssel. Nicht identisch mit der sichtbaren Nummer. */
  id: string
  /** Sichtbare Nummer, z. B. SK-2026-0042. Dient zugleich als SKU. */
  scooterNumber: string
  serialNumber: string

  manufacturer: string
  model: string
  variant: string
  color: string
  mileageKm: number
  condition: Condition
  description: string
  technicalData: TechnicalSpec[]

  purchasePriceCents: number
  additionalCostsCents: number
  /** Null, solange kein Verkaufspreis kalkuliert wurde. */
  salePriceCents: number | null

  purchaseDate: string
  arrivalDate: string

  location: string
  notes: string

  workflowStatus: WorkflowStatus
  saleStatus: SaleStatus

  documents: ScooterDocuments
  inspection: InspectionRecord
  cleaning: Cleaning
  repairs: Repair[]
  images: ScooterImage[]
  listings: Listing[]

  /** Herkunft des Datensatzes, falls über einen Import entstanden. */
  importBatchId: string | null

  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Verkauf                                                             */
/* ------------------------------------------------------------------ */

export interface Sale {
  id: string
  scooterId: string
  scooterNumber: string
  /** Kopie, damit die Verkaufsliste auch nach Archivierung lesbar bleibt. */
  modelLabel: string
  serialNumber: string
  channel: SaleChannel
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
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Audit Log                                                           */
/* ------------------------------------------------------------------ */

export const AUDIT_CATEGORIES = [
  "SCOOTER",
  "PRUEFUNG",
  "AUFBEREITUNG",
  "BILDER",
  "KANAL",
  "VERKAUF",
  "SYNC",
  "IMPORT",
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
  scooterId: string | null
  scooterNumber: string | null
  /** Markiert Ereignisse, die einen Fehlerzustand beschreiben. */
  level: "info" | "success" | "warning" | "error"
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

export interface ImportBatch {
  id: string
  fileName: string
  source: "AVIDES_DEMO" | "DATEI"
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
  serialNumber: string
  reason: string
  severity: "warning" | "error"
}

/** Gespeichertes Spalten-Mapping, damit der nächste Import schneller geht. */
export interface ColumnMapping {
  /** Zielfeld im SKOPE-Modell. */
  target: ImportTargetField
  /** Spaltenname der Quelldatei. Leer = nicht zugeordnet. */
  source: string
}

export const IMPORT_TARGET_FIELDS = [
  "serialNumber",
  "manufacturer",
  "model",
  "variant",
  "color",
  "purchasePriceCents",
  "salePriceCents",
  "mileageKm",
  "condition",
  "purchaseDate",
  "notes",
] as const
export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number]

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
