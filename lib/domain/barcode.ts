/**
 * Code 128 als Balkenfolge.
 *
 * Etiketten sind der fehlende Schritt zwischen Bildschirm und Regal: Ohne
 * Barcode wird jede Nummer abgetippt, und abgetippt wird sie irgendwann
 * falsch. Ein Handscanner tippt sie in Millisekunden und fehlerfrei — er
 * verhält sich wie eine Tastatur, deshalb braucht es dafür keine
 * Geräteanbindung, nur ein Feld, das zuhört.
 *
 * Bewusst ohne Bibliothek: Code 128 ist eine Tabelle mit 107 Zeilen und eine
 * Prüfsumme. Eine Abhängigkeit dafür wäre mehr Wartung als der Code selbst.
 *
 * Warum Code 128 und nicht QR: Ein Etikett am Regalfach wird quer und aus
 * einem Meter Abstand gelesen, oft mit einem einfachen Laserscanner. Der
 * liest Striche, keine Quadrate. Und die Nummern hier sind kurz genug, dass
 * der Strichcode schmal bleibt.
 *
 * Kodiert wird durchgehend im Zeichensatz B, auch bei langen Ziffernfolgen.
 * Der Zeichensatz C könnte Ziffernpaare zu je einem Symbol zusammenfassen und
 * das Etikett um ein Fünftel schmaler machen — für Nummern dieser Länge ist
 * das den doppelten Zustandsautomaten nicht wert. Gelesen wird beides gleich.
 *
 * Die Symboltabelle ist gegen `bwip-js` geprüft: Für Eingaben ohne lange
 * Ziffernfolge stimmt die Modulfolge Strich für Strich überein.
 */

/**
 * Strichbreiten je Symbol. Jede Zeile beschreibt abwechselnd Balken und
 * Lücken, beginnend mit einem Balken: „212222" heißt zwei Module Balken,
 * ein Modul Lücke, zwei Balken, zwei Lücken, zwei Balken, zwei Lücken.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
]

/** Start-Symbol des Zeichensatzes B — Groß-, Kleinbuchstaben und Ziffern. */
const START_B = 104
const STOP = 106

/**
 * Ein Streifen: Breite in Modulen, Balken oder Lücke.
 *
 * Bewusst nicht schon als SVG: Wie breit ein Modul gezeichnet wird, hängt
 * vom Etikett ab, nicht von der Kodierung.
 */
export interface BarcodeModule {
  width: number
  bar: boolean
}

export interface Barcode {
  /** Der kodierte Text, so wie er unter dem Strichcode steht. */
  value: string
  modules: BarcodeModule[]
  /** Gesamtbreite in Modulen — Grundlage für die Skalierung. */
  totalWidth: number
}

/**
 * Kodiert Text als Code 128 B.
 *
 * Zeichen außerhalb von ASCII 32–126 gibt es in Artikel- und Stücknummern
 * nicht; sollte doch eines auftauchen, wird es übersprungen statt still
 * verfälscht — ein Etikett, das etwas anderes trägt als draufsteht, ist
 * schlimmer als keins.
 */
export function encodeCode128(input: string): Barcode {
  const chars = [...input].filter((char) => {
    const code = char.codePointAt(0) ?? 0
    return code >= 32 && code <= 126
  })
  const value = chars.join("")

  const values = [START_B, ...chars.map((char) => char.charCodeAt(0) - 32)]

  // Prüfsumme: Startwert plus jedes Zeichen mit seiner Position gewichtet.
  let checksum = START_B
  chars.forEach((char, index) => {
    checksum += (char.charCodeAt(0) - 32) * (index + 1)
  })
  values.push(checksum % 103, STOP)

  const modules: BarcodeModule[] = []
  for (const symbol of values) {
    const pattern = PATTERNS[symbol]
    for (let index = 0; index < pattern.length; index += 1) {
      modules.push({
        width: Number.parseInt(pattern[index], 10),
        // Muster beginnen immer mit einem Balken, danach wechselt es.
        bar: index % 2 === 0,
      })
    }
  }

  return {
    value,
    modules,
    totalWidth: modules.reduce((sum, entry) => sum + entry.width, 0),
  }
}

/**
 * Rechtecke für die Darstellung im SVG.
 *
 * Ruhezone von zehn Modulen links und rechts: Ohne sie findet der Scanner
 * den Anfang nicht — der häufigste Grund, warum ein selbst gedrucktes
 * Etikett nicht gelesen wird.
 */
export const QUIET_ZONE = 10

export function barcodeRects(
  barcode: Barcode
): { x: number; width: number }[] {
  const rects: { x: number; width: number }[] = []
  let x = QUIET_ZONE

  for (const entry of barcode.modules) {
    if (entry.bar) rects.push({ x, width: entry.width })
    x += entry.width
  }
  return rects
}

/** Gesamtbreite inklusive beider Ruhezonen. */
export function barcodeWidth(barcode: Barcode): number {
  return barcode.totalWidth + QUIET_ZONE * 2
}
