import { Suspense } from "react"
import type { Metadata } from "next"

import { InventoryView } from "@/components/inventory/inventory-view"
import { TableSkeleton } from "@/components/skope/skeletons"

export const metadata: Metadata = {
  title: "Bestand",
}

export default function InventoryPage() {
  return (
    // Die Filter lesen die URL — das erfordert eine Suspense-Grenze.
    <Suspense fallback={<TableSkeleton rows={8} />}>
      <InventoryView />
    </Suspense>
  )
}
