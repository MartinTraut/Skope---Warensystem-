"use client"

import { Check, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

import { Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { evaluateReadiness } from "@/lib/domain/status"
import type { Scooter } from "@/lib/domain/types"

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
  const done = checks.filter((check) => check.ok)
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
    <Panel accent={ready} tone={ready ? undefined : "warn"}>
      <PanelHeader
        tone={ready ? undefined : "warn"}
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
      {/*
        Offen und erledigt sind getrennt.

        Vorher lief beides in einer Liste durch, in gleicher Größe und
        gleichem Abstand — der eine offene Punkt stand irgendwo zwischen acht
        Haken und war beim Überfliegen nicht zu finden. Jetzt steht oben, was
        zu tun ist; das Erledigte trägt darunter nur noch als Beleg.
      */}
      <PanelBody className="space-y-4 p-3 sm:p-3.5">
        {open.length > 0 && (
          <ul className="space-y-2">
            {open.map((check) => (
              <li
                key={check.label}
                className="flex items-start gap-2.5 rounded-lg border border-state-warn/30 bg-state-warn/8 px-3 py-2.5"
              >
                <CircleAlert
                  className="mt-0.5 size-4 shrink-0 text-state-warn"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {check.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-foreground/70">
                    {check.hint}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {done.length > 0 && (
          <div>
            {open.length > 0 && (
              <p className="type-label mb-2 px-1">
                Erledigt · {done.length} von {checks.length}
              </p>
            )}
            <ul className="space-y-0.5">
              {done.map((check) => (
                <li
                  key={check.label}
                  className="flex items-center gap-2.5 px-1 py-1"
                >
                  <span
                    className="grid size-[18px] shrink-0 place-items-center rounded-full border border-state-ready/35 bg-state-ready/12 text-state-ready"
                    aria-hidden
                  >
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 truncate type-body-sm text-foreground/65">
                    {check.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}
