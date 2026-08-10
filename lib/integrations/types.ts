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

import type { Sale, Scooter } from "@/lib/domain/types"

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

/** Was ein Kanal nach erfolgreicher Veröffentlichung zurückmeldet. */
export interface PublishResult {
  externalIds: Record<string, string>
  externalUrl: string | null
  publishedAt: string
}

export interface MarketplaceAdapter {
  readonly channel: "SHOPIFY" | "KLEINANZEIGEN"
  readonly displayName: string
  /** false = der Kanal wird manuell gepflegt (aktuell Kleinanzeigen). */
  readonly supportsApi: boolean
  /** Kennzeichnet Demo-Implementierungen in der Oberfläche. */
  readonly isMock: boolean

  publishProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>>
  updateProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>>
  /** Bestand auf 0 setzen, Angebot aber nicht löschen. */
  setUnavailable(scooter: Scooter): Promise<AdapterResult<void>>
  deleteListing(scooter: Scooter): Promise<AdapterResult<void>>
  getListingStatus(
    scooter: Scooter
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
