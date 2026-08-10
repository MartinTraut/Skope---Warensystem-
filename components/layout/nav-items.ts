import {
  Activity,
  ClipboardCheck,
  LayoutDashboard,
  PackageOpen,
  Plug,
  Receipt,
  Settings,
  Upload,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react"

/**
 * Navigationsstruktur des Cockpits.
 *
 * Gruppiert nach dem tatsächlichen Arbeitsablauf, nicht nach technischen
 * Bereichen: Wer im Lager steht, sucht "Wareneingang", nicht "Datenimport".
 */

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Welche Kennzahl als Zähler neben dem Eintrag steht. */
  badge?: "inbound" | "inspection" | "refurbishment" | "failedSyncs"
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
        description: "Bestand, Umsatz und laufende Vorgänge auf einen Blick",
      },
    ],
  },
  {
    label: "Warenprozess",
    items: [
      {
        href: "/scooters",
        label: "Scooter",
        icon: Zap,
        description: "Gesamter Bestand mit Filtern und Suche",
      },
      {
        href: "/inbound",
        label: "Wareneingang",
        icon: PackageOpen,
        badge: "inbound",
        description: "Neu eingetroffene Geräte erfassen und starten",
      },
      {
        href: "/import",
        label: "Import",
        icon: Upload,
        description: "Lieferantenlisten einlesen und zuordnen",
      },
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
        description: "Reinigung, Reparaturen und Ersatzteile",
      },
    ],
  },
  {
    label: "Vertrieb",
    items: [
      {
        href: "/sales",
        label: "Verkäufe",
        icon: Receipt,
        description: "Umsatz, Marge und Reporting-Abgleich",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/integrations",
        label: "Integrationen",
        icon: Plug,
        badge: "failedSyncs",
        description: "Shopify, Kleinanzeigen, Google Sheets und Avides",
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
