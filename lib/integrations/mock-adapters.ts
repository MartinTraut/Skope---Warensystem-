/**
 * Demo-Implementierungen der externen Systeme.
 *
 * Sie verhalten sich wie echte Integrationen: Latenz, Idempotenz, Fehlerfälle.
 * Was sie nicht tun, ist irgendetwas nach außen zu senden. Jeder Adapter ist
 * mit `isMock = true` gekennzeichnet, damit die Oberfläche das ehrlich anzeigt.
 */

import type { Sale, Scooter } from "@/lib/domain/types"
import { getListing, modelLabel } from "@/lib/domain/status"
import type {
  AdapterResult,
  ImportSource,
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
   * Idempotent: Existiert bereits eine Product-ID auf dem Listing, wird
   * dieselbe wieder verwendet statt ein zweites Produkt anzulegen. Genau das
   * muss die spätere echte Implementierung auch tun.
   */
  async publishProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>> {
    await delay(800, 1500)

    if (this.controls.shouldFailShopify()) {
      return fail(
        "NETWORK",
        "Shopify Admin API nicht erreichbar (HTTP 503). Simulierter Fehler.",
        true
      )
    }

    if (scooter.salePriceCents === null || scooter.salePriceCents <= 0) {
      return fail(
        "VALIDATION",
        "Kein Verkaufspreis gesetzt — Shopify lehnt Produkte ohne Preis ab.",
        false
      )
    }

    const existing = getListing(scooter, "SHOPIFY")
    const productId =
      existing?.externalIds.productId ??
      shopifyNumericId(scooter.id, "product")
    const variantId =
      existing?.externalIds.variantId ?? shopifyNumericId(scooter.id, "variant")
    const inventoryItemId =
      existing?.externalIds.inventoryItemId ??
      shopifyNumericId(scooter.id, "inventory")

    const handle = `${modelLabel(scooter)} ${scooter.scooterNumber}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    return ok({
      externalIds: { productId, variantId, inventoryItemId },
      externalUrl: `https://demo-shop.myshopify.com/products/${handle}`,
      publishedAt: new Date().toISOString(),
    })
  }

  async updateProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>> {
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
    return this.publishProduct(scooter)
  }

  async setUnavailable(scooter: Scooter): Promise<AdapterResult<void>> {
    await delay(400, 900)
    if (this.controls.shouldFailShopify()) {
      return fail(
        "NETWORK",
        "Bestand konnte nicht auf 0 gesetzt werden. Simulierter Fehler.",
        true
      )
    }
    const listing = getListing(scooter, "SHOPIFY")
    if (!listing?.externalIds.inventoryItemId) {
      return fail(
        "CONFLICT",
        "Kein Shopify-Listing vorhanden, das deaktiviert werden könnte.",
        false
      )
    }
    return ok(undefined)
  }

  async deleteListing(scooter: Scooter): Promise<AdapterResult<void>> {
    await delay(400, 900)
    if (this.controls.shouldFailShopify()) {
      return fail("NETWORK", "Löschen fehlgeschlagen. Simulierter Fehler.", true)
    }
    void scooter
    return ok(undefined)
  }

  async getListingStatus(
    scooter: Scooter
  ): Promise<AdapterResult<{ available: boolean; inventory: number }>> {
    await delay(200, 500)
    const listing = getListing(scooter, "SHOPIFY")
    return ok({
      available: listing?.status === "VEROEFFENTLICHT",
      inventory: listing?.inventory ?? 0,
    })
  }
}

/* ------------------------------------------------------------------ */
/* Kleinanzeigen                                                       */
/* ------------------------------------------------------------------ */

/**
 * Für Kleinanzeigen ist keine nutzbare Schnittstelle bestätigt. Dieser Adapter
 * täuscht deshalb bewusst KEINE Automatisierung vor: Er pflegt ausschließlich
 * den internen Status, den ein Mitarbeiter von Hand setzt. Sobald die
 * Discovery ein Ergebnis hat, wird hier eine echte Implementierung eingesetzt —
 * bis dahin ist `supportsApi = false` die ehrliche Aussage.
 */
export class ManualKleinanzeigenAdapter implements MarketplaceAdapter {
  readonly channel = "KLEINANZEIGEN" as const
  readonly displayName = "Kleinanzeigen"
  readonly supportsApi = false
  readonly isMock = true

  async publishProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>> {
    // Kein Netzwerkaufruf — der Mitarbeiter hat die Anzeige selbst erstellt
    // und markiert sie hier lediglich als vorhanden.
    void scooter
    return ok({
      externalIds: {},
      externalUrl: null,
      publishedAt: new Date().toISOString(),
    })
  }

  async updateProduct(scooter: Scooter): Promise<AdapterResult<PublishResult>> {
    return this.publishProduct(scooter)
  }

  async setUnavailable(): Promise<AdapterResult<void>> {
    return ok(undefined)
  }

  async deleteListing(): Promise<AdapterResult<void>> {
    return ok(undefined)
  }

  async getListingStatus(
    scooter: Scooter
  ): Promise<AdapterResult<{ available: boolean; inventory: number }>> {
    const listing = getListing(scooter, "KLEINANZEIGEN")
    return ok({
      available: listing?.status === "VEROEFFENTLICHT",
      inventory: listing?.inventory ?? 0,
    })
  }
}

/* ------------------------------------------------------------------ */
/* Google Sheets                                                       */
/* ------------------------------------------------------------------ */

export class MockGoogleSheetsAdapter implements SheetsAdapter {
  readonly displayName = "Google Sheets"
  readonly isMock = true

  /** Merkt sich bereits geschriebene Verkäufe — verhindert Doppelzeilen. */
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

    const existing = this.writtenRows.get(sale.id)
    if (existing !== undefined) {
      // Idempotenz: derselbe Verkauf landet nicht zweimal in der Tabelle.
      return ok({ rowNumber: existing })
    }

    const rowNumber = this.writtenRows.size + 2 // Zeile 1 ist die Kopfzeile
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
export class MockAvidesImportSource implements ImportSource {
  readonly displayName = "Avides (Demo-Datei)"
  readonly isMock = true

  async loadDemoTable(): Promise<ParsedTable> {
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

    // Die Seriennummern sind bewusst neu — bis auf drei Zeilen, die typische
    // Praxisfälle abbilden: eine Dublette gegen den Bestand, eine Dublette
    // innerhalb der Datei und eine Zeile ohne Seriennummer.
    const rows: Record<string, string>[] = [
      row("AV-91020", "DEMO-XM4U-51204", "Xiaomi", "Electric Scooter 4 Ultra", "", "Schwarz", "289,00", "649,00", "412", "B", "02.08.2026", "Retoure, Originalkarton"),
      row("AV-91021", "DEMO-NB-F2P-51330", "Segway-Ninebot", "KickScooter F2 Pro", "", "Grau", "231,50", "529,00", "780", "B", "02.08.2026", ""),
      row("AV-91022", "DEMO-NIU-KQI3-51418", "NIU", "KQi3 Pro", "", "Weiß", "255,00", "579,00", "1240", "C", "02.08.2026", "Display leicht zerkratzt"),
      row("AV-91023", "DEMO-EGR-PRO-51562", "Egret", "Pro", "", "Schwarz", "402,00", "899,00", "310", "A", "02.08.2026", "Nahezu neuwertig"),
      row("AV-91024", "DEMO-TRB-KALK-51677", "Trittbrett", "Kalle", "", "Petrol", "348,00", "799,00", "95", "A", "02.08.2026", ""),
      row("AV-91025", "DEMO-XM-PRO2-51703", "Xiaomi", "Mi Scooter Pro 2", "", "Schwarz", "168,00", "379,00", "2130", "C", "02.08.2026", "Akku schwächer"),
      row("AV-91026", "DEMO-NB-MAXG2-51844", "Segway-Ninebot", "KickScooter MAX G2", "", "Schwarz", "388,00", "849,00", "560", "B", "02.08.2026", ""),
      // Bereits im Bestand (SK-2026-0041) — darf nicht überschrieben werden.
      row("AV-91027", "DEMO-XM4U-77301", "Xiaomi", "Electric Scooter 4 Ultra", "", "Schwarz", "289,00", "649,00", "412", "B", "02.08.2026", "Bereits letzte Woche geliefert"),
      // Dublette innerhalb dieser Datei (identisch zu AV-91020).
      row("AV-91028", "DEMO-XM4U-51204", "Xiaomi", "Electric Scooter 4 Ultra", "", "Schwarz", "289,00", "649,00", "412", "B", "02.08.2026", "Doppelte Zeile im Lieferschein"),
      // Ohne Seriennummer — muss als Fehler auffallen, nicht still durchlaufen.
      row("AV-91029", "", "NIU", "KQi2 Pro", "", "Grau", "198,00", "449,00", "870", "C", "02.08.2026", "Seriennummer fehlt auf dem Etikett"),
    ]

    function row(...values: string[]): Record<string, string> {
      return Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]))
    }

    return { fileName: "avides_lieferung_demo.csv", headers, rows }
  }
}
