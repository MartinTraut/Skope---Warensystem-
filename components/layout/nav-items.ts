import {
  Activity,
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  FolderTree,
  LayoutDashboard,
  MapPin,
  PackageOpen,
  Package,
  Plug,
  Receipt,
  ScanLine,
  Send,
  Settings,
  Unplug,
  Upload,
  Wrench,
  type LucideIcon,
} from "lucide-react"

/**
 * Navigationsstruktur des Cockpits.
 *
 * Gegliedert nach dem tatsächlichen Arbeitsablauf, nicht nach technischen
 * Bereichen: Wer im Lager steht, sucht „Wareneingang", nicht „Datenimport".
 *
 * Die vier Gruppen entsprechen vier Orten im Betrieb — Lager, Werkstatt,
 * Vertrieb, Büro. Das ist der Grund, warum Ausschlachtung bei der Werkstatt
 * steht und nicht beim Bestand: Zerlegt wird an der Werkbank.
 */

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Welche Kennzahl als Zähler neben dem Eintrag steht. */
  badge?:
    | "inbound"
    | "inspection"
    | "refurbishment"
    | "proposals"
    | "reorder"
    | "failedSyncs"
  description: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Übersicht",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Lagerwert, Umsatz und laufende Vorgänge auf einen Blick",
      },
    ],
  },
  {
    label: "Lager",
    items: [
      {
        href: "/inventory",
        label: "Bestand",
        icon: Package,
        badge: "reorder",
        description: "Alle Artikel mit Menge, Wert und Lagerplatz",
      },
      {
        href: "/units",
        label: "Geräte",
        icon: Boxes,
        description: "Jedes Einzelstück mit Seriennummer, Status und Lagerplatz",
      },
      {
        href: "/inbound",
        label: "Wareneingang",
        icon: PackageOpen,
        badge: "inbound",
        description: "Neu eingetroffene Geräte und Teile erfassen",
      },
      {
        href: "/movements",
        label: "Bewegungen",
        icon: ArrowLeftRight,
        description: "Jede Zu- und Abbuchung mit Grund und Zeitpunkt",
      },
      {
        href: "/stocktake",
        label: "Inventur",
        icon: ScanLine,
        description: "Gezählte Mengen erfassen und Abweichungen buchen",
      },
    ],
  },
  {
    label: "Werkstatt",
    items: [
      {
        href: "/inspection",
        label: "Prüfung",
        icon: ClipboardCheck,
        badge: "inspection",
        description: "Offene und laufende Prüfprotokolle",
      },
      {
        href: "/refurbishment",
        label: "Aufbereitung",
        icon: Wrench,
        badge: "refurbishment",
        description: "Reinigung, Reparaturen und verbaute Ersatzteile",
      },
      {
        href: "/teardown",
        label: "Ausschlachtung",
        icon: Unplug,
        description: "Geräte zerlegen und den Einkaufswert auf die Teile verteilen",
      },
    ],
  },
  {
    label: "Vertrieb",
    items: [
      {
        href: "/proposals",
        label: "Freigaben",
        icon: Send,
        badge: "proposals",
        description: "Vorbereitete Inserate prüfen und einstellen",
      },
      {
        href: "/sales",
        label: "Verkäufe",
        icon: Receipt,
        description: "Umsatz, Marge und Reporting-Abgleich",
      },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      {
        href: "/categories",
        label: "Bereiche",
        icon: FolderTree,
        description: "Lagerstruktur, Merkmalsfelder und Kanalregeln",
      },
      {
        href: "/locations",
        label: "Lagerplätze",
        icon: MapPin,
        description: "Regale und Fächer",
      },
      {
        href: "/import",
        label: "Import",
        icon: Upload,
        description: "Lieferantenlisten einlesen und zuordnen",
      },
      {
        href: "/integrations",
        label: "Integrationen",
        icon: Plug,
        badge: "failedSyncs",
        description: "Shopify, eBay, Kleinanzeigen und Google Sheets",
      },
      {
        href: "/activity",
        label: "Aktivitäten",
        icon: Activity,
        description: "Vollständiges Protokoll aller Änderungen",
      },
    ],
  },
]

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Einstellungen",
  icon: Settings,
  description: "Demo-Daten, Benutzer und Systemverhalten",
}

/** Findet den passenden Navigationseintrag zu einem Pfad. */
export function findNavItem(pathname: string): NavItem | undefined {
  const all = [...NAV_GROUPS.flatMap((group) => group.items), SETTINGS_ITEM]
  return (
    all.find((item) => item.href === pathname) ??
    all.find((item) => pathname.startsWith(`${item.href}/`))
  )
}
