/**
 * Demo-Implementierungen der externen Systeme.
 *
 * Sie verhalten sich wie echte Integrationen: Latenz, Idempotenz, Fehlerfälle.
 * Was sie nicht tun, ist irgendetwas nach außen zu senden. Jeder Adapter ist
 * mit `isMock = true` gekennzeichnet, damit die Oberfläche das ehrlich anzeigt.
 */

import type { Sale } from "@/lib/domain/types"
import type {
  AdapterResult,
  ImportSource,
  ListingPayload,
  MarketplaceAdapter,
  ParsedTable,
  PublishResult,
  SheetsAdapter,
} from "./types"
import { fail, ok } from "./types"

/** Simulierte Netzwerklatenz, damit Ladezustände im Demo echt wirken. */
function delay(minMs: number, maxMs: number): Promise<void> {
  const duration = minMs + Math.random() * (maxMs - minMs)
  return new Promise((resolve) => setTimeout(resolve, duration))
}

/**
 * Die Demo-Fehlerschalter liegen im Store, den die Adapter nicht kennen sollen.
 * Deshalb bekommen sie eine Funktion injiziert, die den aktuellen Zustand liest.
 */
export interface MockControls {
  shouldFailShopify(): boolean
  shouldFailSheets(): boolean
  /**
   * Höchste bereits vergebene Zeilennummer der Umsatztabelle, aus dem
   * persistierten Bestand gelesen. Steht für die echte Tabelle, die den
   * Neustart der Anwendung überdauert.
   */
  highestSheetsRow?(): number
}

/* ------------------------------------------------------------------ */
/* Shopify                                                             */
/* ------------------------------------------------------------------ */

function shopifyNumericId(seed: string, salt: string): string {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 1_000_000_007
  }
  for (let index = 0; index < salt.length; index += 1) {
    hash = (hash * 17 + salt.charCodeAt(index)) % 1_000_000_007
  }
  return String(7_000_000_000_000 + (hash % 999_999_999))
}

export class MockShopifyAdapter implements MarketplaceAdapter {
  readonly channel = "SHOPIFY" as const
  readonly displayName = "Shopify"
  readonly supportsApi = true
  readonly isMock = true

  constructor(private readonly controls: MockControls) {}

  /**
   * Idempotent: Existiert bereits eine Product-ID am Angebot, wird dieselbe
   * wieder verwendet statt ein zweites Produkt anzulegen. Genau das muss die
   * spätere echte Implementierung auch tun.
   */
  async publishProduct(
    payload: ListingPayload
  ): Promise<AdapterResult<PublishResult>> {
    await delay(800, 1500)

    if (this.controls.shouldFailShopify()) {
      return fail(
        "NETWORK",
        "Shopify Admin API nicht erreichbar (HTTP 503). Simulierter Fehler.",
        true
      )
    }

    if (payload.priceCents <= 0) {
      return fail(
        "VALIDATION",
        "Kein Verkaufspreis gesetzt — Shopify lehnt Produkte ohne Preis ab.",
        false
      )
    }

    const productId =
      payload.externalIds.productId ?? shopifyNumericId(payload.sku, "product")
    const variantId =
      payload.externalIds.variantId ?? shopifyNumericId(payload.sku, "variant")
    const inventoryItemId =
      payload.externalIds.inventoryItemId ??
      shopifyNumericId(payload.sku, "inventory")

    const handle = `${payload.title} ${payload.sku}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    return ok({
      externalIds: { productId, variantId, inventoryItemId },
      externalUrl: `https://demo-shop.myshopify.com/products/${handle}`,
      publishedAt: new Date().toISOString(),
    })
  }

  async updateProduct(
    payload: ListingPayload
  ): Promise<AdapterResult<PublishResult>> {
    // Update und Publish unterscheiden sich in der Demo nur in der Dauer;
    // die Idempotenz-Logik ist identisch.
    await delay(500, 1000)
    if (this.controls.shouldFailShopify()) {
      return fail(
        "NETWORK",
        "Shopify Admin API nicht erreichbar (HTTP 503). Simulierter Fehler.",
        true
      )
    }
    return this.publishProduct(payload)
  }

  async setUnavailable(payload: ListingPayload): Promise<AdapterResult<void>> {
    await delay(400, 900)
    if (this.controls.shouldFailShopify()) {
      return fail(
        "NETWORK",
        "Bestand konnte nicht auf 0 gesetzt werden. Simulierter Fehler.",
        true
      )
    }
    if (!payload.externalIds.inventoryItemId) {
      return fail(
        "CONFLICT",
        "Kein Shopify-Angebot vorhanden, das deaktiviert werden könnte.",
        false
      )
    }
    return ok(undefined)
  }

  async deleteListing(payload: ListingPayload): Promise<AdapterResult<void>> {
    await delay(400, 900)
    if (this.controls.shouldFailShopify()) {
      return fail("NETWORK", "Löschen fehlgeschlagen. Simulierter Fehler.", true)
    }
    void payload
    return ok(undefined)
  }

  async getListingStatus(
    payload: ListingPayload
  ): Promise<AdapterResult<{ available: boolean; inventory: number }>> {
    await delay(200, 500)
    return ok({
      available: Boolean(payload.externalIds.productId),
      inventory: payload.quantity,
    })
  }
}

/* ------------------------------------------------------------------ */
/* Kanäle ohne Schnittstelle: eBay und Kleinanzeigen                   */
/* ------------------------------------------------------------------ */

/**
 * Ein Kanal, der von Hand bedient wird.
 *
 * Weder für eBay noch für Kleinanzeigen liegt ein bestätigter Zugang vor.
 * Dieser Adapter täuscht deshalb bewusst KEINE Automatisierung vor: Er führt
 * ausschließlich den internen Status. Das vollständig vorbereitete Inserat
 * liefert `proposalAsText` — eingestellt wird es im Kanal selbst.
 *
 * Für eBay hieße eine echte Anbindung: Entwicklerkonto, OAuth, Business
 * Policies und ein Sandbox-Account. Sobald die vorliegen, wird hier eine
 * echte Implementierung eingesetzt; `supportsApi = false` ist bis dahin die
 * ehrliche Aussage — und der Grund, warum eBay-Verkäufe nachgetragen werden
 * müssen.
 */
export class ManualChannelAdapter implements MarketplaceAdapter {
  readonly supportsApi = false
  readonly isMock = true

  constructor(
    readonly channel: "EBAY" | "KLEINANZEIGEN",
    readonly displayName: string
  ) {}

  async publishProduct(
    payload: ListingPayload
  ): Promise<AdapterResult<PublishResult>> {
    // Kein Netzwerkaufruf — das Inserat wird im Kanal selbst eingestellt und
    // hier lediglich als vorhanden vermerkt.
    void payload
    return ok({
      externalIds: {},
      externalUrl: null,
      publishedAt: new Date().toISOString(),
    })
  }

  async updateProduct(
    payload: ListingPayload
  ): Promise<AdapterResult<PublishResult>> {
    return this.publishProduct(payload)
  }

  async setUnavailable(): Promise<AdapterResult<void>> {
    return ok(undefined)
  }

  async deleteListing(): Promise<AdapterResult<void>> {
    return ok(undefined)
  }

  async getListingStatus(
    payload: ListingPayload
  ): Promise<AdapterResult<{ available: boolean; inventory: number }>> {
    return ok({ available: false, inventory: payload.quantity })
  }
}

/* ------------------------------------------------------------------ */
/* Google Sheets                                                       */
/* ------------------------------------------------------------------ */

export class MockGoogleSheetsAdapter implements SheetsAdapter {
  readonly displayName = "Google Sheets"
  readonly isMock = true

  /**
   * Merkt sich bereits geschriebene Verkäufe — verhindert Doppelzeilen.
   *
   * Die Karte allein reicht nicht: Sie lebt nur bis zum nächsten Neuladen,
   * während die Verkäufe persistiert sind. Der belastbare Schlüssel ist
   * deshalb `sale.sheetsRowNumber`; die Karte fängt nur Wiederholungen
   * innerhalb derselben Sitzung ab.
   */
  private readonly writtenRows = new Map<string, number>()

  constructor(private readonly controls: MockControls) {}

  async appendSale(sale: Sale): Promise<AdapterResult<{ rowNumber: number }>> {
    await delay(900, 1600)

    if (this.controls.shouldFailSheets()) {
      return fail(
        "NETWORK",
        "Google Sheets API nicht erreichbar. Simulierter Fehler.",
        true
      )
    }

    const known = sale.sheetsRowNumber ?? this.writtenRows.get(sale.id)
    if (known !== undefined && known !== null) {
      this.writtenRows.set(sale.id, known)
      return ok({ rowNumber: known })
    }

    // Zeile 1 ist die Kopfzeile. Die höchste bereits vergebene Nummer kommt
    // aus dem persistierten Bestand, nicht aus der Sitzungskarte.
    const highest = Math.max(
      1,
      ...this.writtenRows.values(),
      this.controls.highestSheetsRow?.() ?? 1
    )
    const rowNumber = highest + 1
    this.writtenRows.set(sale.id, rowNumber)
    return ok({ rowNumber })
  }
}

/* ------------------------------------------------------------------ */
/* Avides Import                                                       */
/* ------------------------------------------------------------------ */

/**
 * Demo-Daten für den Import-Wizard.
 *
 * Die Spaltennamen sind bewusst als *Beispiel* zu verstehen und nirgends im
 * Code fest verdrahtet — das echte Avides-Format ist unbekannt. Der Wizard
 * arbeitet ausschließlich über das Mapping, das der Nutzer bestätigt.
 */
/**
 * Beispiel-Lieferliste für den Demo-Modus.
 *
 * Zwei Dateien, weil der Import zwei sehr verschiedene Fälle bedienen muss:
 * eine Geräteliste mit Seriennummern und eine Teileliste mit Mengen. Beide
 * enthalten bewusst dieselben Stolperstellen wie echte Lieferantendateien —
 * Dubletten gegen den Bestand, Dubletten innerhalb der Datei und Zeilen ohne
 * belastbaren Schlüssel.
 */
export class DemoImportSource implements ImportSource {
  readonly displayName = "Beispiel-Lieferliste"
  readonly isMock = true

  async loadDemoTable(): Promise<ParsedTable> {
    return this.loadUnitsTable()
  }

  async loadUnitsTable(): Promise<ParsedTable> {
    await delay(400, 800)

    const headers = [
      "Artikelnummer",
      "Seriennummer",
      "Hersteller",
      "Bezeichnung",
      "Ausfuehrung",
      "Farbe",
      "EK netto",
      "UVP",
      "Laufleistung",
      "Zustandsklasse",
      "Lieferdatum",
      "Bemerkung",
    ]

    const row = (...values: string[]): Record<string, string> =>
      Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]))

    const rows: Record<string, string>[] = [
      row("AV-91020", "DEMO-XM4U-51204", "Xiaomi", "Electric Scooter 4 Ultra", "", "Schwarz", "289,00", "649,00", "412", "B", "02.08.2026", "Retoure, Originalkarton"),
      row("AV-91021", "DEMO-NB-F2P-51330", "Segway-Ninebot", "KickScooter F2 Pro", "", "Grau", "231,50", "529,00", "780", "B", "02.08.2026", ""),
      row("AV-91022", "DEMO-NIU-KQI3-51418", "NIU", "KQi3 Pro", "", "Weiß", "255,00", "579,00", "1240", "C", "02.08.2026", "Display leicht zerkratzt"),
      row("AV-91023", "DEMO-EGR-PRO-51562", "Egret", "Pro", "", "Schwarz", "402,00", "899,00", "310", "A", "02.08.2026", "Nahezu neuwertig"),
      row("AV-91024", "DEMO-TRB-KALK-51677", "Trittbrett", "Kalle", "", "Petrol", "348,00", "799,00", "95", "A", "02.08.2026", ""),
      row("AV-91025", "DEMO-XM-PRO2-51703", "Xiaomi", "Mi Scooter Pro 2", "", "Schwarz", "168,00", "379,00", "2130", "C", "02.08.2026", "Akku schwächer"),
      row("AV-91026", "DEMO-NB-MAXG2-51844", "Segway-Ninebot", "KickScooter MAX G2", "", "Schwarz", "388,00", "849,00", "560", "B", "02.08.2026", ""),
      // Bereits im Bestand — darf nicht überschrieben werden.
      row("AV-91027", "DEMO-XM-PRO2-77413", "Xiaomi", "Mi Scooter Pro 2", "", "Schwarz", "180,00", "339,00", "1240", "B", "02.08.2026", "Bereits im Bestand"),
      // Dublette innerhalb dieser Datei (identisch zu AV-91020).
      row("AV-91028", "DEMO-XM4U-51204", "Xiaomi", "Electric Scooter 4 Ultra", "", "Schwarz", "289,00", "649,00", "412", "B", "02.08.2026", "Doppelte Zeile im Lieferschein"),
      // Ohne Seriennummer — muss als Fehler auffallen, nicht still durchlaufen.
      row("AV-91029", "", "NIU", "KQi2 Pro", "", "Grau", "198,00", "449,00", "870", "C", "02.08.2026", "Seriennummer fehlt auf dem Etikett"),
    ]

    return { fileName: "lieferung_geraete_demo.csv", headers, rows }
  }

  async loadPartsTable(): Promise<ParsedTable> {
    await delay(400, 800)

    const headers = [
      "Teilenummer",
      "Bezeichnung",
      "Hersteller",
      "Passend für",
      "Menge",
      "EK je Stück",
      "VK",
      "Zustand",
      "Lagerplatz",
      "Bemerkung",
    ]

    const row = (...values: string[]): Record<string, string> =>
      Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]))

    const rows: Record<string, string>[] = [
      row("CST-C1488-85", "Reifen 8,5 Zoll Tubeless", "CST", "Xiaomi M365, Pro, Pro 2", "24", "7,90", "18,90", "Neu", "B-02", "Sammelbestellung"),
      row("CST-C1488-10", "Reifen 10 Zoll mit Schlauch", "CST", "Ninebot MAX G30", "12", "11,50", "22,90", "Neu", "B-02", ""),
      row("ZM-BP-140", "Bremsbeläge Scheibenbremse (Paar)", "Zoom", "Universal 140 mm", "50", "3,60", "9,90", "Neu", "B-02", ""),
      row("XM-DSP-PRO2", "Display / Bedieneinheit Pro 2", "Xiaomi", "Xiaomi M365, Pro, Pro 2", "4", "19,00", "34,90", "Gebraucht", "B-01", "Aus Ausschlachtung"),
      row("NB-CTL-G30", "Controller MAX G30", "Segway", "Ninebot MAX G30", "3", "34,00", "69,00", "Gut", "B-01", ""),
      row("XM-FEN-PRO2", "Schutzblech hinten mit Rücklicht", "Xiaomi", "Xiaomi M365, Pro, Pro 2", "6", "4,20", "14,90", "Gut", "B-02", ""),
      row("SK-CHG-42-2", "Ladegerät 42V 2A", "Skope", "Universal 36V-Systeme", "10", "12,90", "24,90", "Neu", "B-01", ""),
      // Ohne Teilenummer und ohne Bezeichnung — nicht zuordenbar.
      row("", "", "", "", "5", "1,00", "", "Neu", "", "Restposten ohne Angaben"),
    ]

    return { fileName: "lieferung_ersatzteile_demo.csv", headers, rows }
  }
}
