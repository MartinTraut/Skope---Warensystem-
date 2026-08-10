import type { Metadata } from "next"

import { RefurbishmentView } from "@/components/worklist/refurbishment-view"

export const metadata: Metadata = { title: "Aufbereitung" }

export default function RefurbishmentPage() {
  return <RefurbishmentView />
}
