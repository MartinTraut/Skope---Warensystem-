/**
 * Ausschlachtung — das Zerlegen eines Spendergeräts in Ersatzteile.
 *
 * Der Vorgang, der im alten Modell fehlte und genau dort die Übersicht
 * gekostet hat: Ein ausgeschlachteter Scooter verschwand still aus dem
 * Bestand, die Teile tauchten ohne Herkunft und ohne Einstandswert auf. Jede
 * spätere Marge auf ein solches Teil wäre erfunden gewesen.
 *
 * Hier bekommt jedes entnommene Teil einen Anteil am Einkaufswert des
 * Spenders. Was nicht zugeordnet wird — Schrott, Restrahmen, Rundung — bleibt
 * als `scrapValueCents` sichtbar stehen, statt sich stillschweigend in die
 * Teilepreise zu mischen.
 */

import { createId } from "./numbering"
import type {
  ArticleUnit,
  Teardown,
  TeardownDistribution,
  TeardownLine,
} from "./types"

/** Der zu verteilende Betrag: was das Gerät insgesamt gekostet hat. */
export function teardownSourceValue(unit: ArticleUnit): number {
  return (
    unit.purchasePriceCents +
    unit.additionalCostsCents +
    unit.repairs.reduce((sum, repair) => sum + repair.partCostCents, 0)
  )
}

export function createTeardownLine(articleId: string): TeardownLine {
  return {
    id: createId("tdl"),
    articleId,
    quantity: 1,
    marketValueCents: null,
    valueShareCents: 0,
    locationId: null,
    note: "",
  }
}

/**
 * Verteilt den Wert des Spenders auf die Zeilen.
 *
 * Liefert neue Zeilen mit gesetztem `valueShareCents` (Einstandswert **je
 * Stück**) und den nicht zugeordneten Rest. Bewusst als reine Funktion: Die
 * Oberfläche rechnet live mit, die Datenschicht bucht mit demselben Ergebnis.
 */
export function distributeTeardownValue(
  sourceValueCents: number,
  lines: TeardownLine[],
  distribution: TeardownDistribution
): { lines: TeardownLine[]; scrapValueCents: number } {
  const usable = lines.filter((line) => line.quantity > 0)
  const totalPieces = usable.reduce((sum, line) => sum + line.quantity, 0)

  if (totalPieces === 0) {
    return { lines, scrapValueCents: sourceValueCents }
  }

  let next: TeardownLine[]

  if (distribution === "MANUELL") {
    next = lines
  } else if (distribution === "GLEICH") {
    // Abrunden, nicht runden: Aufrunden verteilt mehr Wert, als das Gerät
    // gekostet hat, und erzeugt einen negativen Rest.
    const perPiece = Math.floor(sourceValueCents / totalPieces)
    next = lines.map((line) =>
      line.quantity > 0 ? { ...line, valueShareCents: perPiece } : line
    )
  } else {
    const weights = usable.map(
      (line) => (line.marketValueCents ?? 0) * line.quantity
    )
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

    if (totalWeight <= 0) {
      // Ohne Marktwerte ist "nach Wert" nicht berechenbar. Statt still auf
      // null zu setzen, fällt die Verteilung sichtbar auf "gleich" zurück.
      return distributeTeardownValue(sourceValueCents, lines, "GLEICH")
    }

    next = lines.map((line) => {
      if (line.quantity <= 0) return line
      const weight = (line.marketValueCents ?? 0) * line.quantity
      const share = Math.floor((sourceValueCents * weight) / totalWeight)
      return { ...line, valueShareCents: Math.floor(share / line.quantity) }
    })
  }

  const assigned = next.reduce(
    (sum, line) => sum + line.valueShareCents * Math.max(0, line.quantity),
    0
  )

  return { lines: next, scrapValueCents: sourceValueCents - assigned }
}

/**
 * Prüft, ob eine Ausschlachtung gebucht werden darf.
 *
 * Gibt eine Meldung zurück oder `null`. Die Regeln stehen hier und nicht im
 * Formular, damit sie auch beim Buchen greifen.
 */
export function validateTeardown(input: {
  lines: TeardownLine[]
  sourceValueCents: number
  scrapValueCents: number
}): string | null {
  const usable = input.lines.filter((line) => line.quantity > 0)
  if (usable.length === 0) {
    return "Ohne mindestens ein entnommenes Teil gibt es nichts zu buchen."
  }
  if (usable.some((line) => !line.articleId)) {
    return "Jede Zeile braucht einen Zielartikel."
  }
  if (usable.some((line) => line.valueShareCents < 0)) {
    return "Ein Einstandswert kann nicht negativ sein."
  }
  if (input.scrapValueCents < 0) {
    return `Es sind ${formatOverrun(-input.scrapValueCents)} mehr verteilt, als der Spender gekostet hat.`
  }
  return null
}

function formatOverrun(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`
}

/** Anteil des Spenderwerts, der als Schrott abgeschrieben wird. */
export function scrapShare(teardown: Teardown): number {
  if (teardown.sourceValueCents <= 0) return 0
  return teardown.scrapValueCents / teardown.sourceValueCents
}

/** Gesamtzahl entnommener Teile. */
export function teardownPieceCount(teardown: Teardown): number {
  return teardown.lines.reduce((sum, line) => sum + Math.max(0, line.quantity), 0)
}
