import type { Metadata } from "next"

import { TeardownView } from "@/components/teardown/teardown-view"

export const metadata: Metadata = {
  title: "Ausschlachtung",
}

export default function Page() {
  return <TeardownView />
}
