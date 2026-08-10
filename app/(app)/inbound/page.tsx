import type { Metadata } from "next"

import { InboundView } from "@/components/worklist/inbound-view"

export const metadata: Metadata = { title: "Wareneingang" }

export default function InboundPage() {
  return <InboundView />
}
