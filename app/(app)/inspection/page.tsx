import type { Metadata } from "next"

import { InspectionView } from "@/components/worklist/inspection-view"

export const metadata: Metadata = { title: "Prüfung" }

export default function InspectionPage() {
  return <InspectionView />
}
