/**
 * Veröffentlichung: welcher Kanal, wann bereit, und was genau im Inserat steht.
 *
 * Leitgedanke ist „so wenig Knöpfe wie möglich, aber kein Blindflug":
 * Das System entscheidet den Kanal selbst (aus der Kategorie), prüft die
 * Voraussetzungen selbst und baut das Inserat selbst fertig. Übrig bleibt
 * eine Freigabe — ein Klick, mit allem Sichtbaren davor.
 *
 * Fehlt etwas, wird das Inserat nicht still übersprungen: Der fehlende Punkt
 * steht in der Bereitschaftsprüfung und ist damit abarbeitbar.
 */

import { articleLabel, mergedAttributes, unitLabel } from "./article-factory"
import { createId } from "./numbering"
import type {
  Article,
  ArticleUnit,
  Channel,
  Condition,
  PublicationProposal,
  PublishMode,
  ResolvedCategorySettings,
  StockLevel,
} from "./types"

/* ------------------------------------------------------------------ */
/* Kanalwahl                                                           */
/* ------------------------------------------------------------------ */

/** Auf welchem Kanal landet dieser Artikel? Artikel schlägt Kategorie. */
export function resolveChannel(
  article: Article,
  settings: ResolvedCategorySettings
): Channel | null {
  return article.channelOverride ?? settings.defaultChannel
}

export function resolvePublishMode(
  article: Article,
  settings: ResolvedCategorySettings
): PublishMode {
  return article.publishModeOverride ?? settings.publishMode
}

/* ------------------------------------------------------------------ */
/* Bereitschaft                                                        */
/* ------------------------------------------------------------------ */

export interface ReadinessCheck {
  ok: boolean
  label: string
  hint: string
  /** Wohin führt der Weg, um den Punkt zu erledigen? */
  fix?: string
}

/**
 * Darf dieser Mengenartikel inseriert werden?
 *
 * Deutlich weniger Punkte als bei einem Gerät — ein Bremsbelag durchläuft
 * keine Prüfung und keine Reinigung.
 */
export function evaluateArticleReadiness(
  article: Article,
  stock: StockLevel,
  settings: ResolvedCategorySettings
): ReadinessCheck[] {
  const missingAttributes = settings.attributes
    .filter((definition) => definition.required)
    .filter((definition) => !article.attributes[definition.key]?.trim())

  return [
    {
      ok: stock.quantity > 0,
      label: "Bestand vorhanden",
      hint:
        stock.quantity > 0
          ? `${stock.quantity} Stück auf Bestand.`
          : "Ohne Bestand darf nichts angeboten werden.",
      fix: "Zugang buchen",
    },
    {
      ok: article.salePriceCents !== null && article.salePriceCents > 0,
      label: "Verkaufspreis gesetzt",
      hint: "Ohne Preis kann nicht veröffentlicht werden.",
      fix: "Preis eintragen",
    },
    {
      ok: article.images.length > 0,
      label: "Mindestens ein Bild",
      hint: "Ein Angebot ohne Bild wird auf keinem Marktplatz gefunden.",
      fix: "Bild hochladen",
    },
    {
      ok: article.name.trim().length >= 3,
      label: "Aussagekräftiger Name",
      hint: "Der Name wird zur Überschrift des Inserats.",
    },
    {
      ok: missingAttributes.length === 0,
      label: "Pflichtmerkmale gefüllt",
      hint:
        missingAttributes.length > 0
          ? `Es fehlt: ${missingAttributes.map((a) => a.label).join(", ")}.`
          : "Alle Pflichtangaben der Kategorie sind gefüllt.",
      fix: "Merkmale ergänzen",
    },
    {
      ok: article.archivedAt === null,
      label: "Artikel aktiv",
      hint: "Archivierte Artikel werden nicht angeboten.",
    },
  ]
}

/** Darf dieses Gerät verkaufsbereit gesetzt bzw. veröffentlicht werden? */
export function evaluateUnitReadiness(
  unit: ArticleUnit,
  settings: ResolvedCategorySettings
): ReadinessCheck[] {
  const problems = unit.inspection.checks.filter(
    (check) => check.result === "PROBLEM"
  )
  const openRepairs = unit.repairs.filter((repair) => repair.status !== "ERLEDIGT")

  const checks: ReadinessCheck[] = []

  if (settings.requiresInspection) {
    checks.push(
      {
        ok: unit.inspection.completedAt !== null,
        label: "Prüfung abgeschlossen",
        hint: "Das Prüfprotokoll muss bewusst abgeschlossen worden sein.",
        fix: "Prüfung abschließen",
      },
      {
        ok: problems.length === 0,
        label: "Keine offenen Prüfmängel",
        hint:
          problems.length > 0
            ? `${problems.length} Prüfpunkt(e) mit Problem.`
            : "Alle Prüfpunkte ohne Beanstandung.",
        fix: "Mängel beheben",
      }
    )
  }

  checks.push(
    {
      ok: openRepairs.length === 0,
      label: "Reparaturen erledigt",
      hint:
        openRepairs.length > 0
          ? `${openRepairs.length} Reparatur(en) noch offen.`
          : "Keine offenen Reparaturen.",
      fix: "Aufbereitung abschließen",
    },
    {
      ok: unit.cleaning.done,
      label: "Reinigung erledigt",
      hint: "Das Gerät muss gereinigt sein.",
      fix: "Reinigung eintragen",
    },
    {
      ok: unit.salePriceCents !== null && unit.salePriceCents > 0,
      label: "Verkaufspreis gesetzt",
      hint: "Ohne Preis kann nicht veröffentlicht werden.",
      fix: "Preis eintragen",
    },
    {
      ok: unit.images.length > 0,
      label: "Mindestens ein Bild",
      hint: "Für die Veröffentlichung wird mindestens ein Produktbild benötigt.",
      fix: "Bild hochladen",
    }
  )

  if (settings.requiresInspection) {
    checks.push({
      ok: unit.documents.abe,
      label: "ABE vorhanden",
      hint: "Ohne Betriebserlaubnis ist das Gerät im Straßenverkehr nicht nutzbar.",
      fix: "Papiere erfassen",
    })
  }

  return checks
}

export function isReady(checks: ReadinessCheck[]): boolean {
  return checks.every((check) => check.ok)
}

export function openChecks(checks: ReadinessCheck[]): ReadinessCheck[] {
  return checks.filter((check) => !check.ok)
}

/* ------------------------------------------------------------------ */
/* Inseratstext                                                        */
/* ------------------------------------------------------------------ */

/**
 * Titellänge.
 *
 * eBay erlaubt 80 Zeichen. Ein abgeschnittener Titel wirkt unseriös und
 * kostet Klicks, deshalb wird an der Wortgrenze gekürzt, nicht mitten drin.
 */
const TITLE_LIMIT = 80

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value
  const cut = value.slice(0, limit)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()
}

const CONDITION_TEXT: Record<Condition, string> = {
  NEU: "Neu",
  WIE_NEU: "Wie neu",
  SEHR_GUT: "Sehr guter Zustand",
  GUT: "Guter Zustand",
  GEBRAUCHT: "Gebraucht",
  DEFEKT: "Defekt / Bastlerware",
}

export interface ListingContent {
  title: string
  description: string
  attributeLines: string[]
  imageUrls: string[]
  priceCents: number
  quantity: number
}

/** Baut den Inseratsinhalt für einen Mengenartikel. */
export function buildArticleListing(
  article: Article,
  stock: StockLevel,
  settings: ResolvedCategorySettings
): ListingContent {
  const attributeLines = formatAttributes(settings, article.attributes)

  const title = truncateAtWord(
    [articleLabel(article), article.mpn && `(${article.mpn})`]
      .filter(Boolean)
      .join(" "),
    TITLE_LIMIT
  )

  const description = [
    article.description.trim(),
    attributeLines.length > 0 ? attributeLines.join("\n") : "",
    `Zustand: ${CONDITION_TEXT[article.condition]}`,
    article.mpn ? `Herstellernummer: ${article.mpn}` : "",
    `Artikelnummer: ${article.sku}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return {
    title,
    description,
    attributeLines,
    imageUrls: sortedImageUrls(article.images),
    priceCents: article.salePriceCents ?? 0,
    quantity: stock.quantity,
  }
}

/** Baut den Inseratsinhalt für ein Einzelstück. */
export function buildUnitListing(
  article: Article,
  unit: ArticleUnit,
  settings: ResolvedCategorySettings
): ListingContent {
  const values = mergedAttributes(article, unit)
  const attributeLines = formatAttributes(settings, values)

  const title = truncateAtWord(
    [
      unitLabel(article, unit),
      unit.color,
      CONDITION_TEXT[unit.condition],
      unit.mileageKm > 0 ? `${unit.mileageKm} km` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    TITLE_LIMIT
  )

  const description = [
    unit.description.trim() || article.description.trim(),
    attributeLines.length > 0 ? attributeLines.join("\n") : "",
    [
      `Zustand: ${CONDITION_TEXT[unit.condition]}`,
      unit.mileageKm > 0 ? `Laufleistung: ${unit.mileageKm} km` : "",
      unit.documents.abe ? "ABE / Betriebserlaubnis liegt bei" : "",
      unit.cleaning.done ? "Gereinigt und aufbereitet" : "",
      unit.inspection.completedAt ? "Technisch geprüft" : "",
    ]
      .filter(Boolean)
      .join("\n"),
    `Gerätenummer: ${unit.unitNumber}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return {
    title,
    description,
    attributeLines,
    imageUrls: sortedImageUrls(
      unit.images.length > 0 ? unit.images : article.images
    ),
    priceCents: unit.salePriceCents ?? 0,
    quantity: 1,
  }
}

function sortedImageUrls(images: Article["images"]): string[] {
  return [...images]
    .sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) || a.sortOrder - b.sortOrder
    )
    .map((image) => image.url)
}

/** Merkmale als "Label: Wert Einheit" — genau die Zeilen, die eBay erwartet. */
function formatAttributes(
  settings: ResolvedCategorySettings,
  values: Record<string, string>
): string[] {
  return settings.attributes
    .map((definition) => {
      const value = values[definition.key]?.trim()
      if (!value) return null
      return `${definition.label}: ${value}${definition.unit ? ` ${definition.unit}` : ""}`
    })
    .filter((line): line is string => line !== null)
}

/* ------------------------------------------------------------------ */
/* Vorschläge                                                          */
/* ------------------------------------------------------------------ */

export function buildArticleProposal(
  article: Article,
  stock: StockLevel,
  settings: ResolvedCategorySettings,
  channel: Channel
): PublicationProposal {
  const content = buildArticleListing(article, stock, settings)
  return proposalFrom(content, {
    targetType: "ARTICLE",
    targetId: article.id,
    articleId: article.id,
    channel,
  })
}

export function buildUnitProposal(
  article: Article,
  unit: ArticleUnit,
  settings: ResolvedCategorySettings,
  channel: Channel
): PublicationProposal {
  const content = buildUnitListing(article, unit, settings)
  return proposalFrom(content, {
    targetType: "UNIT",
    targetId: unit.id,
    articleId: article.id,
    channel,
  })
}

function proposalFrom(
  content: ListingContent,
  target: Pick<
    PublicationProposal,
    "targetType" | "targetId" | "articleId" | "channel"
  >
): PublicationProposal {
  return {
    id: createId("prp"),
    createdAt: new Date().toISOString(),
    ...target,
    title: content.title,
    description: content.description,
    priceCents: content.priceCents,
    quantity: content.quantity,
    imageUrls: content.imageUrls,
    attributeLines: content.attributeLines,
    status: "OFFEN",
    decidedAt: null,
    decidedBy: null,
    note: "",
  }
}

/**
 * Der fertige Text zum Übernehmen — für Kanäle ohne Schnittstelle.
 *
 * eBay und Kleinanzeigen werden bewusst nicht automatisch bestückt: Für eBay
 * liegt kein Entwicklerzugang vor, für Kleinanzeigen gibt es keine
 * bestätigte Schnittstelle. Das Cockpit liefert stattdessen das vollständig
 * vorbereitete Inserat und führt den Status intern mit.
 */
export function proposalAsText(proposal: PublicationProposal): string {
  return [
    proposal.title,
    "",
    proposal.description,
    "",
    `Preis: ${(proposal.priceCents / 100).toFixed(2).replace(".", ",")} €`,
    proposal.quantity > 1 ? `Menge: ${proposal.quantity}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n")
}
