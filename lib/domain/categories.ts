/**
 * Der Kategoriebaum — die Struktur, die der Betrieb selbst anlegt.
 *
 * Eine Kategorie ist mehr als eine Schublade: Sie trägt die Voreinstellungen,
 * die jeder Artikel darin erbt. Wer "Ersatzteile › Elektrik › Displays"
 * anlegt und dort Nummernpräfix, Meldebestand und Verkaufskanal einmal setzt,
 * muss das an keinem einzelnen Display mehr entscheiden.
 *
 * Vererbung entlang des Pfades:
 *  - Skalare Einstellungen: der unterste gesetzte Wert gewinnt.
 *  - Merkmalsfelder: sammeln sich an. "Ersatzteile" definiert `zustandsnote`,
 *    "Reifen" ergänzt `zoll` — ein Reifen hat beide. Gleiche Schlüssel
 *    überschreibt die tiefere Ebene.
 */

import type {
  AttributeDefinition,
  Category,
  ResolvedCategorySettings,
  StockMode,
} from "./types"

export const CATEGORY_PATH_SEPARATOR = " › "

/** Kinder einer Kategorie, in Anzeigereihenfolge. */
export function childrenOf(
  categories: Category[],
  parentId: string | null
): Category[] {
  return categories
    .filter((category) => category.parentId === parentId)
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "de")
    )
}

/**
 * Pfad von der Wurzel bis zur Kategorie, inklusive dieser selbst.
 *
 * Die Tiefenbegrenzung ist kein Stilmittel: Ein durch einen fehlerhaften
 * Import entstandener Zyklus würde die Anwendung sonst einfrieren, und zwar
 * ohne Fehlermeldung.
 */
export function categoryPath(
  categories: Category[],
  categoryId: string | null
): Category[] {
  const path: Category[] = []
  const seen = new Set<string>()
  let current = categories.find((category) => category.id === categoryId)

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId
      ? categories.find((category) => category.id === current!.parentId)
      : undefined
  }

  return path
}

export function categoryPathLabel(
  categories: Category[],
  categoryId: string | null
): string {
  return categoryPath(categories, categoryId)
    .map((category) => category.name)
    .join(CATEGORY_PATH_SEPARATOR)
}

/** Alle Nachfahren einer Kategorie, ohne sie selbst. */
export function descendantsOf(
  categories: Category[],
  categoryId: string
): Category[] {
  const result: Category[] = []
  const queue = [categoryId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    for (const child of childrenOf(categories, currentId)) {
      result.push(child)
      queue.push(child.id)
    }
  }

  return result
}

/** Kategorie-IDs eines Teilbaums, inklusive Wurzel — für Filter. */
export function subtreeIds(
  categories: Category[],
  categoryId: string
): Set<string> {
  return new Set([
    categoryId,
    ...descendantsOf(categories, categoryId).map((category) => category.id),
  ])
}

/**
 * Fasst die geerbten Einstellungen einer Kategorie zusammen.
 *
 * Genau eine Stelle im System beantwortet "was gilt hier eigentlich" — sonst
 * beantwortet es jede Ansicht anders.
 */
export function resolveCategorySettings(
  categories: Category[],
  categoryId: string | null
): ResolvedCategorySettings {
  const path = categoryPath(categories, categoryId)
  const leaf = path[path.length - 1]

  const attributes = mergeAttributes(path)

  return {
    categoryId: leaf?.id ?? "",
    path,
    pathLabel: path.map((category) => category.name).join(CATEGORY_PATH_SEPARATOR),
    numberPrefix: lastSet(path, (c) => c.numberPrefix || null) ?? "ART",
    stockMode: leaf?.stockMode ?? "MENGE",
    attributes,
    reorderLevel: lastSet(path, (c) => c.reorderLevel),
    defaultChannel: lastSet(path, (c) => c.defaultChannel),
    publishMode: lastSet(path, (c) => c.publishMode) ?? "VORSCHLAG",
    requiresInspection: lastSet(path, (c) => c.requiresInspection) ?? false,
  }
}

/** Der unterste gesetzte Wert entlang des Pfades gewinnt. */
function lastSet<T>(
  path: Category[],
  read: (category: Category) => T | null | undefined
): T | null {
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const value = read(path[index])
    if (value !== null && value !== undefined) return value
  }
  return null
}

/** Merkmalsfelder aller Ebenen, Wurzel zuerst, tiefere Ebene überschreibt. */
function mergeAttributes(path: Category[]): AttributeDefinition[] {
  const byKey = new Map<string, AttributeDefinition>()
  for (const category of path) {
    for (const attribute of category.attributes) {
      byKey.set(attribute.key, attribute)
    }
  }
  return [...byKey.values()]
}

/* ------------------------------------------------------------------ */
/* Anlegen und Prüfen                                                  */
/* ------------------------------------------------------------------ */

export interface CategoryValidationInput {
  id?: string
  parentId: string | null
  name: string
  numberPrefix: string
  stockMode: StockMode
}

/**
 * Prüft, ob eine Kategorie so angelegt oder geändert werden darf.
 *
 * Gibt eine Meldung zurück oder `null`, wenn alles in Ordnung ist. Bewusst als
 * reine Funktion: Die Oberfläche zeigt damit denselben Text an, den die
 * Datenschicht beim Speichern durchsetzt.
 */
export function validateCategory(
  categories: Category[],
  input: CategoryValidationInput
): string | null {
  const name = input.name.trim()
  if (!name) return "Der Bereich braucht einen Namen."

  const prefix = input.numberPrefix.trim().toUpperCase()
  if (!prefix) return "Ohne Nummernpräfix lassen sich keine Artikelnummern vergeben."
  if (!/^[A-Z0-9-]{1,12}$/.test(prefix)) {
    return "Das Präfix darf nur Großbuchstaben, Ziffern und Bindestriche enthalten (max. 12 Zeichen)."
  }

  const siblings = childrenOf(categories, input.parentId).filter(
    (category) => category.id !== input.id
  )
  if (
    siblings.some(
      (category) => category.name.toLowerCase() === name.toLowerCase()
    )
  ) {
    return `Auf dieser Ebene gibt es „${name}“ bereits.`
  }

  const prefixOwner = categories.find(
    (category) =>
      category.id !== input.id &&
      category.numberPrefix.toUpperCase() === prefix
  )
  if (prefixOwner) {
    return `Das Präfix „${prefix}“ gehört bereits zu „${prefixOwner.name}“.`
  }

  // Eine Kategorie unter sich selbst hängen erzeugt eine Schleife, aus der
  // weder Pfadauflösung noch Oberfläche wieder herausfinden.
  if (input.id && input.parentId) {
    const forbidden = subtreeIds(categories, input.id)
    if (forbidden.has(input.parentId)) {
      return "Ein Bereich kann nicht unter sich selbst einsortiert werden."
    }
  }

  return null
}

/**
 * Darf die Bestandsart einer Kategorie noch geändert werden?
 *
 * Sobald Artikel darin liegen: nein. Aus 40 Bremsbelägen würden sonst 40
 * einzeln zu prüfende Geräte — der Bestand wäre auf einen Schlag bedeutungslos.
 */
export function canChangeStockMode(articleCount: number): boolean {
  return articleCount === 0
}

/** Vorschlag für ein Präfix aus dem Namen: "Displays" → "DISP". */
export function suggestPrefix(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[ÄÖÜ]/g, (m) => ({ Ä: "AE", Ö: "OE", Ü: "UE" })[m] ?? m)
    .replace(/[^A-Z0-9]/g, "")
  return cleaned.slice(0, 4) || "ART"
}

/** Baumdarstellung für Auswahlfelder: Einrückung über die Tiefe. */
export interface CategoryOption {
  id: string
  label: string
  depth: number
  stockMode: StockMode
  /** Nur Blätter nehmen Artikel auf — Zwischenebenen sind reine Struktur. */
  hasChildren: boolean
}

export function categoryOptions(categories: Category[]): CategoryOption[] {
  const options: CategoryOption[] = []

  const walk = (parentId: string | null, depth: number) => {
    for (const category of childrenOf(categories, parentId)) {
      const children = childrenOf(categories, category.id)
      options.push({
        id: category.id,
        label: category.name,
        depth,
        stockMode: category.stockMode,
        hasChildren: children.length > 0,
      })
      walk(category.id, depth + 1)
    }
  }

  walk(null, 0)
  return options
}
