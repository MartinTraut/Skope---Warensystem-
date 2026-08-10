import { AppShell } from "@/components/layout/app-shell"

/** Alle Cockpit-Seiten laufen im gemeinsamen Rahmen aus Sidebar und Topbar. */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
