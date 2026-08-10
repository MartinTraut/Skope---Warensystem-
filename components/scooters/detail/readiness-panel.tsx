"use client"

import { Check, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { evaluateReadiness } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Freigabecheck vor der Veröffentlichung.
 *
 * Zeigt nicht nur, *dass* etwas fehlt, sondern genau *was* — sonst rät der
 * Mitarbeiter, warum der Button ausgegraut ist. Die Regeln kommen aus
 * `evaluateReadiness` und gelten später serverseitig genauso.
 */
export function ReadinessPanel({ scooter }: { scooter: Scooter }) {
  const [working, setWorking] = useState(false)
  const checks = evaluateReadiness(scooter)
  const open = checks.filter((check) => !check.ok)
  const ready = open.length === 0

  if (scooter.saleStatus === "VERKAUFT") return null

  async function setReady() {
    setWorking(true)
    const result = await repositories.scooters.updateWorkflowStatus(
      scooter.id,
      "VERKAUFSBEREIT"
    )
    setWorking(false)

    if (!result.ok) {
      toast.error("Status nicht geändert", { description: result.message })
      return
    }
    toast.success(`${scooter.scooterNumber} ist verkaufsbereit`, {
      description: "Der Scooter kann jetzt auf den Kanälen veröffentlicht werden.",
    })
  }

  return (
    <Panel accent={ready}>
      <PanelHeader
        title="Freigabe"
        description={
          ready
            ? "Alle Voraussetzungen erfüllt."
            : `${open.length} offene Voraussetzung${open.length === 1 ? "" : "en"} bis zur Verkaufsfreigabe.`
        }
        action={
          ready && scooter.workflowStatus !== "VERKAUFSBEREIT" ? (
            <Button className="h-9 px-3.5" onClick={setReady} disabled={working}>
              {working ? "…" : "Verkaufsbereit setzen"}
            </Button>
          ) : null
        }
      />
      <PanelBody className="p-3 sm:p-3">
        <ul className="space-y-0.5">
          {checks.map((check) => (
            <li
              key={check.label}
              className="flex items-start gap-2.5 rounded-lg px-2.5 py-2"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border",
                  check.ok
                    ? "border-state-ready/35 bg-state-ready/12 text-state-ready"
                    : "border-state-warn/35 bg-state-warn/10 text-state-warn"
                )}
                aria-hidden
              >
                {check.ok ? (
                  <Check className="size-3" strokeWidth={3} />
                ) : (
                  <CircleAlert className="size-3" />
                )}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-[0.8125rem]",
                    check.ok ? "text-foreground/70" : "font-medium text-foreground"
                  )}
                >
                  {check.label}
                </p>
                {!check.ok && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {check.hint}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  )
}
