import { Suspense } from "react"
import type { Metadata } from "next"

import { ScooterListView } from "@/components/scooters/scooter-list-view"
import { TableSkeleton } from "@/components/skope/skeletons"

export const metadata: Metadata = {
  title: "Scooter",
}

export default function ScootersPage() {
  return (
    // Die Filter lesen die URL — das erfordert eine Suspense-Grenze.
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <ScooterListView />
    </Suspense>
  )
}
