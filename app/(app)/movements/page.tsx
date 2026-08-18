import type { Metadata } from "next"

import { MovementsView } from "@/components/stock/movements-view"

export const metadata: Metadata = {
  title: "Bewegungen",
}

export default function Page() {
  return <MovementsView />
}
