"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ChevronsLeft,
  Menu,
  PanelsTopLeft,
  Plus,
  Search,
  X,
} from "lucide-react"

import { SkopeLogo } from "@/components/brand/skope-logo"
import { NAV_GROUPS, SETTINGS_ITEM, findNavItem, type NavItem } from "./nav-items"
import { useCurrentUser, useDashboardMetrics } from "@/hooks/use-cockpit"
import { useCockpitStore } from "@/lib/store/cockpit-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DemoTag } from "@/components/skope/primitives"
import { FOCUS_RING } from "@/components/skope/focus"
import { NewScooterDialog } from "@/components/scooters/new-scooter-dialog"

/**
 * Rahmen der Anwendung: feste Sidebar links, Topbar oben, Inhalt in der Mitte.
 * Unter 1024 px wird die Sidebar zu einem Drawer.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  // Die Sidebar-Vorliebe liegt im persistierten Store — dadurch überlebt sie
  // den Seitenwechsel, ohne dass ein Effekt localStorage synchronisieren muss.
  const collapsed = useCockpitStore((state) => state.sidebarCollapsed)
  const setCollapsed = useCockpitStore((state) => state.setSidebarCollapsed)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const drawerRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)

  // Auf dem Telefon darf der Hintergrund nicht mitscrollen.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [drawerOpen])

  // Fokus in den Drawer holen und beim Schließen zum Auslöser zurückgeben —
  // sonst steht der Tastaturfokus hinter dem Overlay auf der verdeckten Seite.
  useEffect(() => {
    if (drawerOpen) {
      drawerRef.current?.querySelector<HTMLElement>(
        "a, button, [tabindex]:not([tabindex='-1'])"
      )?.focus()
    } else {
      openerRef.current?.focus({ preventScroll: true })
    }
  }, [drawerOpen])

  return (
    <div className="min-h-svh">
      {/* Desktop-Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col border-r border-skope-line bg-sidebar transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-[4.5rem]" : "w-64"
        )}
      >
        <SidebarContent
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed(!collapsed)}
          onCreate={() => setCreateOpen(true)}
        />
      </aside>

      {/*
        Mobiler Drawer.

        Bewusst als Dialog ausgezeichnet und mit Escape schließbar: Vorher war
        es ein einfaches <div> ohne Rolle — Screenreader kündigten nichts an,
        Escape tat nichts, und mit Tab lief man durch die verdeckte Seite.
      */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") setDrawerOpen(false)
          }}
        >
          <button
            type="button"
            aria-label="Navigation schließen"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px] duration-200 animate-in fade-in"
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-skope-line bg-sidebar duration-300 animate-in slide-in-from-left"
          >
            <SidebarContent
              collapsed={false}
              onClose={() => setDrawerOpen(false)}
              onNavigate={() => setDrawerOpen(false)}
              onCreate={() => {
                setDrawerOpen(false)
                setCreateOpen(true)
              }}
            />
          </div>
        </div>
      )}

      {/* Inhalt */}
      <div
        className={cn(
          "flex min-h-svh flex-col transition-[padding] duration-300 ease-out",
          collapsed ? "lg:pl-[4.5rem]" : "lg:pl-64"
        )}
      >
        <Topbar
          openerRef={openerRef}
          onOpenDrawer={() => setDrawerOpen(true)}
          onCreate={() => setCreateOpen(true)}
        />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[100rem]">{children}</div>
        </main>
      </div>

      <NewScooterDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function SidebarContent({
  collapsed,
  onToggleCollapse,
  onClose,
  onCreate,
  onNavigate,
}: {
  collapsed: boolean
  onToggleCollapse?: () => void
  onClose?: () => void
  onCreate: () => void
  /** Im mobilen Drawer: schließt die Navigation nach der Auswahl. */
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const metrics = useDashboardMetrics()
  const user = useCurrentUser()

  const badgeValues: Record<string, number> = {
    inbound: metrics.inbound,
    inspection: metrics.inInspection,
    refurbishment: metrics.inRefurbishment,
    failedSyncs: metrics.failedSyncs,
  }

  return (
    <>
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-skope-line",
          collapsed ? "justify-center px-3" : "justify-between px-5"
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center rounded-md focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none"
          aria-label="SKOPE Cockpit — zum Dashboard"
        >
          <SkopeLogo height={collapsed ? 36 : 48} compact={collapsed} />
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Navigation schließen"
            className={cn(
              "grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors",
              "hover:bg-surface-raised hover:text-foreground",
              FOCUS_RING
            )}
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <div className="mb-4 px-2">
            <Button
              onClick={onCreate}
              className="h-10 w-full justify-center gap-2 font-medium"
            >
              <Plus className="size-4" />
              Scooter hinzufügen
            </Button>
          </div>
        )}

        <div className="space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-medium tracking-[0.14em] text-muted-foreground/70 uppercase">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      collapsed={collapsed}
                      active={isActive(pathname, item.href)}
                      badge={item.badge ? badgeValues[item.badge] : undefined}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t border-skope-line p-3">
        <NavLink
          item={SETTINGS_ITEM}
          collapsed={collapsed}
          active={isActive(pathname, SETTINGS_ITEM.href)}
          onNavigate={onNavigate}
        />

        <div
          className={cn(
            "mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5",
            collapsed && "justify-center px-0"
          )}
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full border border-skope-gold/30 bg-skope-gold/10 type-caption font-medium text-skope-gold"
            aria-hidden
          >
            {user.initials}
          </span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate type-body-sm font-medium text-foreground">
                {user.name}
              </p>
              <p className="type-caption text-muted-foreground">
                {user.role === "admin" ? "Administrator" : "Mitarbeiter"} ·
                Demo-Konto
              </p>
            </div>
          )}
        </div>

        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Navigation ausklappen" : "Navigation einklappen"}
            className={cn(
              "mt-1 flex h-11 w-full items-center gap-3 rounded-lg px-3 type-body-sm text-muted-foreground transition-colors hover:bg-surface-raised hover:text-foreground",
              FOCUS_RING,
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <PanelsTopLeft className="size-4" />
            ) : (
              <>
                <ChevronsLeft className="size-4" />
                Einklappen
              </>
            )}
          </button>
        )}
      </div>
    </>
  )
}

function NavLink({
  item,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  badge?: number
  onNavigate?: () => void
}) {
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      /*
        Eingeklappt trägt der Link nur ein Symbol. Ohne Beschriftung liest ein
        Screenreader gar nichts vor, und der Zähler wäre als reiner Punkt
        ebenfalls verloren — deshalb beides hier zusammengefasst.
      */
      aria-label={
        collapsed
          ? badge && badge > 0
            ? `${item.label}, ${badge} offen`
            : item.label
          : undefined
      }
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-150",
        "focus-visible:ring-3 focus-visible:ring-skope-gold/25 focus-visible:outline-none",
        active
          ? "bg-skope-gold/10 font-medium text-skope-gold"
          : "text-sidebar-foreground hover:bg-surface-raised hover:text-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      {/* Aktivmarke am linken Rand — ruhiger als eine vollflächige Färbung. */}
      {active && (
        <span
          className="absolute inset-y-1.5 -left-3 w-0.5 rounded-r-full bg-skope-gold"
          aria-hidden
        />
      )}
      <Icon className={cn("size-[1.05rem] shrink-0", active && "text-skope-gold")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "grid h-5 min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[10px] font-medium tabular-nums",
            item.badge === "failedSyncs"
              ? "bg-state-error/15 text-state-error"
              : "bg-surface-track text-muted-foreground"
          )}
        >
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && badge > 0 && (
        <span
          className={cn(
            "absolute top-1.5 right-2.5 size-1.5 rounded-full",
            item.badge === "failedSyncs" ? "bg-state-error" : "bg-skope-gold"
          )}
          aria-hidden
        />
      )}
    </Link>
  )
}

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/* ------------------------------------------------------------------ */
/* Topbar                                                              */
/* ------------------------------------------------------------------ */

function Topbar({
  openerRef,
  onOpenDrawer,
  onCreate,
}: {
  openerRef: React.RefObject<HTMLButtonElement | null>
  onOpenDrawer: () => void
  onCreate: () => void
}) {
  const pathname = usePathname()
  const current = findNavItem(pathname)

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-skope-line bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <button
        type="button"
        ref={openerRef}
        onClick={onOpenDrawer}
        aria-label="Navigation öffnen"
        className={cn(
          "grid size-11 shrink-0 place-items-center rounded-lg border border-skope-line text-muted-foreground transition-colors",
          "hover:border-skope-line-strong hover:text-foreground lg:hidden",
          FOCUS_RING
        )}
      >
        <Menu className="size-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 lg:hidden">
          <SkopeLogo height={34} />
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-medium text-foreground">
            {current?.label ?? "Cockpit"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {current?.description ?? "SKOPE Warenwirtschaft"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <DemoTag className="hidden sm:inline-flex">Demo-Modus</DemoTag>
        <Link
          href="/scooters"
          aria-label="Scooter suchen"
          className="grid size-10 place-items-center rounded-lg border border-skope-line text-muted-foreground transition-colors hover:border-skope-line-strong hover:text-foreground sm:hidden"
        >
          <Search className="size-4" />
        </Link>
        <Button onClick={onCreate} className="h-10 gap-2 px-3.5">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Scooter</span>
        </Button>
      </div>
    </header>
  )
}
