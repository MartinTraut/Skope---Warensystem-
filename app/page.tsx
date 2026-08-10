import { redirect } from "next/navigation"

/** Einstiegspunkt — das Cockpit startet immer auf dem Dashboard. */
export default function RootPage() {
  redirect("/dashboard")
}
