/**
 * Clientseitiger CSV-/TSV-Parser für den Import-Wizard.
 *
 * Bewusst ohne externe Bibliothek: Der Funktionsumfang, den Lieferantenlisten
 * brauchen (Trennzeichen-Erkennung, Anführungszeichen, mehrzeilige Felder,
 * BOM), ist überschaubar. XLSX kommt erst mit der echten Avides-Anbindung
 * dazu — bis dahin weist die Oberfläche auf den CSV-Export hin.
 */

import type { ParsedTable } from "./types"

const DELIMITERS = [";", ",", "\t", "|"] as const

/**
 * Rät das Trennzeichen anhand der Kopfzeile. Deutsche Exporte nutzen
 * überwiegend Semikolon, weil das Komma als Dezimaltrenner belegt ist.
 */
function detectDelimiter(sample: string): string {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? ""
  let best = ";"
  let bestCount = 0

  for (const delimiter of DELIMITERS) {
    const count = firstLine.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/** Zerlegt den gesamten Text in Zellen. Beachtet Felder in Anführungszeichen. */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (char !== "\r") {
      field += char
    }
  }

  // Letztes Feld/letzte Zeile nur übernehmen, wenn wirklich Inhalt da ist.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

export interface ParseOptions {
  fileName: string
}

export function parseDelimitedText(
  raw: string,
  options: ParseOptions
): ParsedTable {
  const text = raw.replace(/^﻿/, "") // BOM entfernen
  const delimiter = detectDelimiter(text)
  const rows = parseRows(text, delimiter).filter((row) =>
    row.some((cell) => cell.trim() !== "")
  )

  if (rows.length === 0) {
    return { fileName: options.fileName, headers: [], rows: [] }
  }

  const rawHeaders = rows[0].map((header) => header.trim())
  // Leere oder doppelte Kopfzellen bekommen einen stabilen Ersatznamen,
  // sonst überschreiben sich Spalten beim Mapping gegenseitig.
  const seen = new Map<string, number>()
  const headers = rawHeaders.map((header, index) => {
    const base = header === "" ? `Spalte ${index + 1}` : header
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })

  const dataRows = rows.slice(1).map((cells) =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        neutralizeFormula((cells[index] ?? "").trim()),
      ])
    )
  )

  return { fileName: options.fileName, headers, rows: dataRows }
}

/**
 * Entschärft Zellen, die in einer Tabellenkalkulation als Formel gelesen
 * würden.
 *
 * Ein Lieferant kann in einer Bemerkungsspalte `=IMPORTXML(...)` liefern.
 * Der Wert wandert bei uns über Hersteller, Modell und Notiz bis in die
 * Google-Umsatztabelle und würde dort ausgewertet — mit Zugriff auf fremde
 * Domains. Deshalb wird das führende Zeichen hier einmal zentral neutralisiert,
 * bevor der Wert überhaupt ins System gelangt.
 *
 * Der echte Sheets-Adapter muss zusätzlich `valueInputOption: "RAW"` setzen.
 */
export function neutralizeFormula(value: string): string {
  if (!/^[=+\-@\t\r]/.test(value)) return value
  // Ein negativer Betrag ist keine Formel — sonst wären Gutschriften und
  // Minusmengen in Lieferantenlisten nicht mehr lesbar.
  if (/^-?[\d.,\s]+$/.test(value)) return value
  return `'${value}`
}

export async function parseFile(file: File): Promise<ParsedTable> {
  const name = file.name.toLowerCase()

  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    throw new Error(
      "XLSX wird im Prototyp noch nicht gelesen. Bitte die Datei als CSV exportieren."
    )
  }

  const text = await file.text()
  const table = parseDelimitedText(text, { fileName: file.name })

  if (table.headers.length === 0) {
    throw new Error("Die Datei enthält keine lesbare Kopfzeile.")
  }

  return table
}

/* ------------------------------------------------------------------ */
/* Heuristik für das Spalten-Mapping                                   */
/* ------------------------------------------------------------------ */

import type { ImportTargetField } from "@/lib/domain/types"

/**
 * Vorschläge, welche Quellspalte zu welchem Zielfeld passen könnte.
 *
 * Das ist ausdrücklich nur ein Vorschlag: Der Nutzer bestätigt das Mapping im
 * Assistenten. Es wird kein bestimmtes Lieferantenformat vorausgesetzt.
 */
const FIELD_HINTS: Record<ImportTargetField, string[]> = {
  name: ["bezeichnung", "artikelname", "produkt", "modell", "model", "titel", "name"],
  manufacturer: ["hersteller", "marke", "brand", "manufacturer"],
  mpn: ["teilenummer", "artikelnummer", "artnr", "art-nr", "mpn", "herstellernummer", "sku"],
  ean: ["ean", "gtin", "barcode"],
  serialNumber: ["serien", "serial", "sn", "imei", "geräte"],
  variant: ["variante", "ausfuehrung", "ausführung", "version"],
  color: ["farbe", "color", "colour"],
  quantity: ["menge", "anzahl", "stück", "stueck", "qty", "quantity", "bestand"],
  purchasePriceCents: ["ek", "einkauf", "purchase", "cost", "netto"],
  salePriceCents: ["vk", "verkauf", "uvp", "preis", "price", "retail"],
  mileageKm: ["laufleistung", "kilometer", "km", "mileage"],
  condition: ["zustand", "condition", "grade", "klasse"],
  purchaseDate: ["datum", "date", "liefer", "eingang", "beleg"],
  location: ["lager", "regal", "platz", "fach", "location", "bin"],
  notes: ["bemerkung", "notiz", "note", "kommentar", "hinweis"],
}

/**
 * Findet zu jedem Zielfeld die wahrscheinlichste Spalte.
 *
 * `targets` nimmt beliebige Schlüssel entgegen, damit auch die frei
 * definierten Merkmalsfelder einer Kategorie (`attr:zoll`) zugeordnet werden
 * können. Für die gibt es keine Stichwortliste — dort greift der Vergleich
 * über den mitgegebenen Anzeigenamen.
 */
export function suggestMapping(
  headers: string[],
  targets: readonly string[],
  labels: Record<string, string> = {}
): Record<string, string> {
  const used = new Set<string>()
  const result: Record<string, string> = {}

  for (const target of targets) {
    const label = labels[target]
    const hints =
      FIELD_HINTS[target as ImportTargetField] ??
      (label ? [label.toLowerCase()] : [])

    const match = headers.find((header) => {
      if (used.has(header)) return false
      const normalized = header.toLowerCase()
      // Nummernspalten sind nie ein Namens-, Hersteller- oder Farbfeld.
      if (
        normalized.includes("nummer") &&
        !["serialNumber", "mpn", "ean"].includes(target)
      ) {
        return false
      }
      return hints.some((hint) => hint.length > 1 && normalized.includes(hint))
    })

    result[target] = match ?? ""
    if (match) used.add(match)
  }

  return result
}
