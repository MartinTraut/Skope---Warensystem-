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
  Channel,
  ColumnMapping,
  ImportBatch,
  InspectionResult,
  IntegrationState,
  Repair,
  Sale,
  CustomerSource,
  SaleChannel,
  Scooter,
  ScooterImage,
  WorkflowStatus,
} from "@/lib/domain/types"
import type { NewScooterInput } from "@/lib/domain/scooter-factory"
import type { ParsedTable } from "@/lib/integrations/types"

/** Einheitliches Ergebnis schreibender Operationen. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; message: string; /** Fachlicher Konflikt statt technischem Fehler. */ conflict?: boolean }

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data }
}

export function actionFail<T = void>(
  message: string,
  conflict = false
): ActionResult<T> {
  return { ok: false, message, conflict }
}

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

export interface ScooterRepository {
  getAll(): Promise<Scooter[]>
  getById(id: string): Promise<Scooter | undefined>
  getByNumber(scooterNumber: string): Promise<Scooter | undefined>

  create(input: NewScooterInput): Promise<ActionResult<Scooter>>
  update(id: string, patch: Partial<Scooter>): Promise<ActionResult<Scooter>>

  updateWorkflowStatus(
    id: string,
    status: WorkflowStatus
  ): Promise<ActionResult<Scooter>>
  updateSaleStatus(
    id: string,
    status: "VERFUEGBAR" | "RESERVIERT"
  ): Promise<ActionResult<Scooter>>

  /** Zentraler Verkaufsvorgang. Deaktiviert anschließend alle Kanäle. */
  markAsSold(
    id: string,
    input: MarkAsSoldInput
  ): Promise<ActionResult<Sale>>

  /* Prüfung */
  setInspectionCheck(
    id: string,
    checkKey: string,
    result: InspectionResult,
    note?: string
  ): Promise<ActionResult<Scooter>>
  setInspectionNote(id: string, note: string): Promise<ActionResult<Scooter>>
  completeInspection(id: string): Promise<ActionResult<Scooter>>
  reopenInspection(id: string): Promise<ActionResult<Scooter>>

  /* Aufbereitung */
  setCleaning(id: string, done: boolean, note?: string): Promise<ActionResult<Scooter>>
  addRepair(
    id: string,
    repair: Omit<Repair, "id" | "createdAt">
  ): Promise<ActionResult<Scooter>>
  updateRepair(
    id: string,
    repairId: string,
    patch: Partial<Repair>
  ): Promise<ActionResult<Scooter>>
  removeRepair(id: string, repairId: string): Promise<ActionResult<Scooter>>

  /* Bilder */
  addImages(
    id: string,
    images: Omit<ScooterImage, "id" | "createdAt" | "sortOrder" | "isPrimary">[]
  ): Promise<ActionResult<Scooter>>
  removeImage(id: string, imageId: string): Promise<ActionResult<Scooter>>
  setPrimaryImage(id: string, imageId: string): Promise<ActionResult<Scooter>>
  reorderImages(id: string, imageIds: string[]): Promise<ActionResult<Scooter>>
}

export interface ChannelRepository {
  /** Legt an oder aktualisiert — über die gespeicherten IDs idempotent. */
  publish(scooterId: string, channel: Channel): Promise<ActionResult<Scooter>>
  update(scooterId: string, channel: Channel): Promise<ActionResult<Scooter>>
  deactivate(scooterId: string, channel: Channel): Promise<ActionResult<Scooter>>
  /** Nach einem Fehlversuch erneut ausführen. */
  retry(scooterId: string, channel: Channel): Promise<ActionResult<Scooter>>
}

export interface SalesRepository {
  getAll(): Promise<Sale[]>
  /** Reporting-Sync erneut anstoßen. */
  retrySheetsSync(saleId: string): Promise<ActionResult<Sale>>
}

export interface ImportRepository {
  /**
   * Legt aus zugeordneten Zeilen neue Scooter an.
   * Dubletten (gleiche Seriennummer) werden übersprungen, nie überschrieben.
   */
  importRows(input: {
    fileName: string
    source: ImportBatch["source"]
    rows: NewScooterInput[]
  }): Promise<ActionResult<ImportBatch>>

  /** Bestätigte Spaltenzuordnung sichern, damit Folge-Importe schneller gehen. */
  saveMapping(mapping: ColumnMapping[]): Promise<ActionResult>

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
  importSnapshot(json: string): Promise<ActionResult<{ scooters: number; sales: number }>>
}

export interface DemoRepositoryExtras {
  /** Simuliert eine eingehende Shopify-Bestellung inklusive Folgeprozess. */
  simulateShopifyOrder(scooterId: string): Promise<ActionResult<Sale>>
  resetDemoData(): Promise<ActionResult>
}

export interface Repositories {
  scooters: ScooterRepository
  channels: ChannelRepository
  sales: SalesRepository
  imports: ImportRepository
  settings: SettingsRepository
  demo: DemoRepositoryExtras
}
