/**
 * Beschriftungen, Farben und Regeln rund um die Statusmodelle.
 *
 * Alles, was der Nutzer als Status sieht, kommt aus dieser Datei — damit ein
 * Status überall in der Anwendung gleich heißt und gleich aussieht.
 */

import type {
  Channel,
  Condition,
  InspectionResult,
  ListingStatus,
  RepairStatus,
  CustomerSource,
  SaleChannel,
  SaleStatus,
  Scooter,
  SyncStatus,
  WorkflowStatus,
} from "./types"

/** Farbrolle eines Status. Wird auf konkrete Klassen gemappt (siehe StatusPill). */
export type StatusTone =
  | "neutral"
  | "info"
  | "progress"
  | "ready"
  | "live"
  | "warn"
  | "error"
  | "done"

interface StatusMeta {
  label: string
  tone: StatusTone
  /** Kurze Erklärung für Tooltips und leere Zustände. */
  hint?: string
}

/* ------------------------------------------------------------------ */
/* Workflow                                                            */
/* ------------------------------------------------------------------ */

export const WORKFLOW_META: Record<WorkflowStatus, StatusMeta> = {
  EINGEGANGEN: {
    label: "Eingegangen",
    tone: "neutral",
    hint: "Im Wareneingang erfasst, noch nicht geprüft.",
  },
  IN_PRUEFUNG: {
    label: "In Prüfung",
    tone: "info",
    hint: "Prüfprotokoll ist begonnen, aber noch nicht abgeschlossen.",
  },
  AUFBEREITUNG: {
    label: "Aufbereitung",
    tone: "progress",
    hint: "Reinigung und Reparaturen laufen.",
  },
  VERKAUFSBEREIT: {
    label: "Verkaufsbereit",
    tone: "ready",
    hint: "Geprüft, aufbereitet und freigegeben für die Kanäle.",
  },
  ARCHIVIERT: {
    label: "Archiviert",
    tone: "done",
    hint: "Vorgang abgeschlossen, nicht mehr im aktiven Bestand.",
  },
}

/** Reihenfolge der Prozessstufen für die Prozessübersicht. */
export const WORKFLOW_PIPELINE: WorkflowStatus[] = [
  "EINGEGANGEN",
  "IN_PRUEFUNG",
  "AUFBEREITUNG",
  "VERKAUFSBEREIT",
]

/* ------------------------------------------------------------------ */
/* Verkaufsstatus                                                      */
/* ------------------------------------------------------------------ */

export const SALE_STATUS_META: Record<SaleStatus, StatusMeta> = {
  VERFUEGBAR: { label: "Verfügbar", tone: "ready" },
  RESERVIERT: { label: "Reserviert", tone: "warn" },
  VERKAUFT: { label: "Verkauft", tone: "done" },
}

/* ------------------------------------------------------------------ */
/* Listings                                                            */
/* ------------------------------------------------------------------ */

export const LISTING_STATUS_META: Record<ListingStatus, StatusMeta> = {
  NICHT_VEROEFFENTLICHT: { label: "Nicht veröffentlicht", tone: "neutral" },
  VEROEFFENTLICHT: { label: "Veröffentlicht", tone: "live" },
  SYNC_AUSSTEHEND: { label: "Sync ausstehend", tone: "progress" },
  FEHLER: { label: "Fehler", tone: "error" },
  DEAKTIVIERT: { label: "Deaktiviert", tone: "neutral" },
}

export const CHANNEL_META: Record<
  Channel,
  { label: string; short: string; automated: boolean }
> = {
  SHOPIFY: { label: "Shopify", short: "SHP", automated: true },
  // Kein automatisierter Kanal, solange keine Schnittstelle bestätigt ist.
  KLEINANZEIGEN: { label: "Kleinanzeigen", short: "KA", automated: false },
}

/**
 * Herkunft des Kunden.
 *
 * `hint` erklärt die Abgrenzung — ohne sie landet in der Praxis alles auf
 * „Sonstige" und die Auswertung ist wertlos.
 */
export const CUSTOMER_SOURCE_META: Record<
  CustomerSource,
  { label: string; hint: string }
> = {
  UNBEKANNT: { label: "Nicht erfasst", hint: "Herkunft wurde nicht erfragt." },
  WEBSITE: {
    label: "Website / Shop",
    hint: "Direkt über die eigene Seite oder den Shopify-Store.",
  },
  GOOGLE: {
    label: "Google",
    hint: "Suche, Maps oder Google-Anzeige.",
  },
  KLEINANZEIGEN: {
    label: "Kleinanzeigen",
    hint: "Über eine Kleinanzeigen-Anzeige gefunden.",
  },
  SOCIAL_MEDIA: {
    label: "Social Media",
    hint: "Instagram, Facebook, TikTok, YouTube.",
  },
  EMPFEHLUNG: {
    label: "Empfehlung",
    hint: "Von einem anderen Kunden weitergesagt.",
  },
  STAMMKUNDE: { label: "Stammkunde", hint: "Hat schon einmal gekauft." },
  LAUFKUNDSCHAFT: {
    label: "Laufkundschaft",
    hint: "Vor Ort vorbeigekommen, ohne vorherige Suche.",
  },
  SONSTIGE: { label: "Sonstige", hint: "Passt in keine der Kategorien." },
}

export const SALE_CHANNEL_META: Record<SaleChannel, { label: string }> = {
  SHOPIFY: { label: "Shopify" },
  KLEINANZEIGEN: { label: "Kleinanzeigen" },
  VOR_ORT: { label: "Vor Ort" },
  TELEFON: { label: "Telefon" },
  SONSTIGE: { label: "Sonstige" },
}

/* ------------------------------------------------------------------ */
/* Weitere                                                             */
/* ------------------------------------------------------------------ */

export const INSPECTION_RESULT_META: Record<InspectionResult, StatusMeta> = {
  NICHT_GEPRUEFT: { label: "Nicht geprüft", tone: "neutral" },
  BESTANDEN: { label: "Bestanden", tone: "ready" },
  PROBLEM: { label: "Problem", tone: "error" },
}

export const REPAIR_STATUS_META: Record<RepairStatus, StatusMeta> = {
  OFFEN: { label: "Offen", tone: "warn" },
  IN_ARBEIT: { label: "In Arbeit", tone: "progress" },
  ERLEDIGT: { label: "Erledigt", tone: "ready" },
}

export const CONDITION_META: Record<Condition, StatusMeta> = {
  WIE_NEU: { label: "Wie neu", tone: "ready" },
  SEHR_GUT: { label: "Sehr gut", tone: "ready" },
  GUT: { label: "Gut", tone: "info" },
  GEBRAUCHT: { label: "Gebraucht", tone: "neutral" },
  DEFEKT: { label: "Defekt", tone: "error" },
}

export const SYNC_STATUS_META: Record<SyncStatus, StatusMeta> = {
  NICHT_ERFORDERLICH: { label: "Nicht erforderlich", tone: "neutral" },
  WARTET: { label: "Wartet", tone: "progress" },
  SYNCHRONISIERT: { label: "Synchronisiert", tone: "ready" },
  FEHLER: { label: "Fehler", tone: "error" },
}

/* ------------------------------------------------------------------ */
/* Geschäftsregeln                                                     */
/* ------------------------------------------------------------------ */

export interface ReadinessCheck {
  ok: boolean
  label: string
  hint: string
}

/**
 * Darf dieser Scooter verkaufsbereit gesetzt bzw. veröffentlicht werden?
 *
 * Bewusst als reine Funktion über dem Domain-Objekt formuliert: Im Prototyp
 * ruft sie der Client auf, in der späteren Produktion dieselbe Funktion
 * serverseitig vor dem Schreiben. Die Regel existiert damit nur einmal.
 */
export function evaluateReadiness(scooter: Scooter): ReadinessCheck[] {
  const criticalOpen = scooter.inspection.checks.filter(
    (check) => check.result === "PROBLEM"
  )
  const openRepairs = scooter.repairs.filter((r) => r.status !== "ERLEDIGT")

  return [
    {
      ok: scooter.inspection.completedAt !== null,
      label: "Prüfung abgeschlossen",
      hint: "Das Prüfprotokoll muss bewusst abgeschlossen worden sein.",
    },
    {
      ok: criticalOpen.length === 0,
      label: "Keine offenen Prüfmängel",
      hint:
        criticalOpen.length > 0
          ? `${criticalOpen.length} Prüfpunkt(e) mit Problem.`
          : "Alle Prüfpunkte ohne Beanstandung.",
    },
    {
      ok: openRepairs.length === 0,
      label: "Reparaturen erledigt",
      hint:
        openRepairs.length > 0
          ? `${openRepairs.length} Reparatur(en) noch offen.`
          : "Keine offenen Reparaturen.",
    },
    {
      ok: scooter.cleaning.done,
      label: "Reinigung erledigt",
      hint: "Der Scooter muss gereinigt sein.",
    },
    {
      ok: scooter.salePriceCents !== null && scooter.salePriceCents > 0,
      label: "Verkaufspreis gesetzt",
      hint: "Ohne Preis kann nicht veröffentlicht werden.",
    },
    {
      ok: scooter.documents.abe,
      label: "ABE vorhanden",
      hint: "Ohne Betriebserlaubnis ist der Scooter im Straßenverkehr nicht nutzbar.",
    },
    {
      ok: scooter.images.length > 0,
      label: "Mindestens ein Bild",
      hint: "Für die Veröffentlichung wird mindestens ein Produktbild benötigt.",
    },
  ]
}

export function isReadyForSale(scooter: Scooter): boolean {
  return evaluateReadiness(scooter).every((check) => check.ok)
}

/**
 * Erlaubte Workflow-Übergänge. Rücksprünge sind bewusst zugelassen — ein
 * Scooter kann aus "verkaufsbereit" zurück in die Aufbereitung fallen.
 */
export const ALLOWED_WORKFLOW_TRANSITIONS: Record<
  WorkflowStatus,
  WorkflowStatus[]
> = {
  EINGEGANGEN: ["IN_PRUEFUNG", "ARCHIVIERT"],
  IN_PRUEFUNG: ["EINGEGANGEN", "AUFBEREITUNG", "VERKAUFSBEREIT", "ARCHIVIERT"],
  AUFBEREITUNG: ["IN_PRUEFUNG", "VERKAUFSBEREIT", "ARCHIVIERT"],
  VERKAUFSBEREIT: ["AUFBEREITUNG", "IN_PRUEFUNG", "ARCHIVIERT"],
  ARCHIVIERT: ["VERKAUFSBEREIT"],
}

export function canTransition(from: WorkflowStatus, to: WorkflowStatus) {
  return ALLOWED_WORKFLOW_TRANSITIONS[from].includes(to)
}

/** Ein Scooter zählt zum Bestand, solange er nicht verkauft/archiviert ist. */
export function isInStock(scooter: Scooter): boolean {
  return scooter.saleStatus !== "VERKAUFT" && scooter.workflowStatus !== "ARCHIVIERT"
}

export function getListing(scooter: Scooter, channel: Channel) {
  return scooter.listings.find((listing) => listing.channel === channel)
}

/** Ist der Scooter auf mindestens einem Kanal aktiv inseriert? */
export function isListed(scooter: Scooter): boolean {
  return scooter.listings.some((l) => l.status === "VEROEFFENTLICHT")
}

export function modelLabel(scooter: Scooter): string {
  return [scooter.manufacturer, scooter.model, scooter.variant]
    .filter(Boolean)
    .join(" ")
}
