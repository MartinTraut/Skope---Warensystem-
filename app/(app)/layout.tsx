import { AppShell } from "@/components/layout/app-shell"
import { PersistenceBanner } from "@/components/skope/persistence-banner"

/** Alle Cockpit-Seiten laufen im gemeinsamen Rahmen aus Sidebar und Topbar. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppShell>
      {/* Meldet stumme Speicherfehler, bevor Arbeit verloren geht. */}
      <PersistenceBanner />
      {children}
    </AppShell>
  )
}
