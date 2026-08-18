/**
 * Demo-Datenbestand.
 *
 * Alle Datensätze sind erfunden — Seriennummern beginnen erkennbar mit "DEMO-".
 * Die Daten sind so gewählt, dass jede Stufe des Warenprozesses belegt ist,
 * beide Bestandsarten vorkommen und die Kennzahlen rechnerisch zusammenpassen:
 * Der Bestand der Ersatzteile ergibt sich tatsächlich aus den Buchungen, und
 * die ausgeschlachteten Teile tragen den verteilten Einkaufswert des Spenders.
 *
 * Der Seed ist deterministisch (bis auf die Zeitachse, die relativ zu heute
 * liegt), damit eine Demo beim Kunden zweimal gleich aussieht.
 */

import { createEmptyListing } from "@/lib/domain/article-factory"
import { resolveCategorySettings } from "@/lib/domain/categories"
import { createEmptyInspection } from "@/lib/domain/inspection"
import {
  buildArticleProposal,
  buildUnitProposal,
  evaluateArticleReadiness,
  evaluateUnitReadiness,
  isReady,
  resolveChannel,
  resolvePublishMode,
} from "@/lib/domain/publishing"
import { computeStockLevels, emptyStockLevel, isUnitInStock } from "@/lib/domain/stock"
import { distributeTeardownValue } from "@/lib/domain/teardown"
import { CHANNELS } from "@/lib/domain/types"
import type {
  Article,
  ArticleUnit,
  AttributeDefinition,
  AuditEvent,
  Category,
  Condition,
  ImportBatch,
  InspectionResult,
  PublicationProposal,
  Repair,
  Sale,
  StockImage,
  StockMovement,
  StorageLocation,
  Teardown,
  TeardownLine,
  WorkflowStatus,
} from "@/lib/domain/types"
import {
  createPlaceholderImage,
  placeholderViewLabel,
  type PlaceholderKind,
} from "./placeholder-image"

/* ------------------------------------------------------------------ */
/* Hilfsmittel                                                         */
/* ------------------------------------------------------------------ */

const DAY_MS = 86_400_000

function daysAgo(days: number, hour = 10, minute = 0): string {
  const date = new Date(Date.now() - days * DAY_MS)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

/** Verkaufsdatum innerhalb des laufenden Monats — für "Umsatz diesen Monat". */
function thisMonth(day: number, hour = 14): string {
  const now = new Date()
  const maxDay = Math.min(day, now.getDate())
  const date = new Date(now.getFullYear(), now.getMonth(), maxDay, hour, 0, 0, 0)
  return date.toISOString()
}

/**
 * Verkaufsdatum vor `months` Monaten.
 *
 * Die Auswertung zeigt sechs Monate; ohne Verkäufe in den älteren Monaten
 * wäre der Verlauf eine einzelne Säule und würde nichts aussagen.
 */
function monthsAgo(months: number, day: number, hour = 12): string {
  const now = new Date()
  const date = new Date(now.getFullYear(), now.getMonth() - months, day, hour, 0, 0, 0)
  return date.toISOString()
}

let idCounter = 0
function seedId(prefix: string): string {
  idCounter += 1
  return `${prefix}_seed_${String(idCounter).padStart(4, "0")}`
}

function images(
  label: string,
  count: number,
  kind: PlaceholderKind = "GERAET"
): StockImage[] {
  return Array.from({ length: count }, (_, index) => {
    const view = placeholderViewLabel(index, kind)
    return {
      id: seedId("img"),
      url: createPlaceholderImage(label, view, index + label.length, kind),
      name: `${label} – ${view}`,
      isPrimary: index === 0,
      sortOrder: index,
      createdAt: daysAgo(20 - index),
    }
  })
}

function attribute(
  key: string,
  label: string,
  type: AttributeDefinition["type"],
  extra: Partial<AttributeDefinition> = {}
): AttributeDefinition {
  return {
    key,
    label,
    type,
    options: [],
    unit: "",
    required: false,
    filterable: false,
    ...extra,
  }
}

/* ------------------------------------------------------------------ */
/* Bereiche                                                            */
/* ------------------------------------------------------------------ */

/**
 * Der Baum ist bewusst so tief, wie er in der Praxis wird: Ersatzteile
 * gliedern sich nach Baugruppe, und erst auf der untersten Ebene stehen die
 * Merkmale, nach denen tatsächlich gesucht wird ("8,5 Zoll", "Tubeless").
 */
function createCategories(): Category[] {
  let order = 0

  const make = (
    id: string,
    parentId: string | null,
    name: string,
    numberPrefix: string,
    stockMode: Category["stockMode"],
    patch: Partial<Category> = {}
  ): Category => ({
    id,
    parentId,
    name,
    numberPrefix,
    description: "",
    stockMode,
    attributes: [],
    reorderLevel: null,
    defaultChannel: null,
    publishMode: "VORSCHLAG",
    requiresInspection: false,
    sortOrder: (order += 10),
    createdAt: daysAgo(180),
    updatedAt: daysAgo(180),
    ...patch,
  })

  return [
    make("cat_scooter", null, "Scooter", "SK", "SERIALISIERT", {
      description:
        "Komplette Fahrzeuge. Jedes Gerät wird einzeln geführt, geprüft und bepreist.",
      defaultChannel: "SHOPIFY",
      requiresInspection: true,
      attributes: [
        attribute("motorleistung", "Motorleistung", "ZAHL", {
          unit: "W",
          filterable: true,
        }),
        attribute("akku", "Akkukapazität", "ZAHL", { unit: "Ah" }),
        attribute("hoechstgeschwindigkeit", "Höchstgeschwindigkeit", "ZAHL", {
          unit: "km/h",
        }),
        attribute("zulassung", "Straßenzulassung (ABE)", "JA_NEIN", {
          filterable: true,
        }),
      ],
    }),

    make("cat_teile", null, "Ersatzteile", "ET", "MENGE", {
      description:
        "Alles, was aus Ausschlachtungen und Sammelkäufen anfällt. Bestand als Stückzahl.",
      defaultChannel: "EBAY",
      attributes: [
        attribute("passend_fuer", "Passend für", "TEXT", {
          required: true,
          filterable: true,
        }),
      ],
    }),

    make("cat_elektrik", "cat_teile", "Elektrik", "ET-EL", "MENGE", {
      attributes: [attribute("spannung", "Spannung", "ZAHL", { unit: "V" })],
    }),
    make("cat_display", "cat_elektrik", "Displays", "ET-DISP", "MENGE", {
      reorderLevel: 2,
      attributes: [
        attribute("anschluss", "Anschluss", "AUSWAHL", {
          options: ["JST 5-polig", "JST 6-polig", "Molex", "Sonstige"],
          filterable: true,
        }),
      ],
    }),
    make("cat_akku", "cat_elektrik", "Akkus", "ET-AKKU", "MENGE", {
      reorderLevel: 1,
      attributes: [
        attribute("kapazitaet", "Kapazität", "ZAHL", {
          unit: "Ah",
          filterable: true,
        }),
        attribute("zellen", "Zelltyp", "TEXT"),
      ],
    }),
    make("cat_controller", "cat_elektrik", "Controller", "ET-CTRL", "MENGE", {
      reorderLevel: 2,
    }),

    make("cat_fahrwerk", "cat_teile", "Fahrwerk", "ET-FW", "MENGE"),
    make("cat_reifen", "cat_fahrwerk", "Reifen", "ET-REI", "MENGE", {
      reorderLevel: 4,
      attributes: [
        attribute("zoll", "Größe", "ZAHL", {
          unit: "Zoll",
          required: true,
          filterable: true,
        }),
        attribute("ausfuehrung", "Ausführung", "AUSWAHL", {
          options: ["Tubeless", "Mit Schlauch", "Vollgummi"],
          required: true,
          filterable: true,
        }),
        attribute("profil", "Profil", "TEXT"),
      ],
    }),
    make("cat_bremse", "cat_fahrwerk", "Bremsen", "ET-BRM", "MENGE", {
      reorderLevel: 6,
      attributes: [
        attribute("bremstyp", "Bremstyp", "AUSWAHL", {
          options: ["Scheibe", "Trommel", "Elektronisch"],
          filterable: true,
        }),
      ],
    }),
    make("cat_anbau", "cat_teile", "Anbauteile", "ET-ANB", "MENGE"),

    make("cat_zubehoer", null, "Zubehör", "ZUB", "MENGE", {
      description: "Neuware zum Weiterverkauf: Helme, Schlösser, Ladegeräte.",
      defaultChannel: "SHOPIFY",
      reorderLevel: 3,
    }),
  ]
}

/* ------------------------------------------------------------------ */
/* Lagerplätze                                                         */
/* ------------------------------------------------------------------ */

function createLocations(): StorageLocation[] {
  const make = (
    id: string,
    code: string,
    name: string,
    note: string,
    sortOrder: number
  ): StorageLocation => ({
    id,
    code,
    name,
    note,
    sortOrder,
    createdAt: daysAgo(180),
  })

  return [
    make("loc_we", "A-01", "Wareneingang", "Neu angelieferte Ware, noch ungeprüft.", 10),
    make("loc_werkstatt", "A-02", "Werkstatt", "Geräte in Prüfung und Aufbereitung.", 20),
    make("loc_elektrik", "B-01", "Regal Elektrik", "Displays, Controller, Akkus.", 30),
    make("loc_fahrwerk", "B-02", "Regal Fahrwerk", "Reifen, Bremsen, Anbauteile.", 40),
    make("loc_verkauf", "C-01", "Verkaufsfläche", "Verkaufsbereite Geräte.", 50),
  ]
}

/* ------------------------------------------------------------------ */
/* Artikel                                                             */
/* ------------------------------------------------------------------ */

interface ArticleSpec {
  id: string
  categoryId: string
  sku: string
  name: string
  manufacturer: string
  mpn?: string
  stockMode: Article["stockMode"]
  attributes?: Record<string, string>
  condition?: Condition
  salePriceCents?: number | null
  reorderLevel?: number | null
  description?: string
  imageCount?: number
  ageDays?: number
}

const ARTICLE_SPECS: ArticleSpec[] = [
  /* Scooter-Modelle — Einzelstücke hängen daran */
  {
    id: "art_pro2",
    categoryId: "cat_scooter",
    sku: "SK-0001",
    name: "Mi Electric Scooter Pro 2",
    manufacturer: "Xiaomi",
    stockMode: "SERIALISIERT",
    attributes: {
      motorleistung: "300",
      akku: "12,4",
      hoechstgeschwindigkeit: "20",
      zulassung: "Ja",
    },
    description:
      "Klassiker mit Straßenzulassung, 8,5-Zoll-Bereifung und Rekuperationsbremse.",
    imageCount: 3,
    ageDays: 150,
  },
  {
    id: "art_g30",
    categoryId: "cat_scooter",
    sku: "SK-0002",
    name: "Ninebot KickScooter MAX G30D",
    manufacturer: "Segway",
    stockMode: "SERIALISIERT",
    attributes: {
      motorleistung: "350",
      akku: "15,3",
      hoechstgeschwindigkeit: "20",
      zulassung: "Ja",
    },
    description: "Großer Akku, 10-Zoll-Schlauchlosreifen, sehr gefragt.",
    imageCount: 3,
    ageDays: 140,
  },
  {
    id: "art_kqi3",
    categoryId: "cat_scooter",
    sku: "SK-0003",
    name: "KQi3 Pro",
    manufacturer: "NIU",
    stockMode: "SERIALISIERT",
    attributes: {
      motorleistung: "350",
      akku: "12,1",
      hoechstgeschwindigkeit: "20",
      zulassung: "Ja",
    },
    imageCount: 2,
    ageDays: 90,
  },
  {
    id: "art_kalle",
    categoryId: "cat_scooter",
    sku: "SK-0004",
    name: "Kalle",
    manufacturer: "Trittbrett",
    stockMode: "SERIALISIERT",
    attributes: {
      motorleistung: "500",
      akku: "10,4",
      hoechstgeschwindigkeit: "20",
      zulassung: "Ja",
    },
    imageCount: 2,
    ageDays: 60,
  },

  /* Ersatzteile — Mengenartikel */
  {
    id: "art_disp_pro2",
    categoryId: "cat_display",
    sku: "ET-DISP-0001",
    name: "Display / Bedieneinheit Pro 2",
    manufacturer: "Xiaomi",
    mpn: "XM-DSP-PRO2",
    stockMode: "MENGE",
    attributes: {
      passend_fuer: "Xiaomi M365, Pro, Pro 2",
      spannung: "36",
      anschluss: "JST 5-polig",
    },
    condition: "GUT",
    salePriceCents: 3490,
    description:
      "Ausgebaute Bedieneinheit inklusive Kabelbaum. Funktion geprüft, Displayglas ohne Risse.",
    imageCount: 2,
    ageDays: 120,
  },
  {
    id: "art_disp_g30",
    categoryId: "cat_display",
    sku: "ET-DISP-0002",
    name: "Display MAX G30",
    manufacturer: "Segway",
    mpn: "NB-DSP-G30",
    stockMode: "MENGE",
    attributes: {
      passend_fuer: "Ninebot MAX G30 / G30D",
      spannung: "36",
      anschluss: "JST 6-polig",
    },
    condition: "SEHR_GUT",
    salePriceCents: 4290,
    imageCount: 2,
    ageDays: 95,
  },
  {
    id: "art_reifen_85",
    categoryId: "cat_reifen",
    sku: "ET-REI-0001",
    name: "Reifen 8,5 Zoll Tubeless",
    manufacturer: "CST",
    mpn: "CST-C1488-85",
    stockMode: "MENGE",
    attributes: {
      passend_fuer: "Xiaomi M365, Pro, Pro 2",
      zoll: "8,5",
      ausfuehrung: "Tubeless",
      profil: "Straßenprofil",
    },
    condition: "NEU",
    salePriceCents: 1890,
    imageCount: 1,
    ageDays: 200,
  },
  {
    id: "art_reifen_10",
    categoryId: "cat_reifen",
    sku: "ET-REI-0002",
    name: "Reifen 10 Zoll mit Schlauch",
    manufacturer: "CST",
    mpn: "CST-C1488-10",
    stockMode: "MENGE",
    attributes: {
      passend_fuer: "Ninebot MAX G30",
      zoll: "10",
      ausfuehrung: "Mit Schlauch",
      profil: "Straßenprofil",
    },
    condition: "NEU",
    salePriceCents: 2290,
    imageCount: 1,
    ageDays: 200,
  },
  {
    id: "art_bremsbelag",
    categoryId: "cat_bremse",
    sku: "ET-BRM-0001",
    name: "Bremsbeläge Scheibenbremse (Paar)",
    manufacturer: "Zoom",
    mpn: "ZM-BP-140",
    stockMode: "MENGE",
    attributes: { passend_fuer: "Universal 140 mm Scheibe", bremstyp: "Scheibe" },
    condition: "NEU",
    salePriceCents: 990,
    imageCount: 1,
    ageDays: 210,
  },
  {
    id: "art_controller_g30",
    categoryId: "cat_controller",
    sku: "ET-CTRL-0001",
    name: "Controller / Steuergerät MAX G30",
    manufacturer: "Segway",
    mpn: "NB-CTL-G30",
    stockMode: "MENGE",
    attributes: { passend_fuer: "Ninebot MAX G30", spannung: "36" },
    condition: "GUT",
    salePriceCents: 6900,
    imageCount: 2,
    ageDays: 85,
  },
  {
    id: "art_akku_pro2",
    categoryId: "cat_akku",
    sku: "ET-AKKU-0001",
    name: "Akkupack 36V 12,4Ah",
    manufacturer: "Xiaomi",
    mpn: "XM-BAT-PRO2",
    stockMode: "MENGE",
    attributes: {
      passend_fuer: "Xiaomi Pro / Pro 2",
      spannung: "36",
      kapazitaet: "12,4",
      zellen: "18650, LG",
    },
    condition: "GEBRAUCHT",
    salePriceCents: 12900,
    description:
      "Aus Ausschlachtung. Restkapazität gemessen, Wert im Prüfprotokoll des Spenders vermerkt.",
    imageCount: 1,
    ageDays: 70,
  },
  {
    id: "art_schutzblech",
    categoryId: "cat_anbau",
    sku: "ET-ANB-0001",
    name: "Schutzblech hinten mit Rücklicht",
    manufacturer: "Xiaomi",
    mpn: "XM-FEN-PRO2",
    stockMode: "MENGE",
    attributes: { passend_fuer: "Xiaomi M365, Pro, Pro 2" },
    condition: "GUT",
    salePriceCents: 1490,
    imageCount: 1,
    ageDays: 70,
  },
  {
    id: "art_ladegeraet",
    categoryId: "cat_zubehoer",
    sku: "ZUB-0001",
    name: "Ladegerät 42V 2A",
    manufacturer: "Skope",
    mpn: "SK-CHG-42-2",
    stockMode: "MENGE",
    attributes: {},
    condition: "NEU",
    salePriceCents: 2490,
    imageCount: 1,
    ageDays: 160,
  },
  {
    id: "art_schloss",
    categoryId: "cat_zubehoer",
    sku: "ZUB-0002",
    name: "Faltschloss mit Halterung",
    manufacturer: "Abus",
    mpn: "AB-FS-6000",
    stockMode: "MENGE",
    attributes: {},
    condition: "NEU",
    salePriceCents: 4990,
    imageCount: 1,
    ageDays: 150,
  },
]

function createArticles(): Article[] {
  return ARTICLE_SPECS.map((spec) => {
    const created = daysAgo(spec.ageDays ?? 100)
    const kind: PlaceholderKind =
      spec.stockMode === "SERIALISIERT" ? "GERAET" : "TEIL"

    return {
      id: spec.id,
      sku: spec.sku,
      categoryId: spec.categoryId,
      name: spec.name,
      manufacturer: spec.manufacturer,
      mpn: spec.mpn ?? "",
      ean: "",
      stockMode: spec.stockMode,
      description: spec.description ?? "",
      attributes: spec.attributes ?? {},
      condition: spec.condition ?? "GEBRAUCHT",
      salePriceCents: spec.salePriceCents ?? null,
      reorderLevel: spec.reorderLevel ?? null,
      channelOverride: null,
      publishModeOverride: null,
      images: images(
        `${spec.manufacturer} ${spec.name}`,
        spec.imageCount ?? 1,
        kind
      ),
      listings: CHANNELS.map(createEmptyListing),
      notes: "",
      archivedAt: null,
      createdAt: created,
      updatedAt: created,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Einzelstücke                                                        */
/* ------------------------------------------------------------------ */

interface UnitSpec {
  id: string
  articleId: string
  unitNumber: string
  serial: string
  color: string
  mileageKm: number
  condition: Condition
  purchaseCents: number
  extraCents?: number
  saleCents: number | null
  workflow: WorkflowStatus
  locationId: string | null
  arrivalDays: number
  inspection?: "OFFEN" | "LAEUFT" | "FERTIG" | "PROBLEM"
  cleaned?: boolean
  repairs?: Omit<Repair, "id" | "createdAt">[]
  imageCount?: number
  abe?: boolean
  notes?: string
}

const UNIT_SPECS: UnitSpec[] = [
  {
    id: "unt_01",
    articleId: "art_pro2",
    unitNumber: "SK-2026-0041",
    serial: "DEMO-XM-PRO2-77413",
    color: "Schwarz",
    mileageKm: 1240,
    condition: "SEHR_GUT",
    purchaseCents: 18000,
    saleCents: 33900,
    workflow: "VERKAUFSBEREIT",
    locationId: "loc_verkauf",
    arrivalDays: 34,
    inspection: "FERTIG",
    cleaned: true,
    abe: true,
    imageCount: 3,
    repairs: [
      {
        problem: "Bremsbeläge abgefahren",
        action: "Beläge getauscht, Bremse eingestellt",
        sparePart: "Bremsbeläge Scheibenbremse (Paar)",
        partArticleId: "art_bremsbelag",
        partQuantity: 1,
        partCostCents: 620,
        laborMinutes: 25,
        status: "ERLEDIGT",
      },
    ],
  },
  {
    id: "unt_02",
    articleId: "art_g30",
    unitNumber: "SK-2026-0042",
    serial: "DEMO-NB-G30-20918",
    color: "Dunkelgrau",
    mileageKm: 860,
    condition: "SEHR_GUT",
    purchaseCents: 24000,
    saleCents: 44900,
    workflow: "VERKAUFSBEREIT",
    locationId: "loc_verkauf",
    arrivalDays: 28,
    inspection: "FERTIG",
    cleaned: true,
    abe: true,
    imageCount: 3,
  },
  {
    id: "unt_03",
    articleId: "art_kqi3",
    unitNumber: "SK-2026-0043",
    serial: "DEMO-NIU-KQI3-55102",
    color: "Grau",
    mileageKm: 2100,
    condition: "GUT",
    purchaseCents: 19500,
    extraCents: 1200,
    saleCents: 36900,
    workflow: "AUFBEREITUNG",
    locationId: "loc_werkstatt",
    arrivalDays: 12,
    inspection: "PROBLEM",
    cleaned: false,
    abe: true,
    imageCount: 2,
    repairs: [
      {
        problem: "Display zeigt sporadisch keine Geschwindigkeit",
        action: "Bedieneinheit tauschen",
        sparePart: "Display / Bedieneinheit",
        partArticleId: null,
        partQuantity: 0,
        partCostCents: 0,
        laborMinutes: 40,
        status: "IN_ARBEIT",
      },
      {
        problem: "Hinterreifen porös",
        action: "Reifen ersetzt",
        sparePart: "Reifen 10 Zoll mit Schlauch",
        partArticleId: "art_reifen_10",
        partQuantity: 1,
        partCostCents: 1180,
        laborMinutes: 35,
        status: "ERLEDIGT",
      },
    ],
  },
  {
    id: "unt_04",
    articleId: "art_kalle",
    unitNumber: "SK-2026-0044",
    serial: "DEMO-TB-KALLE-30877",
    color: "Creme",
    mileageKm: 430,
    condition: "WIE_NEU",
    purchaseCents: 46000,
    saleCents: 79900,
    workflow: "IN_PRUEFUNG",
    locationId: "loc_werkstatt",
    arrivalDays: 6,
    inspection: "LAEUFT",
    abe: true,
    imageCount: 2,
  },
  {
    id: "unt_05",
    articleId: "art_pro2",
    unitNumber: "SK-2026-0045",
    serial: "DEMO-XM-PRO2-77518",
    color: "Schwarz",
    mileageKm: 3320,
    condition: "GEBRAUCHT",
    purchaseCents: 9000,
    saleCents: null,
    workflow: "EINGEGANGEN",
    locationId: "loc_we",
    arrivalDays: 3,
    inspection: "OFFEN",
    imageCount: 1,
    notes: "Aus Sammelankauf. Akku schwach — Kandidat für Ausschlachtung.",
  },
  {
    id: "unt_06",
    articleId: "art_g30",
    unitNumber: "SK-2026-0046",
    serial: "DEMO-NB-G30-21044",
    color: "Schwarz",
    mileageKm: 5400,
    condition: "GEBRAUCHT",
    purchaseCents: 11000,
    saleCents: null,
    workflow: "EINGEGANGEN",
    locationId: "loc_we",
    arrivalDays: 3,
    inspection: "OFFEN",
    imageCount: 1,
    notes: "Aus Sammelankauf. Rahmen verzogen.",
  },
  {
    id: "unt_07",
    articleId: "art_pro2",
    unitNumber: "SK-2026-0038",
    serial: "DEMO-XM-PRO2-76220",
    color: "Weiß",
    mileageKm: 1980,
    condition: "GUT",
    purchaseCents: 16500,
    saleCents: 31900,
    workflow: "VERKAUFSBEREIT",
    locationId: "loc_verkauf",
    arrivalDays: 96,
    inspection: "FERTIG",
    cleaned: true,
    abe: true,
    imageCount: 2,
    notes: "Liegt länger als üblich — Preis prüfen.",
  },
]

/** Spender der Ausschlachtung: eigenes Gerät, damit die Buchung echt ist. */
const DONOR_SPEC: UnitSpec = {
  id: "unt_donor",
  articleId: "art_pro2",
  unitNumber: "SK-2026-0031",
  serial: "DEMO-XM-PRO2-71903",
  color: "Schwarz",
  mileageKm: 8900,
  condition: "DEFEKT",
  purchaseCents: 6000,
  extraCents: 500,
  saleCents: null,
  workflow: "AUSGESCHLACHTET",
  locationId: null,
  arrivalDays: 72,
  inspection: "PROBLEM",
  imageCount: 1,
  notes: "Wasserschaden am Rahmen. Als Teilespender zerlegt.",
}

function inspectionFor(mode: UnitSpec["inspection"]) {
  const record = createEmptyInspection()
  if (!mode || mode === "OFFEN") return record

  const set = (index: number, result: InspectionResult, note = "") => {
    if (record.checks[index]) record.checks[index] = { ...record.checks[index], result, note }
  }

  if (mode === "LAEUFT") {
    record.checks.slice(0, 6).forEach((_, index) => set(index, "BESTANDEN"))
    return record
  }

  record.checks.forEach((_, index) => set(index, "BESTANDEN"))

  if (mode === "PROBLEM") {
    set(8, "PROBLEM", "Anzeige setzt bei Erschütterung aus.")
    return record
  }

  record.completedAt = daysAgo(9, 15)
  record.completedBy = "MT"
  record.note = "Vollständig geprüft, Testfahrt ohne Beanstandung."
  return record
}

function createUnit(spec: UnitSpec, articles: Article[]): ArticleUnit {
  const article = articles.find((entry) => entry.id === spec.articleId)!
  const arrival = daysAgo(spec.arrivalDays, 9)
  const label = `${article.manufacturer} ${article.name}`

  return {
    id: spec.id,
    articleId: spec.articleId,
    unitNumber: spec.unitNumber,
    serialNumber: spec.serial,
    variant: "",
    color: spec.color,
    mileageKm: spec.mileageKm,
    condition: spec.condition,
    description: "",
    attributes: {},
    purchasePriceCents: spec.purchaseCents,
    additionalCostsCents: spec.extraCents ?? 0,
    salePriceCents: spec.saleCents,
    purchaseDate: arrival,
    arrivalDate: arrival,
    locationId: spec.locationId,
    notes: spec.notes ?? "",
    workflowStatus: spec.workflow,
    saleStatus: "VERFUEGBAR",
    documents: {
      abe: spec.abe ?? false,
      invoice: spec.abe ?? false,
      other: false,
      note: "",
    },
    inspection: inspectionFor(spec.inspection),
    cleaning: spec.cleaned
      ? { done: true, doneAt: daysAgo(8, 11), note: "Grundreinigung erledigt." }
      : { done: false, doneAt: null, note: "" },
    repairs: (spec.repairs ?? []).map((repair, index) => ({
      ...repair,
      id: seedId("rep"),
      createdAt: daysAgo(spec.arrivalDays - 2 - index, 13),
    })),
    images: images(label, spec.imageCount ?? 1, "GERAET"),
    listings: CHANNELS.map(createEmptyListing),
    teardownId: null,
    importBatchId: null,
    createdAt: arrival,
    updatedAt: arrival,
  }
}

/* ------------------------------------------------------------------ */
/* Bewegungen, Ausschlachtung, Verkäufe                                */
/* ------------------------------------------------------------------ */

interface Booking {
  articleId: string
  quantity: number
  type: StockMovement["type"]
  unitCostCents?: number | null
  locationId?: string | null
  daysAgo: number
  note?: string
  referenceId?: string | null
}

/** Zugänge aus Einkauf — Grundlage der Durchschnittspreise. */
const PURCHASE_BOOKINGS: Booking[] = [
  { articleId: "art_reifen_85", quantity: 20, type: "ZUGANG", unitCostCents: 780, locationId: "loc_fahrwerk", daysAgo: 195, note: "Sammelbestellung Reifen" },
  { articleId: "art_reifen_85", quantity: 10, type: "ZUGANG", unitCostCents: 840, locationId: "loc_fahrwerk", daysAgo: 40, note: "Nachbestellung" },
  { articleId: "art_reifen_10", quantity: 14, type: "ZUGANG", unitCostCents: 1180, locationId: "loc_fahrwerk", daysAgo: 195, note: "Sammelbestellung Reifen" },
  { articleId: "art_bremsbelag", quantity: 40, type: "ZUGANG", unitCostCents: 380, locationId: "loc_fahrwerk", daysAgo: 205, note: "Großgebinde" },
  { articleId: "art_ladegeraet", quantity: 12, type: "ZUGANG", unitCostCents: 1290, locationId: "loc_elektrik", daysAgo: 155, note: "Neuware" },
  { articleId: "art_schloss", quantity: 8, type: "ZUGANG", unitCostCents: 2650, locationId: "loc_elektrik", daysAgo: 145, note: "Neuware" },
  { articleId: "art_disp_g30", quantity: 3, type: "ZUGANG", unitCostCents: 1900, locationId: "loc_elektrik", daysAgo: 90, note: "Restposten Händler" },
  { articleId: "art_disp_pro2", quantity: 3, type: "ZUGANG", unitCostCents: 1400, locationId: "loc_elektrik", daysAgo: 100, note: "Restposten Händler" },
  { articleId: "art_controller_g30", quantity: 2, type: "ZUGANG", unitCostCents: 3400, locationId: "loc_elektrik", daysAgo: 80, note: "Restposten Händler" },
]

/** Abgänge außerhalb von Verkauf und Reparatur. */
const OTHER_BOOKINGS: Booking[] = [
  { articleId: "art_bremsbelag", quantity: -1, type: "VERBRAUCH", locationId: "loc_fahrwerk", daysAgo: 30, note: "Eingebaut in SK-2026-0041" },
  { articleId: "art_reifen_10", quantity: -1, type: "VERBRAUCH", locationId: "loc_fahrwerk", daysAgo: 10, note: "Eingebaut in SK-2026-0043" },
  { articleId: "art_reifen_85", quantity: -2, type: "VERLUST", locationId: "loc_fahrwerk", daysAgo: 25, note: "Transportschaden, entsorgt" },
  { articleId: "art_bremsbelag", quantity: -6, type: "KORREKTUR", locationId: "loc_fahrwerk", daysAgo: 18, note: "Inventur: Zählung ergab 6 Stück weniger als gebucht" },
]

function toMovement(booking: Booking): StockMovement {
  return {
    id: seedId("mov"),
    at: daysAgo(booking.daysAgo, 11),
    actor: "MT",
    articleId: booking.articleId,
    unitId: null,
    quantity: booking.quantity,
    type: booking.type,
    unitCostCents: booking.unitCostCents ?? null,
    locationId: booking.locationId ?? null,
    toLocationId: null,
    referenceId: booking.referenceId ?? null,
    note: booking.note ?? "",
  }
}

/**
 * Die Ausschlachtung des Spendergeräts.
 *
 * Bewusst mit Verteilung nach Marktwert: Ein Akku trägt mehr vom Einkaufswert
 * als ein Schutzblech. Der Rest bleibt als Schrott stehen — der Rahmen des
 * Geräts hat keinen Wiederverkaufswert.
 */
function createTeardown(donor: ArticleUnit, article: Article) {
  const rawLines: TeardownLine[] = [
    { id: seedId("tdl"), articleId: "art_akku_pro2", quantity: 1, marketValueCents: 12900, valueShareCents: 0, locationId: "loc_elektrik", note: "Restkapazität ca. 78 %" },
    { id: seedId("tdl"), articleId: "art_disp_pro2", quantity: 1, marketValueCents: 3490, valueShareCents: 0, locationId: "loc_elektrik", note: "" },
    { id: seedId("tdl"), articleId: "art_schutzblech", quantity: 1, marketValueCents: 1490, valueShareCents: 0, locationId: "loc_fahrwerk", note: "" },
    { id: seedId("tdl"), articleId: "art_bremsbelag", quantity: 1, marketValueCents: 990, valueShareCents: 0, locationId: "loc_fahrwerk", note: "Noch gut zur Hälfte" },
  ]

  const sourceValueCents = donor.purchasePriceCents + donor.additionalCostsCents
  const { lines, scrapValueCents } = distributeTeardownValue(
    sourceValueCents,
    rawLines,
    "NACH_WERT"
  )

  const at = daysAgo(70, 14)

  const teardown: Teardown = {
    id: "tdn_seed_0001",
    at,
    actor: "MT",
    sourceUnitId: donor.id,
    sourceArticleId: donor.articleId,
    sourceLabel: `${article.manufacturer} ${article.name}`,
    sourceNumber: donor.unitNumber,
    sourceValueCents,
    distribution: "NACH_WERT",
    lines,
    scrapValueCents,
    status: "GEBUCHT",
    note: "Rahmen mit Wasserschaden entsorgt.",
    createdAt: at,
  }

  const movements: StockMovement[] = lines.map((line) => ({
    id: seedId("mov"),
    at,
    actor: "MT",
    articleId: line.articleId,
    unitId: null,
    quantity: line.quantity,
    type: "AUSSCHLACHTUNG",
    unitCostCents: line.valueShareCents,
    locationId: line.locationId,
    toLocationId: null,
    referenceId: teardown.id,
    note: `Aus ${donor.unitNumber}`,
  }))

  return { teardown, movements }
}

interface SaleSpec {
  articleId: string
  unitId: string | null
  itemNumber: string
  itemLabel: string
  serial?: string
  categoryLabel: string
  quantity: number
  channel: Sale["channel"]
  source: Sale["customerSource"]
  region: string
  saleLocation: string
  priceCents: number
  purchaseCents: number
  repairCents?: number
  extraCents?: number
  soldAt: string
  sync?: Sale["sheetsSyncStatus"]
  note?: string
}

const SALE_SPECS: SaleSpec[] = [
  { articleId: "art_g30", unitId: null, itemNumber: "SK-2026-0037", itemLabel: "Segway Ninebot MAX G30D", serial: "DEMO-NB-G30-20455", categoryLabel: "Scooter", quantity: 1, channel: "SHOPIFY", source: "GOOGLE", region: "Köln", saleLocation: "Versand", priceCents: 42900, purchaseCents: 23000, repairCents: 1800, extraCents: 900, soldAt: thisMonth(4), sync: "SYNCHRONISIERT" },
  { articleId: "art_pro2", unitId: null, itemNumber: "SK-2026-0035", itemLabel: "Xiaomi Mi Pro 2", serial: "DEMO-XM-PRO2-75110", categoryLabel: "Scooter", quantity: 1, channel: "VOR_ORT", source: "LAUFKUNDSCHAFT", region: "Bergisch Gladbach", saleLocation: "Lager", priceCents: 31900, purchaseCents: 17000, repairCents: 900, soldAt: thisMonth(9), sync: "SYNCHRONISIERT" },
  { articleId: "art_disp_g30", unitId: null, itemNumber: "ET-DISP-0002", itemLabel: "Segway Display MAX G30", categoryLabel: "Ersatzteile › Elektrik › Displays", quantity: 1, channel: "EBAY", source: "EBAY", region: "Hamburg", saleLocation: "Versand", priceCents: 4290, purchaseCents: 1900, soldAt: thisMonth(11), sync: "SYNCHRONISIERT", note: "Über eBay verkauft, Bestand nachgetragen." },
  { articleId: "art_reifen_85", unitId: null, itemNumber: "ET-REI-0001", itemLabel: "CST Reifen 8,5 Zoll Tubeless", categoryLabel: "Ersatzteile › Fahrwerk › Reifen", quantity: 4, channel: "EBAY", source: "EBAY", region: "Berlin", saleLocation: "Versand", priceCents: 6800, purchaseCents: 3160, soldAt: thisMonth(14), sync: "WARTET", note: "Vierersatz an Werkstatt." },
  { articleId: "art_ladegeraet", unitId: null, itemNumber: "ZUB-0001", itemLabel: "Skope Ladegerät 42V 2A", categoryLabel: "Zubehör", quantity: 2, channel: "SHOPIFY", source: "WEBSITE", region: "Leverkusen", saleLocation: "Versand", priceCents: 4980, purchaseCents: 2580, soldAt: thisMonth(16), sync: "FEHLER", note: "Reporting-Zeile konnte nicht geschrieben werden." },

  { articleId: "art_pro2", unitId: null, itemNumber: "SK-2026-0029", itemLabel: "Xiaomi Mi Pro 2", serial: "DEMO-XM-PRO2-73004", categoryLabel: "Scooter", quantity: 1, channel: "KLEINANZEIGEN", source: "KLEINANZEIGEN", region: "Düsseldorf", saleLocation: "Lager", priceCents: 29900, purchaseCents: 15500, repairCents: 2400, soldAt: monthsAgo(1, 12), sync: "SYNCHRONISIERT" },
  { articleId: "art_kqi3", unitId: null, itemNumber: "SK-2026-0026", itemLabel: "NIU KQi3 Pro", serial: "DEMO-NIU-KQI3-54008", categoryLabel: "Scooter", quantity: 1, channel: "SHOPIFY", source: "SOCIAL_MEDIA", region: "Bonn", saleLocation: "Versand", priceCents: 36900, purchaseCents: 20500, repairCents: 1200, extraCents: 600, soldAt: monthsAgo(1, 22), sync: "SYNCHRONISIERT" },
  { articleId: "art_bremsbelag", unitId: null, itemNumber: "ET-BRM-0001", itemLabel: "Zoom Bremsbeläge (Paar)", categoryLabel: "Ersatzteile › Fahrwerk › Bremsen", quantity: 8, channel: "EBAY", source: "EBAY", region: "München", saleLocation: "Versand", priceCents: 7120, purchaseCents: 3040, soldAt: monthsAgo(1, 26), sync: "SYNCHRONISIERT" },

  { articleId: "art_g30", unitId: null, itemNumber: "SK-2026-0021", itemLabel: "Segway Ninebot MAX G30D", serial: "DEMO-NB-G30-19870", categoryLabel: "Scooter", quantity: 1, channel: "VOR_ORT", source: "EMPFEHLUNG", region: "Köln", saleLocation: "Lager", priceCents: 44900, purchaseCents: 25000, repairCents: 800, soldAt: monthsAgo(2, 8), sync: "SYNCHRONISIERT" },
  { articleId: "art_disp_pro2", unitId: null, itemNumber: "ET-DISP-0001", itemLabel: "Xiaomi Display Pro 2", categoryLabel: "Ersatzteile › Elektrik › Displays", quantity: 2, channel: "EBAY", source: "EBAY", region: "Dortmund", saleLocation: "Versand", priceCents: 6980, purchaseCents: 2800, soldAt: monthsAgo(2, 19), sync: "SYNCHRONISIERT" },
  { articleId: "art_pro2", unitId: null, itemNumber: "SK-2026-0018", itemLabel: "Xiaomi Mi Pro 2", serial: "DEMO-XM-PRO2-70221", categoryLabel: "Scooter", quantity: 1, channel: "TELEFON", source: "STAMMKUNDE", region: "Köln", saleLocation: "Lager", priceCents: 30900, purchaseCents: 16800, repairCents: 1500, soldAt: monthsAgo(3, 14), sync: "SYNCHRONISIERT" },
  { articleId: "art_schloss", unitId: null, itemNumber: "ZUB-0002", itemLabel: "Abus Faltschloss", categoryLabel: "Zubehör", quantity: 3, channel: "SHOPIFY", source: "WEBSITE", region: "Aachen", saleLocation: "Versand", priceCents: 14970, purchaseCents: 7950, soldAt: monthsAgo(3, 25), sync: "SYNCHRONISIERT" },
  { articleId: "art_kalle", unitId: null, itemNumber: "SK-2026-0012", itemLabel: "Trittbrett Kalle", serial: "DEMO-TB-KALLE-29001", categoryLabel: "Scooter", quantity: 1, channel: "SHOPIFY", source: "GOOGLE", region: "Wuppertal", saleLocation: "Versand", priceCents: 79900, purchaseCents: 48000, repairCents: 2200, extraCents: 1100, soldAt: monthsAgo(4, 11), sync: "SYNCHRONISIERT" },
  { articleId: "art_reifen_10", unitId: null, itemNumber: "ET-REI-0002", itemLabel: "CST Reifen 10 Zoll", categoryLabel: "Ersatzteile › Fahrwerk › Reifen", quantity: 6, channel: "EBAY", source: "EBAY", region: "Essen", saleLocation: "Versand", priceCents: 13740, purchaseCents: 7080, soldAt: monthsAgo(4, 24), sync: "SYNCHRONISIERT" },
  { articleId: "art_g30", unitId: null, itemNumber: "SK-2026-0008", itemLabel: "Segway Ninebot MAX G30D", serial: "DEMO-NB-G30-18442", categoryLabel: "Scooter", quantity: 1, channel: "KLEINANZEIGEN", source: "KLEINANZEIGEN", region: "Neuss", saleLocation: "Lager", priceCents: 41900, purchaseCents: 24500, repairCents: 3100, soldAt: monthsAgo(5, 16), sync: "SYNCHRONISIERT" },
]

function createSales(): { sales: Sale[]; movements: StockMovement[] } {
  const sales: Sale[] = []
  const movements: StockMovement[] = []

  for (const spec of SALE_SPECS) {
    const sale: Sale = {
      id: seedId("sale"),
      articleId: spec.articleId,
      unitId: spec.unitId,
      itemNumber: spec.itemNumber,
      itemLabel: spec.itemLabel,
      serialNumber: spec.serial ?? "",
      categoryLabel: spec.categoryLabel,
      quantity: spec.quantity,
      channel: spec.channel,
      customerSource: spec.source,
      customerRegion: spec.region,
      saleLocation: spec.saleLocation,
      salePriceCents: spec.priceCents,
      purchasePriceCents: spec.purchaseCents,
      repairCostsCents: spec.repairCents ?? 0,
      additionalCostsCents: spec.extraCents ?? 0,
      soldAt: spec.soldAt,
      note: spec.note ?? "",
      cancelledAt: null,
      cancelReason: "",
      cancelRestocked: false,
      sheetsSyncStatus: spec.sync ?? "SYNCHRONISIERT",
      sheetsSyncedAt: spec.sync === "SYNCHRONISIERT" ? spec.soldAt : null,
      sheetsError:
        spec.sync === "FEHLER"
          ? "Google Sheets: Zeitüberschreitung beim Schreiben der Zeile."
          : null,
      sheetsRowNumber: spec.sync === "SYNCHRONISIERT" ? 100 + sales.length : null,
      createdAt: spec.soldAt,
    }
    sales.push(sale)

    // Nur Mengenartikel erzeugen eine Abgangsbuchung; verkaufte Einzelstücke
    // verlassen den Bestand über ihren eigenen Status.
    if (spec.unitId === null && !spec.itemNumber.startsWith("SK-")) {
      movements.push({
        id: seedId("mov"),
        at: spec.soldAt,
        actor: "MT",
        articleId: spec.articleId,
        unitId: null,
        quantity: -spec.quantity,
        type: "VERKAUF",
        unitCostCents: null,
        locationId: null,
        toLocationId: null,
        referenceId: sale.id,
        note: `Verkauf ${spec.itemNumber}`,
      })
    }
  }

  return { sales, movements }
}

/* ------------------------------------------------------------------ */
/* Protokoll und Importe                                               */
/* ------------------------------------------------------------------ */

function createActivity(units: ArticleUnit[], teardown: Teardown): AuditEvent[] {
  const events: AuditEvent[] = []

  const push = (
    daysBack: number,
    category: AuditEvent["category"],
    action: string,
    detail: string,
    level: AuditEvent["level"] = "info",
    ref: Partial<Pick<AuditEvent, "articleId" | "unitId" | "itemNumber">> = {}
  ) => {
    events.push({
      id: seedId("evt"),
      at: daysAgo(daysBack, 9 + (events.length % 8)),
      actor: "MT",
      category,
      action,
      detail,
      articleId: ref.articleId ?? null,
      unitId: ref.unitId ?? null,
      itemNumber: ref.itemNumber ?? null,
      level,
    })
  }

  push(180, "SYSTEM", "Bereiche angelegt", "Scooter, Ersatzteile, Zubehör mit Nummernkreisen eingerichtet.")
  push(120, "IMPORT", "Lieferantenliste eingelesen", "42 Zeilen, 40 übernommen, 2 Dubletten übersprungen.")
  push(96, "ARTIKEL", "Gerät erfasst", "SK-2026-0038 im Wareneingang aufgenommen.", "info", { unitId: "unt_07", itemNumber: "SK-2026-0038" })
  push(
    70,
    "AUSSCHLACHTUNG",
    "Gerät zerlegt",
    `${teardown.sourceNumber}: 4 Teile entnommen, ${(teardown.sourceValueCents / 100).toFixed(2).replace(".", ",")} € Einkaufswert verteilt.`,
    "warning",
    { unitId: teardown.sourceUnitId, itemNumber: teardown.sourceNumber }
  )
  push(40, "BESTAND", "Zugang gebucht", "10 × Reifen 8,5 Zoll Tubeless zu 8,40 € je Stück.", "success", { articleId: "art_reifen_85" })
  push(34, "ARTIKEL", "Gerät erfasst", "SK-2026-0041 im Wareneingang aufgenommen.", "info", { unitId: "unt_01", itemNumber: "SK-2026-0041" })
  push(25, "BESTAND", "Verlust gebucht", "2 × Reifen 8,5 Zoll: Transportschaden, entsorgt.", "warning", { articleId: "art_reifen_85" })
  push(18, "BESTAND", "Inventurkorrektur", "Bremsbeläge: Zählung 6 Stück unter Buchbestand.", "warning", { articleId: "art_bremsbelag" })
  push(12, "PRUEFUNG", "Prüfung abgeschlossen", "SK-2026-0041 ohne Beanstandung.", "success", { unitId: "unt_01", itemNumber: "SK-2026-0041" })
  push(10, "AUFBEREITUNG", "Ersatzteil verbaut", "1 × Reifen 10 Zoll in SK-2026-0043 eingebaut.", "info", { unitId: "unt_03", itemNumber: "SK-2026-0043" })
  push(6, "ARTIKEL", "Gerät erfasst", "SK-2026-0044 im Wareneingang aufgenommen.", "info", { unitId: "unt_04", itemNumber: "SK-2026-0044" })
  push(3, "IMPORT", "Sammelankauf eingelesen", "2 Geräte übernommen (SK-2026-0045, SK-2026-0046).")
  push(2, "KANAL", "Inserat vorbereitet", "3 Vorschläge warten auf Freigabe.", "warning")
  push(1, "SYNC", "Reporting fehlgeschlagen", "Google Sheets: Zeitüberschreitung beim Schreiben der Zeile.", "error")

  void units
  return events.sort((a, b) => b.at.localeCompare(a.at))
}

function createImportBatches(): ImportBatch[] {
  return [
    {
      id: seedId("imp"),
      fileName: "sammelankauf-2026-08.csv",
      source: "DATEI",
      categoryId: "cat_scooter",
      categoryLabel: "Scooter",
      stockMode: "SERIALISIERT",
      rowsTotal: 2,
      rowsImported: 2,
      rowsSkipped: 0,
      issues: [],
      createdAt: daysAgo(3, 8),
      createdBy: "MT",
    },
    {
      id: seedId("imp"),
      fileName: "lieferliste-ersatzteile.csv",
      source: "DEMO",
      categoryId: "cat_teile",
      categoryLabel: "Ersatzteile",
      stockMode: "MENGE",
      rowsTotal: 42,
      rowsImported: 40,
      rowsSkipped: 2,
      issues: [
        { row: 17, reference: "XM-DSP-PRO2", reason: "Teilenummer bereits vorhanden — Zugang gebucht statt Artikel angelegt.", severity: "warning" },
        { row: 31, reference: "", reason: "Ohne Bezeichnung und Teilenummer nicht zuordenbar.", severity: "error" },
      ],
      createdAt: daysAgo(120, 16),
      createdBy: "MT",
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Freigabeliste                                                       */
/* ------------------------------------------------------------------ */

/**
 * Die offenen Vorschläge des Demo-Bestands.
 *
 * Bewusst nicht von Hand geschrieben, sondern aus dem Bestand abgeleitet — mit
 * denselben Funktionen, die auch `refreshProposals` verwendet. Ein
 * mitgelieferter Vorschlagstext würde sonst schon beim ersten Preiswechsel
 * nicht mehr zum Artikel passen; so kann er das gar nicht.
 *
 * Der Fall `AUTOMATISCH` fehlt hier absichtlich: Automatisch veröffentlichen
 * heißt, einen Kanal anzusprechen. Das gehört in die Datenschicht, nicht in
 * einen Seed.
 */
function createProposals(input: {
  categories: Category[]
  articles: Article[]
  units: ArticleUnit[]
  movements: StockMovement[]
}): PublicationProposal[] {
  const levels = computeStockLevels(input)
  const proposals: PublicationProposal[] = []

  for (const article of input.articles) {
    if (article.archivedAt !== null) continue

    const settings = resolveCategorySettings(input.categories, article.categoryId)
    const channel = resolveChannel(article, settings)
    if (!channel) continue
    if (resolvePublishMode(article, settings) !== "VORSCHLAG") continue

    const listed = (item: { listings: { channel: string; status: string }[] }) =>
      item.listings.some(
        (listing) =>
          listing.channel === channel && listing.status === "VEROEFFENTLICHT"
      )

    if (article.stockMode === "MENGE") {
      if (listed(article)) continue
      const level = levels.get(article.id) ?? emptyStockLevel(article.id)
      if (!isReady(evaluateArticleReadiness(article, level, settings))) continue
      proposals.push(buildArticleProposal(article, level, settings, channel))
      continue
    }

    for (const unit of input.units) {
      if (unit.articleId !== article.id) continue
      if (!isUnitInStock(unit)) continue
      if (unit.saleStatus !== "VERFUEGBAR") continue
      if (listed(unit)) continue
      if (!isReady(evaluateUnitReadiness(unit, settings))) continue
      proposals.push(buildUnitProposal(article, unit, settings, channel))
    }
  }

  return proposals
}

/* ------------------------------------------------------------------ */
/* Zusammenbau                                                         */
/* ------------------------------------------------------------------ */

export interface SeedData {
  categories: Category[]
  locations: StorageLocation[]
  articles: Article[]
  units: ArticleUnit[]
  movements: StockMovement[]
  teardowns: Teardown[]
  proposals: PublicationProposal[]
  sales: Sale[]
  activity: AuditEvent[]
  importBatches: ImportBatch[]
}

export function createSeedData(): SeedData {
  idCounter = 0

  const categories = createCategories()
  const locations = createLocations()
  const articles = createArticles()

  const units = UNIT_SPECS.map((spec) => createUnit(spec, articles))
  const donor = createUnit(DONOR_SPEC, articles)

  const donorArticle = articles.find((a) => a.id === donor.articleId)!
  const { teardown, movements: teardownMovements } = createTeardown(
    donor,
    donorArticle
  )
  donor.teardownId = teardown.id
  units.push(donor)

  const { sales, movements: saleMovements } = createSales()

  const movements = [
    ...PURCHASE_BOOKINGS.map(toMovement),
    ...teardownMovements,
    ...OTHER_BOOKINGS.map(toMovement),
    ...saleMovements,
  ].sort((a, b) => b.at.localeCompare(a.at))

  return {
    categories,
    locations,
    articles,
    units,
    movements,
    teardowns: [teardown],
    proposals: createProposals({ categories, articles, units, movements }),
    sales,
    activity: createActivity(units, teardown),
    importBatches: createImportBatches(),
  }
}

export const SEED_SIGNATURE = "skope-demo-seed-v2"
