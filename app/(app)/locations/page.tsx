import type { Metadata } from "next"

import { LocationsView } from "@/components/stock/locations-view"

export const metadata: Metadata = {
  title: "Lagerplätze",
}

export default function Page() {
  return <LocationsView />
}
