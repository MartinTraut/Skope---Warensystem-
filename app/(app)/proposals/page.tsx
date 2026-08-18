import type { Metadata } from "next"

import { ProposalsView } from "@/components/proposals/proposals-view"

export const metadata: Metadata = {
  title: "Freigaben",
}

export default function Page() {
  return <ProposalsView />
}
