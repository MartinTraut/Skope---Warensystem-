import type { Metadata } from "next"

import { ImportWizard } from "@/components/import/import-wizard"

export const metadata: Metadata = { title: "Import" }

export default function ImportPage() {
  return <ImportWizard />
}
