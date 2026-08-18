/**
 * Verträge zu den externen Systemen.
 *
 * Der Rest der Anwendung kennt ausschließlich diese Interfaces — nie einen
 * konkreten Anbieter. Der Austausch von Mock gegen echte API ist damit ein
 * Wechsel der Implementierung, kein Umbau der Anwendung.
 *
 * Zwei Festlegungen, die für die spätere Produktion wichtig sind:
 *
 * 1. Jede Methode liefert ein `AdapterResult` statt zu werfen. Ein
 *    fehlgeschlagener externer Aufruf ist ein erwarteter Zustand, kein
 *    Ausnahmefall — und darf niemals als Erfolg dargestellt werden.
 * 2. Alle Operationen sind über `idempotencyKey` bzw. vorhandene externe IDs
 *    idempotent gedacht. Ein doppelter Klick darf kein zweites Produkt anlegen.
 */

import type { Sale } from "@/lib/domain/types"

export type AdapterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AdapterError }

export interface AdapterError {
  /** Maschinenlesbar, für Retry-Entscheidungen. */
  code:
    | "NETWORK"
    | "AUTH"
    | "RATE_LIMIT"
    | "VALIDATION"
    | "CONFLICT"
    | "UNKNOWN"
  message: string
  /** Darf ein automatischer Wiederholungsversuch erfolgen? */
  retryable: boolean
}

export function ok<T>(data: T): AdapterResult<T> {
  return { ok: true, data }
}

export function fail<T>(
  code: AdapterError["code"],
  message: string,
  retryable = true
): AdapterResult<T> {
  return { ok: false, error: { code, message, retryable } }
}

/* ------------------------------------------------------------------ */
/* Marketplace                                                         */
/* ------------------------------------------------------------------ */

/**
 * Was ein Kanal braucht, um ein Angebot einzustellen.
 *
 * Bewusst ein eigener, flacher Typ statt `Article` oder `ArticleUnit`: Ein
 * Kanal interessiert sich nicht dafür, ob dahinter ein Gerät mit
 * Prüfprotokoll oder eine Kiste Bremsbeläge steht. Diese Trennung ist der
 * Grund, warum derselbe Adapter beide Bestandsarten bedienen kann.
 */
export interface ListingPayload {
  /** Artikelnummer bzw. Gerätenummer — dient dem Kanal als SKU. */
  sku: string
  title: string
  description: string
  priceCents: number
  quantity: number
  imageUrls: string[]
  /** Merkmale als Zeilen "Label: Wert" — für Artikelmerkmale im Kanal. */
  attributeLines: string[]
  /** Bereits bekannte IDs aus früheren Veröffentlichungen. */
  externalIds: Record<string, string>
}

/** Was ein Kanal nach erfolgreicher Veröffentlichung zurückmeldet. */
export interface PublishResult {
  externalIds: Record<string, string>
  externalUrl: string | null
  publishedAt: string
}

export interface MarketplaceAdapter {
  readonly channel: "SHOPIFY" | "EBAY" | "KLEINANZEIGEN"
  readonly displayName: string
  /**
   * false = der Kanal wird manuell gepflegt.
   *
   * Für eBay und Kleinanzeigen ist das kein Zwischenstand, sondern die
   * bewusste Festlegung: Ohne bestätigten Entwicklerzugang wäre jede
   * Automatik eine Zusage, die das System nicht halten kann. Der Adapter
   * liefert stattdessen das fertige Inserat zum Übernehmen.
   */
  readonly supportsApi: boolean
  /** Kennzeichnet Demo-Implementierungen in der Oberfläche. */
  readonly isMock: boolean

  publishProduct(payload: ListingPayload): Promise<AdapterResult<PublishResult>>
  updateProduct(payload: ListingPayload): Promise<AdapterResult<PublishResult>>
  /** Bestand auf 0 setzen, Angebot aber nicht löschen. */
  setUnavailable(payload: ListingPayload): Promise<AdapterResult<void>>
  deleteListing(payload: ListingPayload): Promise<AdapterResult<void>>
  getListingStatus(
    payload: ListingPayload
  ): Promise<AdapterResult<{ available: boolean; inventory: number }>>
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

export interface SheetsAdapter {
  readonly displayName: string
  readonly isMock: boolean
  /**
   * Schreibt eine Verkaufszeile. Über `sale.id` idempotent — ein zweiter
   * Aufruf mit derselben ID darf keine zweite Zeile erzeugen.
   */
  appendSale(sale: Sale): Promise<AdapterResult<{ rowNumber: number }>>
}

/* ------------------------------------------------------------------ */
/* Import                                                              */
/* ------------------------------------------------------------------ */

/** Eine eingelesene Datei, bevor irgendein Mapping stattgefunden hat. */
export interface ParsedTable {
  fileName: string
  headers: string[]
  rows: Record<string, string>[]
}

export interface ImportSource {
  readonly displayName: string
  readonly isMock: boolean
  /** Liefert Beispieldaten, solange keine echte Datei vorliegt. */
  loadDemoTable(): Promise<ParsedTable>
}
