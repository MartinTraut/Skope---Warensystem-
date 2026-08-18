/**
 * Beschriftungen, Farben und Übergangsregeln der Statusmodelle.
 *
 * Alles, was der Nutzer als Status sieht, kommt aus dieser Datei — damit ein
 * Status überall in der Anwendung gleich heißt und gleich aussieht.
 */

import type {
  ArticleUnit,
  AuditCategory,
  Channel,
  Condition,
  CustomerSource,
  InspectionResult,
  ListingStatus,
  MovementType,
  ProposalStatus,
  PublishMode,
  RepairStatus,
  SaleChannel,
  SaleStatus,
  StockMode,
  SyncStatus,
  TeardownDistribution,
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

export interface StatusMeta {
  label: string
  tone: StatusTone
  /** Kurze Erklärung für Tooltips und leere Zustände. */
  hint?: string
}

/* ------------------------------------------------------------------ */
/* Bestandsart                                                         */
/* ------------------------------------------------------------------ */

export const STOCK_MODE_META: Record<
  StockMode,
  StatusMeta & { short: string; description: string }
> = {
  SERIALISIERT: {
    label: "Einzelstücke",
    short: "Stück",
    tone: "info",
    hint: "Jedes Gerät wird einzeln geführt.",
    description:
      "Jedes Gerät bekommt eine eigene Nummer, ein eigenes Prüfprotokoll, eigene Bilder und eine eigene Marge. Richtig für Scooter, Akkus und alles mit Seriennummer.",
  },
  MENGE: {
    label: "Mengenartikel",
    short: "Menge",
    tone: "neutral",
    hint: "Ein Stammsatz, Bestand als Stückzahl.",
    description:
      "Ein Stammsatz für viele gleiche Teile. Der Bestand ergibt sich aus den Buchungen. Richtig für Displays, Reifen, Bremsbeläge und Schrauben.",
  },
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
  AUSGESCHLACHTET: {
    label: "Ausgeschlachtet",
    tone: "warn",
    hint: "In Ersatzteile zerlegt; der Einkaufswert liegt jetzt auf den Teilen.",
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

/**
 * Erlaubte Workflow-Übergänge. Rücksprünge sind bewusst zugelassen — ein
 * Gerät kann aus "verkaufsbereit" zurück in die Aufbereitung fallen.
 *
 * AUSGESCHLACHTET hat keinen Rückweg: Die Teile sind verbaut oder verkauft,
 * ein Zurücksetzen würde den Einkaufswert doppelt zählen.
 */
export const ALLOWED_WORKFLOW_TRANSITIONS: Record<
  WorkflowStatus,
  WorkflowStatus[]
> = {
  EINGEGANGEN: ["IN_PRUEFUNG", "AUFBEREITUNG", "ARCHIVIERT"],
  IN_PRUEFUNG: ["EINGEGANGEN", "AUFBEREITUNG", "VERKAUFSBEREIT", "ARCHIVIERT"],
  AUFBEREITUNG: ["IN_PRUEFUNG", "VERKAUFSBEREIT", "ARCHIVIERT"],
  VERKAUFSBEREIT: ["AUFBEREITUNG", "IN_PRUEFUNG", "ARCHIVIERT"],
  AUSGESCHLACHTET: [],
  ARCHIVIERT: ["VERKAUFSBEREIT"],
}

export function canTransition(from: WorkflowStatus, to: WorkflowStatus) {
  return ALLOWED_WORKFLOW_TRANSITIONS[from].includes(to)
}

/* ------------------------------------------------------------------ */
/* Verkaufsstatus                                                      */
/* ------------------------------------------------------------------ */

export const SALE_STATUS_META: Record<SaleStatus, StatusMeta> = {
  VERFUEGBAR: { label: "Verfügbar", tone: "ready" },
  RESERVIERT: { label: "Reserviert", tone: "warn" },
  VERKAUFT: { label: "Verkauft", tone: "done" },
}

/* ------------------------------------------------------------------ */
/* Inserate und Kanäle                                                 */
/* ------------------------------------------------------------------ */

export const LISTING_STATUS_META: Record<ListingStatus, StatusMeta> = {
  NICHT_VEROEFFENTLICHT: { label: "Nicht veröffentlicht", tone: "neutral" },
  VEROEFFENTLICHT: { label: "Veröffentlicht", tone: "live" },
  SYNC_AUSSTEHEND: { label: "Sync ausstehend", tone: "progress" },
  FEHLER: { label: "Fehler", tone: "error" },
  DEAKTIVIERT: { label: "Deaktiviert", tone: "neutral" },
}

/**
 * `automated` unterscheidet, wer das Inserat tatsächlich einstellt.
 *
 * Shopify ist angebunden. eBay und Kleinanzeigen bereitet das Cockpit
 * vollständig vor — eingestellt wird dort von Hand, und der Bestandsabgleich
 * bleibt eine bewusste Nachtragung. Alles andere wäre eine Zusage, die ohne
 * Entwicklerzugang niemand halten kann.
 */
export const CHANNEL_META: Record<
  Channel,
  { label: string; short: string; automated: boolean; hint: string }
> = {
  SHOPIFY: {
    label: "Shopify",
    short: "SHP",
    automated: true,
    hint: "Angebunden — Veröffentlichung und Bestand laufen automatisch.",
  },
  EBAY: {
    label: "eBay",
    short: "EB",
    automated: false,
    hint: "Inserat wird fertig vorbereitet und von Hand eingestellt. Verkäufe müssen nachgetragen werden.",
  },
  KLEINANZEIGEN: {
    label: "Kleinanzeigen",
    short: "KA",
    automated: false,
    hint: "Inserat wird fertig vorbereitet und von Hand eingestellt.",
  },
}

export const PUBLISH_MODE_META: Record<
  PublishMode,
  StatusMeta & { description: string }
> = {
  AUTOMATISCH: {
    label: "Automatisch",
    tone: "live",
    description:
      "Sobald alle Voraussetzungen erfüllt sind, geht das Angebot ohne Rückfrage online.",
  },
  VORSCHLAG: {
    label: "Vorschlag",
    tone: "info",
    description:
      "Das System bereitet das Inserat vollständig vor und legt es zur Freigabe. Ein Klick stellt es ein.",
  },
  MANUELL: {
    label: "Manuell",
    tone: "neutral",
    description:
      "Kein Vorschlag, keine Automatik. Veröffentlicht wird nur auf ausdrückliche Anweisung.",
  },
}

export const PROPOSAL_STATUS_META: Record<ProposalStatus, StatusMeta> = {
  OFFEN: { label: "Wartet auf Freigabe", tone: "warn" },
  FREIGEGEBEN: { label: "Freigegeben", tone: "ready" },
  ABGELEHNT: { label: "Abgelehnt", tone: "neutral" },
}

/* ------------------------------------------------------------------ */
/* Lagerbewegungen                                                     */
/* ------------------------------------------------------------------ */

export const MOVEMENT_TYPE_META: Record<MovementType, StatusMeta> = {
  ZUGANG: {
    label: "Zugang",
    tone: "ready",
    hint: "Einkauf oder Lieferung.",
  },
  AUSSCHLACHTUNG: {
    label: "Ausschlachtung",
    tone: "info",
    hint: "Teil aus einem zerlegten Gerät.",
  },
  VERKAUF: { label: "Verkauf", tone: "done", hint: "Abgang durch Verkauf." },
  VERBRAUCH: {
    label: "Verbrauch",
    tone: "progress",
    hint: "In eine Reparatur eingebaut.",
  },
  KORREKTUR: {
    label: "Korrektur",
    tone: "warn",
    hint: "Abweichung bei der Zählung, mit Begründung gebucht.",
  },
  UMLAGERUNG: {
    label: "Umlagerung",
    tone: "neutral",
    hint: "Anderer Lagerplatz, gleiche Menge.",
  },
  VERLUST: {
    label: "Verlust",
    tone: "error",
    hint: "Bruch, Diebstahl oder Entsorgung.",
  },
}

export const TEARDOWN_DISTRIBUTION_META: Record<
  TeardownDistribution,
  StatusMeta & { description: string }
> = {
  GLEICH: {
    label: "Gleichmäßig",
    tone: "neutral",
    description:
      "Der Einkaufswert wird durch die Stückzahl geteilt. Schnell, aber ein Display bekommt denselben Wert wie eine Schraube.",
  },
  NACH_WERT: {
    label: "Nach Marktwert",
    tone: "info",
    description:
      "Verteilung im Verhältnis der geschätzten Marktwerte. Teure Teile tragen mehr vom Einkauf — die ehrlichste Rechnung.",
  },
  MANUELL: {
    label: "Manuell",
    tone: "warn",
    description: "Einstandswert je Teil selbst eintragen.",
  },
}

/* ------------------------------------------------------------------ */
/* Kunden und Verkauf                                                  */
/* ------------------------------------------------------------------ */

export const CUSTOMER_SOURCE_META: Record<
  CustomerSource,
  { label: string; hint: string }
> = {
  UNBEKANNT: { label: "Nicht erfasst", hint: "Herkunft wurde nicht erfragt." },
  WEBSITE: {
    label: "Website / Shop",
    hint: "Direkt über die eigene Seite oder den Shopify-Store.",
  },
  GOOGLE: { label: "Google", hint: "Suche, Maps oder Google-Anzeige." },
  EBAY: { label: "eBay", hint: "Über ein eBay-Angebot gefunden." },
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
  EBAY: { label: "eBay" },
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
  NEU: { label: "Neu", tone: "ready" },
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

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  ARTIKEL: "Artikel",
  BESTAND: "Bestand",
  AUSSCHLACHTUNG: "Ausschlachtung",
  PRUEFUNG: "Prüfung",
  AUFBEREITUNG: "Aufbereitung",
  BILDER: "Bilder",
  KANAL: "Kanal",
  VERKAUF: "Verkauf",
  SYNC: "Sync",
  IMPORT: "Import",
  KATEGORIE: "Bereiche",
  SYSTEM: "System",
}

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */

export function getListing(unit: ArticleUnit, channel: Channel) {
  return unit.listings.find((listing) => listing.channel === channel)
}

/** Ist das Gerät auf mindestens einem Kanal aktiv inseriert? */
export function isListed(item: { listings: { status: ListingStatus }[] }): boolean {
  return item.listings.some((listing) => listing.status === "VEROEFFENTLICHT")
}
