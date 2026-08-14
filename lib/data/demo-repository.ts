/**
 * Demo-Implementierung der Datenschicht.
 *
 * Hier liegen die fachlichen Abläufe: veröffentlichen, verkaufen,
 * synchronisieren, importieren. Sie sind bewusst so geschrieben, dass sie beim
 * Wechsel auf Supabase nahezu unverändert bleiben — getauscht werden nur die
 * Lese-/Schreibaufrufe (heute Zustand-Store, später Datenbank) und die
 * Adapter (heute Mock, später echte APIs).
 *
 * Zwei Prinzipien ziehen sich durch:
 *  - Ein fehlgeschlagener externer Aufruf setzt niemals einen Erfolgsstatus.
 *  - Der Verkauf prüft vorher, ob der Scooter überhaupt noch verfügbar ist.
 *    Genau das verhindert den Doppelverkauf über zwei Kanäle.
 */

import {
  canTransition,
  evaluateReadiness,
  isReadyForSale,
  modelLabel,
  WORKFLOW_META,
} from "@/lib/domain/status"
import { repairCostsCents } from "@/lib/domain/metrics"
import {
  createId,
  createScooter,
  findBySerial,
  nextScooterNumber,
} from "@/lib/domain/scooter-factory"
import type { NewScooterInput } from "@/lib/domain/scooter-factory"
import type {
  AuditCategory,
  AuditEvent,
  Channel,
  ColumnMapping,
  ImportBatch,
  ImportIssue,
  InspectionResult,
  IntegrationState,
  Listing,
  Repair,
  Sale,
  Scooter,
  ScooterImage,
  WorkflowStatus,
} from "@/lib/domain/types"
import {
  ManualKleinanzeigenAdapter,
  MockAvidesImportSource,
  MockGoogleSheetsAdapter,
  MockShopifyAdapter,
} from "@/lib/integrations/mock-adapters"
import type { MarketplaceAdapter } from "@/lib/integrations/types"
import { dataUrlBytes } from "@/lib/images/optimize"
import { getCockpitState, SNAPSHOT_VERSION } from "@/lib/store/cockpit-store"
import {
  actionFail,
  actionOk,
  type ActionResult,
  type ChannelRepository,
  type DemoRepositoryExtras,
  type ImportRepository,
  type MarkAsSoldInput,
  type Repositories,
  type SalesRepository,
  type ScooterRepository,
  type SettingsRepository,
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
  return state.scooters.reduce(
    (sum, scooter) =>
      sum +
      scooter.images.reduce((inner, image) => inner + dataUrlBytes(image.url), 0),
    0
  )
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1000)} KB`
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
const kleinanzeigenAdapter = new ManualKleinanzeigenAdapter()
const sheetsAdapter = new MockGoogleSheetsAdapter(mockControls)

const ADAPTERS: Record<Channel, MarketplaceAdapter> = {
  SHOPIFY: shopifyAdapter,
  KLEINANZEIGEN: kleinanzeigenAdapter,
}

export function getMarketplaceAdapter(channel: Channel): MarketplaceAdapter {
  return ADAPTERS[channel]
}

export const integrationAdapters = {
  shopify: shopifyAdapter,
  kleinanzeigen: kleinanzeigenAdapter,
  sheets: sheetsAdapter,
}

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

function store() {
  return getCockpitState()
}

function requireScooter(id: string): Scooter | undefined {
  return store().scooters.find((scooter) => scooter.id === id)
}

interface LogInput {
  category: AuditCategory
  action: string
  detail: string
  scooter?: Scooter | null
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
    scooterId: input.scooter?.id ?? null,
    scooterNumber: input.scooter?.scooterNumber ?? null,
    level: input.level ?? "info",
  }
  store().addActivity([event])
  return event
}

/** Kürzel für "Scooter ändern und danach frisch zurückgeben". */
function mutate(
  id: string,
  updater: (scooter: Scooter) => Scooter
): ActionResult<Scooter> {
  const existing = requireScooter(id)
  if (!existing) return actionFail("Scooter nicht gefunden.")
  store().updateScooter(id, updater)
  const updated = requireScooter(id)
  return updated ? actionOk(updated) : actionFail("Aktualisierung fehlgeschlagen.")
}

function withListing(
  scooter: Scooter,
  channel: Channel,
  patch: Partial<Listing>
): Scooter {
  return {
    ...scooter,
    listings: scooter.listings.map((listing) =>
      listing.channel === channel ? { ...listing, ...patch } : listing
    ),
  }
}

/* ------------------------------------------------------------------ */
/* Scooter                                                             */
/* ------------------------------------------------------------------ */

class DemoScooterRepository implements ScooterRepository {
  async getAll() {
    return store().scooters
  }

  async getById(id: string) {
    return requireScooter(id)
  }

  async getByNumber(scooterNumber: string) {
    return store().scooters.find((s) => s.scooterNumber === scooterNumber)
  }

  async create(input: NewScooterInput): Promise<ActionResult<Scooter>> {
    const state = store()

    if (input.serialNumber) {
      const duplicate = findBySerial(state.scooters, input.serialNumber)
      if (duplicate) {
        return actionFail(
          `Seriennummer ist bereits als ${duplicate.scooterNumber} erfasst.`,
          true
        )
      }
    }

    const number = nextScooterNumber(state.scooters.map((s) => s.scooterNumber))
    const scooter = createScooter(input, number)
    state.upsertScooters([scooter])

    log({
      category: "SCOOTER",
      action: "Scooter erstellt",
      detail: `${modelLabel(scooter) || "Neuer Scooter"} im Wareneingang erfasst.`,
      scooter,
      level: "success",
    })

    return actionOk(scooter)
  }

  async update(id: string, patch: Partial<Scooter>) {
    const before = requireScooter(id)
    if (!before) return actionFail<Scooter>("Scooter nicht gefunden.")

    // Dieselbe Dublettenprüfung wie beim Anlegen: Sonst ließe sich eine
    // bereits vergebene Seriennummer über den Bearbeiten-Dialog ein zweites
    // Mal ins System bringen.
    if (patch.serialNumber && patch.serialNumber !== before.serialNumber) {
      const duplicate = findBySerial(store().scooters, patch.serialNumber)
      if (duplicate && duplicate.id !== id) {
        return actionFail<Scooter>(
          `Seriennummer ist bereits als ${duplicate.scooterNumber} erfasst.`,
          true
        )
      }
    }

    const result = mutate(id, (scooter) => ({ ...scooter, ...patch }))
    if (result.ok) {
      log({
        category: "SCOOTER",
        action: "Stammdaten geändert",
        detail: describeChanges(before, result.data),
        scooter: result.data,
      })
    }
    return result
  }

  async updateWorkflowStatus(id: string, status: WorkflowStatus) {
    const before = requireScooter(id)
    if (!before) return actionFail<Scooter>("Scooter nicht gefunden.")
    if (before.saleStatus === "VERKAUFT" && status !== "ARCHIVIERT") {
      return actionFail<Scooter>(
        "Ein verkaufter Scooter kann nicht zurück in den Warenprozess.",
        true
      )
    }

    // Die Übergangsregeln aus dem Fachmodell gelten hier, nicht erst in der
    // Oberfläche: Sonst ließe sich ein frisch eingegangener Scooter per
    // Auswahlfeld direkt auf "verkaufsbereit" setzen und die Freigabeprüfung
    // wäre wirkungslos.
    if (
      before.workflowStatus !== status &&
      !canTransition(before.workflowStatus, status)
    ) {
      return actionFail<Scooter>(
        `Der Übergang von ${WORKFLOW_META[before.workflowStatus].label} nach ` +
          `${WORKFLOW_META[status].label} ist nicht vorgesehen.`,
        true
      )
    }

    if (status === "VERKAUFSBEREIT" && !isReadyForSale(before)) {
      const offen = evaluateReadiness(before)
        .filter((check) => !check.ok)
        .map((check) => check.label)
      return actionFail<Scooter>(
        `${before.scooterNumber} ist noch nicht verkaufsbereit. Offen: ${offen.join(", ")}.`,
        true
      )
    }

    const result = mutate(id, (scooter) => ({
      ...scooter,
      workflowStatus: status,
      // Beim Start der Prüfung wandert der Scooter physisch an den Prüfplatz.
      location:
        status === "IN_PRUEFUNG" && scooter.location === "Wareneingang"
          ? "Prüfplatz"
          : scooter.location,
    }))

    if (result.ok) {
      log({
        category: "SCOOTER",
        action: "Status geändert",
        detail: `Workflow: ${before.workflowStatus} → ${status}`,
        scooter: result.data,
        level: status === "VERKAUFSBEREIT" ? "success" : "info",
      })
    }
    return result
  }

  async updateSaleStatus(id: string, status: "VERFUEGBAR" | "RESERVIERT") {
    const before = requireScooter(id)
    if (!before) return actionFail<Scooter>("Scooter nicht gefunden.")
    if (before.saleStatus === "VERKAUFT") {
      return actionFail<Scooter>(
        "Der Scooter ist bereits verkauft und kann nicht neu reserviert werden.",
        true
      )
    }

    const result = mutate(id, (scooter) => ({ ...scooter, saleStatus: status }))
    if (result.ok) {
      log({
        category: "VERKAUF",
        action: status === "RESERVIERT" ? "Reserviert" : "Reservierung aufgehoben",
        detail:
          status === "RESERVIERT"
            ? "Scooter für einen Interessenten vorgemerkt."
            : "Scooter steht wieder frei zum Verkauf.",
        scooter: result.data,
        level: "info",
      })
    }
    return result
  }

  /**
   * Zentraler Verkaufsvorgang.
   *
   * Reihenfolge ist bewusst: erst intern festschreiben, dann externe Kanäle
   * nachziehen. Fällt ein externer Aufruf aus, ist der Verkauf trotzdem
   * verbucht und der betroffene Kanal steht sichtbar auf FEHLER.
   */
  async markAsSold(
    id: string,
    input: MarkAsSoldInput
  ): Promise<ActionResult<Sale>> {
    const scooter = requireScooter(id)
    if (!scooter) return actionFail<Sale>("Scooter nicht gefunden.")

    // Der wichtigste Guard im ganzen System: keine zwei Verkäufe desselben Geräts.
    if (scooter.saleStatus === "VERKAUFT") {
      return actionFail<Sale>(
        `${scooter.scooterNumber} wurde bereits verkauft. Der Vorgang wurde abgebrochen, ` +
          `damit kein Doppelverkauf entsteht.`,
        true
      )
    }

    const repairCosts = repairCostsCents(scooter)

    const sale: Sale = {
      id: createId("sale"),
      scooterId: scooter.id,
      scooterNumber: scooter.scooterNumber,
      modelLabel: modelLabel(scooter),
      serialNumber: scooter.serialNumber,
      channel: input.channel,
      customerSource: input.customerSource,
      customerRegion: input.customerRegion.trim(),
      saleLocation: input.saleLocation.trim() || scooter.location,
      salePriceCents: input.salePriceCents,
      purchasePriceCents: scooter.purchasePriceCents,
      repairCostsCents: repairCosts,
      additionalCostsCents: scooter.additionalCostsCents,
      soldAt: input.soldAt,
      note: input.note,
      sheetsSyncStatus: "WARTET",
      sheetsSyncedAt: null,
      sheetsError: null,
      sheetsRowNumber: null,
      createdAt: new Date().toISOString(),
    }

    // 1. Intern festschreiben — Bestand sofort auf 0.
    store().updateScooter(id, (current) => ({
      ...current,
      saleStatus: "VERKAUFT",
      workflowStatus: "ARCHIVIERT",
      salePriceCents: input.salePriceCents,
      listings: current.listings.map((listing) => ({ ...listing, inventory: 0 })),
    }))
    store().addSale(sale)

    log({
      category: "VERKAUF",
      action: "Als verkauft markiert",
      detail: `${modelLabel(scooter)} über ${channelLabel(input.channel)} verkauft.`,
      scooter,
      level: "success",
      at: input.soldAt,
    })

    // 2. Kanäle deaktivieren und Reporting anstoßen — Fehler bleiben sichtbar.
    await deactivateAllChannels(id)
    await syncSaleToSheets(sale.id)

    const finalSale = store().sales.find((s) => s.id === sale.id) ?? sale
    return actionOk(finalSale)
  }

  /* ---------------- Prüfung ---------------- */

  async setInspectionCheck(
    id: string,
    checkKey: string,
    result: InspectionResult,
    note?: string
  ) {
    const outcome = mutate(id, (scooter) => ({
      ...scooter,
      // Das erste bewertete Feld schiebt den Scooter automatisch in die Prüfung.
      workflowStatus:
        scooter.workflowStatus === "EINGEGANGEN"
          ? ("IN_PRUEFUNG" as WorkflowStatus)
          : scooter.workflowStatus,
      inspection: {
        ...scooter.inspection,
        checks: scooter.inspection.checks.map((check) =>
          check.key === checkKey
            ? { ...check, result, note: note ?? check.note }
            : check
        ),
      },
    }))
    return outcome
  }

  async setInspectionNote(id: string, note: string) {
    return mutate(id, (scooter) => ({
      ...scooter,
      inspection: { ...scooter.inspection, note },
    }))
  }

  async completeInspection(id: string) {
    const scooter = requireScooter(id)
    if (!scooter) return actionFail<Scooter>("Scooter nicht gefunden.")

    const untouched = scooter.inspection.checks.filter(
      (check) => check.result === "NICHT_GEPRUEFT"
    )
    if (untouched.length > 0) {
      return actionFail<Scooter>(
        `Noch ${untouched.length} Prüfpunkt(e) offen. Die Prüfung kann erst danach abgeschlossen werden.`
      )
    }

    const problems = scooter.inspection.checks.filter(
      (check) => check.result === "PROBLEM"
    )
    const now = new Date().toISOString()

    const result = mutate(id, (current) => ({
      ...current,
      inspection: {
        ...current.inspection,
        completedAt: now,
        completedBy: store().user.name,
      },
      // Mit Mängeln geht es in die Aufbereitung, ohne Mängel ebenfalls —
      // dort fehlt dann nur noch die Reinigung.
      workflowStatus: "AUFBEREITUNG" as WorkflowStatus,
      location: current.location === "Prüfplatz" ? "Werkstatt" : current.location,
    }))

    if (result.ok) {
      log({
        category: "PRUEFUNG",
        action: "Prüfung abgeschlossen",
        detail:
          problems.length > 0
            ? `${problems.length} Mangel/Mängel dokumentiert — Reparatur erforderlich.`
            : "Alle Prüfpunkte ohne Beanstandung.",
        scooter: result.data,
        level: problems.length > 0 ? "warning" : "success",
      })
    }
    return result
  }

  async reopenInspection(id: string) {
    const result = mutate(id, (scooter) => ({
      ...scooter,
      inspection: { ...scooter.inspection, completedAt: null, completedBy: null },
      workflowStatus: "IN_PRUEFUNG" as WorkflowStatus,
    }))
    if (result.ok) {
      log({
        category: "PRUEFUNG",
        action: "Prüfung wieder geöffnet",
        detail: "Das Prüfprotokoll wurde zur Nachbearbeitung freigegeben.",
        scooter: result.data,
        level: "warning",
      })
    }
    return result
  }

  /* ---------------- Aufbereitung ---------------- */

  async setCleaning(id: string, done: boolean, note?: string) {
    const result = mutate(id, (scooter) => ({
      ...scooter,
      cleaning: {
        done,
        doneAt: done ? new Date().toISOString() : null,
        note: note ?? scooter.cleaning.note,
      },
    }))
    if (result.ok) {
      log({
        category: "AUFBEREITUNG",
        action: done ? "Reinigung erledigt" : "Reinigung zurückgesetzt",
        detail: done ? "Der Scooter wurde gereinigt." : "Reinigung erneut offen.",
        scooter: result.data,
      })
    }
    return result
  }

  async addRepair(id: string, repair: Omit<Repair, "id" | "createdAt">) {
    const result = mutate(id, (scooter) => ({
      ...scooter,
      workflowStatus:
        scooter.workflowStatus === "EINGEGANGEN" ||
        scooter.workflowStatus === "IN_PRUEFUNG"
          ? ("AUFBEREITUNG" as WorkflowStatus)
          : scooter.workflowStatus,
      repairs: [
        ...scooter.repairs,
        { ...repair, id: createId("rep"), createdAt: new Date().toISOString() },
      ],
    }))
    if (result.ok) {
      log({
        category: "AUFBEREITUNG",
        action: "Reparatur angelegt",
        detail: `${repair.problem} → ${repair.action || "offen"}`,
        scooter: result.data,
      })
    }
    return result
  }

  async updateRepair(id: string, repairId: string, patch: Partial<Repair>) {
    const result = mutate(id, (scooter) => ({
      ...scooter,
      repairs: scooter.repairs.map((repair) =>
        repair.id === repairId ? { ...repair, ...patch } : repair
      ),
    }))
    if (result.ok && patch.status) {
      const repair = result.data.repairs.find((r) => r.id === repairId)
      log({
        category: "AUFBEREITUNG",
        action: "Reparaturstatus geändert",
        detail: `${repair?.problem ?? "Reparatur"}: ${patch.status}`,
        scooter: result.data,
        level: patch.status === "ERLEDIGT" ? "success" : "info",
      })
    }
    return result
  }

  async removeRepair(id: string, repairId: string) {
    return mutate(id, (scooter) => ({
      ...scooter,
      repairs: scooter.repairs.filter((repair) => repair.id !== repairId),
    }))
  }

  /* ---------------- Bilder ---------------- */

  async addImages(
    id: string,
    images: Omit<ScooterImage, "id" | "createdAt" | "sortOrder" | "isPrimary">[]
  ) {
    /*
     * Speicherprüfung vor dem Schreiben.
     *
     * Der Browserspeicher fasst rund 5 MB. Ohne diese Prüfung nimmt die
     * Oberfläche den Upload an, meldet Erfolg — und nach dem Neuladen sind
     * die Bilder weg, weil der Schreibvorgang am Kontingent gescheitert ist.
     * Lieber vorher ehrlich ablehnen. Mit Supabase Storage entfällt die
     * Grenze; dann bleibt hier nur eine großzügige Obergrenze stehen.
     */
    const incoming = images.reduce(
      (sum, image) => sum + dataUrlBytes(image.url),
      0
    )
    const used = estimateStoredBytes()
    if (used + incoming > IMAGE_BUDGET_BYTES) {
      const frei = Math.max(0, IMAGE_BUDGET_BYTES - used)
      return actionFail<Scooter>(
        `Der Browserspeicher reicht nicht: ${formatBytes(incoming)} sollen dazu, ` +
          `frei sind noch ${formatBytes(frei)}. Lade eine Sicherung herunter und ` +
          `entferne Bilder älterer Vorgänge, oder verwende weniger Fotos.`,
        true
      )
    }

    const result = mutate(id, (scooter) => {
      const startIndex = scooter.images.length
      const added: ScooterImage[] = images.map((image, offset) => ({
        ...image,
        id: createId("img"),
        createdAt: new Date().toISOString(),
        sortOrder: startIndex + offset,
        // Das erste Bild überhaupt wird automatisch zum Titelbild.
        isPrimary: startIndex === 0 && offset === 0,
      }))
      return { ...scooter, images: [...scooter.images, ...added] }
    })

    if (result.ok) {
      log({
        category: "BILDER",
        action: "Bilder hinzugefügt",
        detail: `${images.length} Bild(er) hochgeladen.`,
        scooter: result.data,
      })
    }
    return result
  }

  async removeImage(id: string, imageId: string) {
    return mutate(id, (scooter) => {
      const remaining = scooter.images
        .filter((image) => image.id !== imageId)
        .map((image, index) => ({ ...image, sortOrder: index }))

      // Wurde das Titelbild gelöscht, rückt das erste verbleibende Bild nach.
      const hasPrimary = remaining.some((image) => image.isPrimary)
      return {
        ...scooter,
        images: remaining.map((image, index) => ({
          ...image,
          isPrimary: hasPrimary ? image.isPrimary : index === 0,
        })),
      }
    })
  }

  async setPrimaryImage(id: string, imageId: string) {
    return mutate(id, (scooter) => ({
      ...scooter,
      images: scooter.images.map((image) => ({
        ...image,
        isPrimary: image.id === imageId,
      })),
    }))
  }

  async reorderImages(id: string, imageIds: string[]) {
    return mutate(id, (scooter) => {
      const byId = new Map(scooter.images.map((image) => [image.id, image]))
      const ordered = imageIds
        .map((imageId) => byId.get(imageId))
        .filter((image): image is ScooterImage => image !== undefined)
        .map((image, index) => ({ ...image, sortOrder: index }))

      // Bilder, die nicht in der Liste stehen, hinten anhängen statt verlieren.
      const missing = scooter.images.filter((image) => !imageIds.includes(image.id))
      return {
        ...scooter,
        images: [
          ...ordered,
          ...missing.map((image, index) => ({
            ...image,
            sortOrder: ordered.length + index,
          })),
        ],
      }
    })
  }
}

function describeChanges(before: Scooter, after: Scooter): string {
  const changes: string[] = []
  if (before.salePriceCents !== after.salePriceCents) changes.push("Verkaufspreis")
  if (before.purchasePriceCents !== after.purchasePriceCents) changes.push("Einkaufspreis")
  if (before.location !== after.location) changes.push("Standort")
  if (before.condition !== after.condition) changes.push("Zustand")
  if (before.description !== after.description) changes.push("Beschreibung")
  if (JSON.stringify(before.documents) !== JSON.stringify(after.documents)) {
    changes.push("Dokumente")
  }
  return changes.length > 0
    ? `Geändert: ${changes.join(", ")}.`
    : "Datensatz aktualisiert."
}

function channelLabel(channel: string): string {
  const labels: Record<string, string> = {
    SHOPIFY: "Shopify",
    KLEINANZEIGEN: "Kleinanzeigen",
    VOR_ORT: "Vor Ort",
    TELEFON: "Telefon",
    SONSTIGE: "Sonstige",
  }
  return labels[channel] ?? channel
}

/* ------------------------------------------------------------------ */
/* Kanäle                                                              */
/* ------------------------------------------------------------------ */

class DemoChannelRepository implements ChannelRepository {
  async publish(scooterId: string, channel: Channel) {
    return runPublish(scooterId, channel, "publish")
  }

  async update(scooterId: string, channel: Channel) {
    return runPublish(scooterId, channel, "update")
  }

  async retry(scooterId: string, channel: Channel) {
    return runPublish(scooterId, channel, "publish")
  }

  async deactivate(scooterId: string, channel: Channel) {
    const scooter = requireScooter(scooterId)
    if (!scooter) return actionFail<Scooter>("Scooter nicht gefunden.")

    const adapter = ADAPTERS[channel]
    store().updateScooter(scooterId, (current) =>
      withListing(current, channel, { status: "SYNC_AUSSTEHEND" })
    )

    const response = await adapter.setUnavailable(scooter)

    if (!response.ok) {
      const failed = mutate(scooterId, (current) =>
        withListing(current, channel, {
          status: "FEHLER",
          lastError: response.error.message,
          retryCount:
            (current.listings.find((l) => l.channel === channel)?.retryCount ?? 0) + 1,
        })
      )
      log({
        category: "KANAL",
        action: `${adapter.displayName}: Deaktivierung fehlgeschlagen`,
        detail: response.error.message,
        scooter,
        level: "error",
      })
      return failed.ok ? actionFail<Scooter>(response.error.message) : failed
    }

    const result = mutate(scooterId, (current) =>
      withListing(current, channel, {
        status: "DEAKTIVIERT",
        inventory: 0,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      })
    )

    if (result.ok) {
      log({
        category: "KANAL",
        action: `${adapter.displayName}: deaktiviert`,
        detail: "Bestand auf 0 gesetzt, Angebot nicht mehr aktiv.",
        scooter: result.data,
      })
    }
    return result
  }
}

/**
 * Gemeinsamer Pfad für Veröffentlichen, Aktualisieren und Wiederholen.
 * Der Zwischenstatus SYNC_AUSSTEHEND macht laufende Aufrufe sichtbar und
 * verhindert, dass ein zweiter Klick als zweite Veröffentlichung zählt.
 */
async function runPublish(
  scooterId: string,
  channel: Channel,
  mode: "publish" | "update"
): Promise<ActionResult<Scooter>> {
  const scooter = requireScooter(scooterId)
  if (!scooter) return actionFail<Scooter>("Scooter nicht gefunden.")

  if (scooter.saleStatus === "VERKAUFT") {
    return actionFail<Scooter>(
      "Ein verkaufter Scooter kann nicht veröffentlicht werden.",
      true
    )
  }

  if (mode === "publish" && !isReadyForSale(scooter)) {
    const offen = evaluateReadiness(scooter)
      .filter((check) => !check.ok)
      .map((check) => check.label)
    return actionFail<Scooter>(
      `${scooter.scooterNumber} ist noch nicht freigegeben. Offen: ${offen.join(", ")}.`,
      true
    )
  }

  const adapter = ADAPTERS[channel]

  store().updateScooter(scooterId, (current) =>
    withListing(current, channel, { status: "SYNC_AUSSTEHEND", lastError: null })
  )

  const response =
    mode === "publish"
      ? await adapter.publishProduct(scooter)
      : await adapter.updateProduct(scooter)

  if (!response.ok) {
    mutate(scooterId, (current) =>
      withListing(current, channel, {
        status: "FEHLER",
        lastError: response.error.message,
        retryCount:
          (current.listings.find((l) => l.channel === channel)?.retryCount ?? 0) + 1,
      })
    )
    log({
      category: "KANAL",
      action: `${adapter.displayName}: Veröffentlichung fehlgeschlagen`,
      detail: response.error.message,
      scooter,
      level: "error",
    })
    return actionFail<Scooter>(response.error.message)
  }

  // Zwischen Aufruf und Antwort liegen bei Shopify bis zu anderthalb
  // Sekunden. Wurde der Scooter in dieser Zeit verkauft — zweiter Tab,
  // eingehende Bestellung, Verkaufsdialog —, darf die verspätete Antwort das
  // Angebot nicht wieder scharf schalten. Deshalb wird der Zustand nach dem
  // await erneut geprüft, nicht der vor dem await gelesene verwendet.
  const after = requireScooter(scooterId)
  if (!after) return actionFail<Scooter>("Scooter nicht gefunden.")

  if (after.saleStatus === "VERKAUFT") {
    await adapter.setUnavailable(after)
    mutate(scooterId, (current) =>
      withListing(current, channel, {
        status: "DEAKTIVIERT",
        inventory: 0,
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
      })
    )
    log({
      category: "KANAL",
      action: `${adapter.displayName}: Veröffentlichung verworfen`,
      detail:
        "Der Scooter wurde während der Übertragung verkauft. Das Angebot wurde sofort wieder stillgelegt.",
      scooter: after,
      level: "warning",
    })
    return actionFail<Scooter>(
      `${after.scooterNumber} wurde zwischenzeitlich verkauft. Das Angebot bleibt inaktiv.`,
      true
    )
  }

  const result = mutate(scooterId, (current) =>
    withListing(current, channel, {
      status: "VEROEFFENTLICHT",
      externalIds: response.data.externalIds,
      externalUrl: response.data.externalUrl,
      priceCents: current.salePriceCents,
      inventory: 1,
      lastSyncedAt: response.data.publishedAt,
      lastError: null,
      retryCount: 0,
    })
  )

  if (result.ok) {
    store().setIntegrations(
      channel === "SHOPIFY"
        ? { shopifyLastSyncAt: response.data.publishedAt }
        : {}
    )
    log({
      category: "KANAL",
      action:
        mode === "publish"
          ? `Auf ${adapter.displayName} veröffentlicht`
          : `${adapter.displayName}: Angebot aktualisiert`,
      detail: adapter.supportsApi
        ? `Bestand 1, Preis übertragen.`
        : "Manuell als inseriert markiert (kein automatischer Abgleich).",
      scooter: result.data,
      level: "success",
    })
  }
  return result
}

/** Nach einem Verkauf: alle aktiven Kanäle stilllegen. */
async function deactivateAllChannels(scooterId: string) {
  const scooter = requireScooter(scooterId)
  if (!scooter) return

  const channels = new DemoChannelRepository()
  for (const listing of scooter.listings) {
    if (
      listing.status === "VEROEFFENTLICHT" ||
      listing.status === "SYNC_AUSSTEHEND"
    ) {
      await channels.deactivate(scooterId, listing.channel)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Verkäufe & Reporting                                                */
/* ------------------------------------------------------------------ */

/** Schreibt eine Verkaufszeile Richtung Google Sheets. Idempotent über sale.id. */
async function syncSaleToSheets(saleId: string): Promise<ActionResult<Sale>> {
  const sale = store().sales.find((s) => s.id === saleId)
  if (!sale) return actionFail<Sale>("Verkauf nicht gefunden.")

  // Bereits geschrieben: kein zweiter Schreibvorgang, auch nicht nach einem
  // Neuladen. Der Wiederholen-Knopf darf keine Doppelzeile erzeugen.
  if (sale.sheetsSyncStatus === "SYNCHRONISIERT") return actionOk(sale)

  store().patchSale(saleId, { sheetsSyncStatus: "WARTET", sheetsError: null })

  const response = await sheetsAdapter.appendSale(sale)
  const scooter = requireScooter(sale.scooterId) ?? null

  if (!response.ok) {
    store().patchSale(saleId, {
      sheetsSyncStatus: "FEHLER",
      sheetsError: response.error.message,
    })
    log({
      category: "SYNC",
      action: "Google-Sheets-Synchronisation fehlgeschlagen",
      detail: response.error.message,
      scooter,
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
    scooter,
    level: "success",
  })

  const updated = store().sales.find((s) => s.id === saleId)
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
  async importRows(input: {
    fileName: string
    source: ImportBatch["source"]
    rows: NewScooterInput[]
  }): Promise<ActionResult<ImportBatch>> {
    const state = store()
    const issues: ImportIssue[] = []
    const created: Scooter[] = []

    // Nummern werden fortlaufend aus dem wachsenden Bestand gezogen, damit
    // innerhalb eines Imports keine Nummer doppelt vergeben wird.
    const numberPool = state.scooters.map((s) => s.scooterNumber)
    const serialPool = [...state.scooters]
    const batchId = createId("imp")

    input.rows.forEach((row, index) => {
      const rowNumber = index + 1

      if (!row.serialNumber || row.serialNumber.trim() === "") {
        issues.push({
          row: rowNumber,
          serialNumber: "",
          reason: "Keine Seriennummer — Zeile übersprungen.",
          severity: "error",
        })
        return
      }

      const duplicate = findBySerial(serialPool, row.serialNumber)
      if (duplicate) {
        // Bestehende Scooter werden niemals überschrieben.
        issues.push({
          row: rowNumber,
          serialNumber: row.serialNumber,
          reason: `Bereits im Bestand als ${duplicate.scooterNumber} — nicht importiert.`,
          severity: "warning",
        })
        return
      }

      const number = nextScooterNumber(numberPool)
      numberPool.push(number)

      const scooter = createScooter({ ...row, importBatchId: batchId }, number)
      created.push(scooter)
      serialPool.push(scooter)
    })

    if (created.length > 0) {
      state.upsertScooters(created)
    }

    const batch: ImportBatch = {
      id: batchId,
      fileName: input.fileName,
      source: input.source,
      rowsTotal: input.rows.length,
      rowsImported: created.length,
      rowsSkipped: input.rows.length - created.length,
      issues,
      createdAt: new Date().toISOString(),
      createdBy: state.user.name,
    }

    state.addImportBatch(batch)

    log({
      category: "IMPORT",
      action: "Import abgeschlossen",
      detail:
        `${batch.rowsImported} von ${batch.rowsTotal} Zeilen aus „${batch.fileName}" importiert` +
        (batch.rowsSkipped > 0 ? `, ${batch.rowsSkipped} übersprungen.` : "."),
      level: batch.rowsSkipped > 0 ? "warning" : "success",
    })

    return actionOk(batch)
  }

  async saveMapping(mapping: ColumnMapping[]) {
    store().setSavedMapping(mapping)
    return actionOk(undefined)
  }

  /**
   * Beispiel-Lieferliste. Läuft bewusst über das Repository und nicht direkt
   * aus der Komponente heraus — beim Wechsel auf die echte Avides-Anbindung
   * wird hier getauscht, nicht im Assistenten.
   */
  async loadDemoTable() {
    const source = new MockAvidesImportSource()
    const table = await source.loadDemoTable()
    return actionOk(table)
  }
}

/* ------------------------------------------------------------------ */
/* Demo-Funktionen                                                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Einstellungen & Datensicherung                                      */
/* ------------------------------------------------------------------ */

/** Kennzeichnet eine Sicherungsdatei, damit fremde JSON-Dateien auffallen. */
const SNAPSHOT_MARKER = "skope-cockpit-snapshot"

interface Snapshot {
  marker: typeof SNAPSHOT_MARKER
  version: number
  exportedAt: string
  scooters: Scooter[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
}

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
      scooters: state.scooters,
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
      return actionFail<{ scooters: number; sales: number }>(
        "Die Datei ist kein gültiges JSON.",
        true
      )
    }

    const snapshot = parsed as Partial<Snapshot>
    if (snapshot?.marker !== SNAPSHOT_MARKER || !Array.isArray(snapshot.scooters)) {
      return actionFail<{ scooters: number; sales: number }>(
        "Das ist keine SKOPE-Sicherungsdatei.",
        true
      )
    }

    /*
      Die Version der Sicherung wird gelesen, nicht nur geschrieben.

      Bisher stand `version` zwar in jeder Exportdatei, wurde beim Einspielen
      aber nie angesehen: `replaceAll` schrieb den Inhalt direkt in den Store
      und umging damit `migrate` vollständig. Eine Sicherung aus einer neueren
      Fassung als der laufenden kann Felder mitbringen, die es hier noch nicht
      gibt — die werden ohne Prüfung zu stillen Fehlern. Ältere Sicherungen
      sind dagegen unkritisch: Die fehlenden Felder werden unten aufgefüllt.
    */
    const version = Number(snapshot.version ?? 0)
    if (version > SNAPSHOT_VERSION) {
      return actionFail<{ scooters: number; sales: number }>(
        `Die Sicherung stammt aus einer neueren Fassung (Version ${version}, ` +
          `diese Installation kennt Version ${SNAPSHOT_VERSION}).`,
        true
      )
    }

    const sales = (snapshot.sales ?? []).map((sale) => ({
      ...sale,
      sheetsRowNumber: sale.sheetsRowNumber ?? null,
    }))

    store().replaceAll({
      scooters: snapshot.scooters,
      sales,
      activity: snapshot.activity ?? [],
      importBatches: snapshot.importBatches ?? [],
    })

    log({
      category: "SYSTEM",
      action: "Sicherung eingespielt",
      detail:
        `${snapshot.scooters.length} Scooter und ${sales.length} Verkäufe aus einer ` +
        `Sicherung vom ${formatSnapshotDate(snapshot.exportedAt)} übernommen.`,
      level: "warning",
    })

    return actionOk({ scooters: snapshot.scooters.length, sales: sales.length })
  }
}

function formatSnapshotDate(iso: string | undefined): string {
  if (!iso) return "unbekannten Datum"
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? "unbekannten Datum"
    : date.toLocaleDateString("de-DE")
}

class DemoExtras implements DemoRepositoryExtras {
  /**
   * Simuliert eine eingehende Shopify-Bestellung.
   *
   * Bildet exakt den Ablauf ab, den später der echte Webhook auslöst:
   * Bestellung auswerten → Scooter identifizieren → intern auf VERKAUFT →
   * andere Kanäle deaktivieren → Reporting synchronisieren → Audit Log.
   */
  async simulateShopifyOrder(scooterId: string): Promise<ActionResult<Sale>> {
    const scooter = requireScooter(scooterId)
    if (!scooter) return actionFail<Sale>("Scooter nicht gefunden.")

    const shopifyListing = scooter.listings.find((l) => l.channel === "SHOPIFY")
    if (shopifyListing?.status !== "VEROEFFENTLICHT") {
      return actionFail<Sale>(
        "Der Scooter ist nicht auf Shopify veröffentlicht — es kann keine Bestellung eingehen.",
        true
      )
    }

    log({
      category: "SYNC",
      action: "Shopify-Bestellung empfangen",
      detail: `Webhook orders/create für SKU ${scooter.scooterNumber} verarbeitet.`,
      scooter,
      actor: "System (Shopify Webhook)",
      level: "info",
    })

    // Kein Rückfall auf 0 €: Ein Verkauf ohne Preis ist unumkehrbar und
    // verfälscht Umsatz und Marge des Monats.
    const salePriceCents = scooter.salePriceCents ?? shopifyListing.priceCents
    if (salePriceCents === null || salePriceCents <= 0) {
      return actionFail<Sale>(
        `${scooter.scooterNumber} hat keinen Verkaufspreis. Der Vorgang wurde abgebrochen, ` +
          `damit kein Verkauf über 0 € entsteht.`,
        true
      )
    }

    const scooters = new DemoScooterRepository()
    return scooters.markAsSold(scooterId, {
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
  scooters: new DemoScooterRepository(),
  channels: new DemoChannelRepository(),
  sales: new DemoSalesRepository(),
  imports: new DemoImportRepository(),
  settings: new DemoSettingsRepository(),
  demo: new DemoExtras(),
}
