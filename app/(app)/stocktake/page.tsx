import type { Metadata } from "next"

import { StocktakeView } from "@/components/stock/stocktake-view"

export const metadata: Metadata = {
  title: "Inventur",
}

export default function Page() {
  return <StocktakeView />
}
