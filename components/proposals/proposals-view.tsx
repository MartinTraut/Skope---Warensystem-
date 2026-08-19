"use client"

/* eslint-disable @next/next/no-img-element -- Bilder liegen als Data-URL bzw.
   später als Storage-URL vor; next/image bringt hier keinen Vorteil. */

import { useMemo, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Check, CheckCheck, Copy, Inbox, RefreshCw, X } from "lucide-react"

import { DateTimeText } from "@/components/skope/client-time"
import { InlineSelect } from "@/components/skope/form"
import { Modal } from "@/components/skope/modal"
import {
  EmptyState,
  Metric,
  Panel,
  PageHeader,
} from "@/components/skope/primitives"
import { ListSkeleton, MetricGridSkeleton } from "@/components/skope/skeletons"
import { StatusPill } from "@/components/skope/status-pill"
import { Button } from "@/components/ui/button"
import { useHydrated, useProposals } from "@/hooks/use-cockpit"
import { repositories } from "@/lib/data/demo-repository"
import { isMockChannel, mockChannelNote } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { formatCents, formatNumber } from "@/lib/domain/money"
import { proposalAsText } from "@/lib/domain/publishing"
import { CHANNEL_META, PROPOSAL_STATUS_META } from "@/lib/domain/status"
import { CHANNELS, type PublicationProposal } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Freigabeliste.
 *
 * Der Ort, an dem aus „so viel wie möglich automatisieren" ein einziger Knopf
 * wird: Das Cockpit baut Titel, Text, Merkmale und Bilder fertig auf; hier
 * bleibt die Entscheidung. Für Kanäle ohne Schnittstelle liegt der fertige
 * Text zum Übernehmen daneben — das System behauptet nicht, dort selbst
 * einzustellen.
 */
export function ProposalsView() {
  const hydrated = useHydrated()
  const proposals = useProposals()

  const [status, setStatus] = useState("OFFEN")
  const [channel, setChannel] = useState("alle")
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<PublicationProposal | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(
    () =>
      proposals
        .filter((proposal) => status === "alle" || proposal.status === status)
        .filter((proposal) => channel === "alle" || proposal.channel === channel)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [proposals, status, channel]
  )

  const open = proposals.filter((proposal) => proposal.status === "OFFEN")
  const openValue = open.reduce(
    (sum, proposal) => sum + proposal.priceCents * Math.max(1, proposal.quantity),
    0
  )

  const selectable = filtered.filter((proposal) => proposal.status === "OFFEN")
  const allSelected =
    selectable.length > 0 && selected.length === selectable.length

  async function refresh() {
    setBusy(true)
    const result = await runAction(repositories.publishing.refreshProposals(), {
      failure: "Freigabeliste nicht aktualisiert",
    })
    setBusy(false)
    if (result) {
      toast.success("Freigabeliste aktualisiert", {
        description: `${result.created} neu, ${result.removed} entfallen.`,
      })
    }
  }

  async function approveSelected() {
    if (selected.length === 0) return
    // Vor dem Leeren der Auswahl bestimmen: Danach ist nicht mehr feststellbar,
    // welche Kanäle betroffen waren.
    const demoChannelsSelected = proposals
      .filter((proposal) => selected.includes(proposal.id))
      .some((proposal) => isMockChannel(proposal.channel))
    setBusy(true)
    const result = await runAction(
      repositories.publishing.approveMany(selected),
      { failure: "Freigabe fehlgeschlagen" }
    )
    setBusy(false)
    setSelected([])

    if (result) {
      // Ehrliche Rückmeldung: Teilerfolge werden benannt, nicht geschluckt.
      if (result.failed > 0) {
        toast.warning(`${result.approved} freigegeben, ${result.failed} fehlgeschlagen`, {
          description: "Die fehlgeschlagenen Einträge stehen weiter offen.",
        })
      } else {
        toast.success(`${result.approved} Inserat(e) freigegeben`, {
          description: demoChannelsSelected
            ? "Demo-Betrieb — es wurde nichts an die Kanäle gesendet."
            : undefined,
        })
      }
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Freigaben"
        description="Vorbereitete Inserate. Das Cockpit baut sie vollständig auf — hier entscheidest du, was rausgeht."
        actions={
          <>
            <Button
              variant="outline"
              className="h-10 gap-2 px-4"
              onClick={refresh}
              disabled={busy}
            >
              <RefreshCw className={cn("size-4", busy && "animate-spin")} />
              Neu aufbauen
            </Button>
            <Button
              className="h-10 gap-2 px-4"
              onClick={approveSelected}
              disabled={selected.length === 0 || busy}
            >
              <CheckCheck className="size-4" />
              {selected.length > 0
                ? `${selected.length} freigeben`
                : "Freigeben"}
            </Button>
          </>
        }
      />

      {!hydrated ? (
        <MetricGridSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric
            label="Offene Vorschläge"
            value={formatNumber(open.length)}
            hint="warten auf einen Klick"
            icon={<Inbox className="size-4" />}
            accent={open.length > 0}
          />
          <Metric
            label="Angebotswert"
            value={formatCents(openValue)}
            hint="Summe der offenen Vorschläge"
          />
          <Metric
            label="Entschieden"
            value={formatNumber(proposals.length - open.length)}
            hint="freigegeben oder abgelehnt"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <InlineSelect
          value={status}
          onChange={(event) => {
            setStatus(event.target.value)
            setSelected([])
          }}
          options={[
            { value: "OFFEN", label: "Offen" },
            { value: "FREIGEGEBEN", label: "Freigegeben" },
            { value: "ABGELEHNT", label: "Abgelehnt" },
            { value: "alle", label: "Alle" },
          ]}
        />
        <InlineSelect
          value={channel}
          onChange={(event) => setChannel(event.target.value)}
          options={[
            { value: "alle", label: "Alle Kanäle" },
            ...CHANNELS.map((entry) => ({
              value: entry,
              label: CHANNEL_META[entry].label,
            })),
          ]}
        />
        {selectable.length > 0 && (
          <Button
            variant="ghost"
            className="h-10 px-3.5 text-sm"
            onClick={() =>
              setSelected(
                allSelected ? [] : selectable.map((proposal) => proposal.id)
              )
            }
          >
            {allSelected ? "Auswahl aufheben" : "Alle offenen wählen"}
          </Button>
        )}
      </div>

      <Panel className="overflow-hidden">
        {!hydrated ? (
          <ListSkeleton rows={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="Nichts zur Freigabe"
            description="Sobald ein Artikel oder Gerät alle Voraussetzungen erfüllt, entsteht hier automatisch ein fertiger Vorschlag."
            action={
              <Button className="h-10 px-4" onClick={refresh} disabled={busy}>
                Liste neu aufbauen
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-skope-line">
            {filtered.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                checked={selected.includes(proposal.id)}
                onToggle={() =>
                  setSelected((current) =>
                    current.includes(proposal.id)
                      ? current.filter((id) => id !== proposal.id)
                      : [...current, proposal.id]
                  )
                }
                onPreview={() => setPreview(proposal)}
              />
            ))}
          </ul>
        )}
      </Panel>

      <PreviewDialog
        proposal={preview}
        onOpenChange={(open) => !open && setPreview(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Zeile                                                               */
/* ------------------------------------------------------------------ */

function ProposalRow({
  proposal,
  checked,
  onToggle,
  onPreview,
}: {
  proposal: PublicationProposal
  checked: boolean
  onToggle: () => void
  onPreview: () => void
}) {
  const [busy, setBusy] = useState(false)
  const meta = CHANNEL_META[proposal.channel]
  const statusMeta = PROPOSAL_STATUS_META[proposal.status]
  const isOpen = proposal.status === "OFFEN"

  async function approve() {
    setBusy(true)
    await runAction(repositories.publishing.approve(proposal.id), {
      success: meta.automated
        ? `Auf ${meta.label} veröffentlicht`
        : `Als auf ${meta.label} inseriert vermerkt`,
      successDescription: mockChannelNote(proposal.channel),
      failure: "Freigabe fehlgeschlagen",
    })
    setBusy(false)
  }

  async function reject() {
    setBusy(true)
    await runAction(
      repositories.publishing.reject(proposal.id, "Manuell abgelehnt"),
      { success: "Vorschlag abgelehnt", failure: "Ablehnung fehlgeschlagen" }
    )
    setBusy(false)
  }

  const href =
    proposal.targetType === "UNIT"
      ? `/units/${proposal.targetId}`
      : `/inventory/${proposal.articleId}`

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5">
      {isOpen && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`${proposal.title} auswählen`}
          className="size-4 shrink-0 accent-[var(--skope-accent,#7dd956)]"
        />
      )}

      {proposal.imageUrls[0] ? (
        <img
          src={proposal.imageUrls[0]}
          alt=""
          className="size-12 shrink-0 rounded-lg border border-skope-line object-cover"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-dashed border-skope-line text-[11px] text-muted-foreground">
          kein Bild
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="truncate rounded text-sm font-medium text-foreground transition-colors hover:text-skope-accent"
          >
            {proposal.title}
          </Link>
          <StatusPill tone="neutral" size="sm" dot={false}>
            {meta.label}
          </StatusPill>
          {!isOpen && (
            <StatusPill tone={statusMeta.tone} size="sm" dot={false}>
              {statusMeta.label}
            </StatusPill>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatCents(proposal.priceCents)}
          {proposal.quantity > 1 && ` · ${proposal.quantity} Stück`}
          {proposal.attributeLines.length > 0 &&
            ` · ${proposal.attributeLines.length} Merkmale`}
          {" · "}
          <DateTimeText iso={proposal.createdAt} />
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" className="h-9 px-3.5" onClick={onPreview}>
          Vorschau
        </Button>
        {isOpen && (
          <>
            <Button
              variant="ghost"
              className="size-9 p-0 text-muted-foreground hover:text-state-error"
              aria-label="Ablehnen"
              disabled={busy}
              onClick={reject}
            >
              <X className="size-4" />
            </Button>
            {/*
              Umrandet statt gefüllt.

              Bei zwölf offenen Vorschlägen stünden zwölf vollflächig grüne
              Knöpfe untereinander — der Markenakzent verliert seine Bedeutung,
              wenn er sich über eine ganze Liste wiederholt. Gefüllt bleibt
              allein die Sammelfreigabe im Kopf; die Zeilenaktion trägt den
              Akzent in Rand und Schrift und ist damit trotzdem eindeutig die
              Hauptaktion der Zeile.
            */}
            <Button
              variant="outline"
              className="h-9 gap-2 border-skope-accent/45 px-3.5 text-skope-accent hover:border-skope-accent/70 hover:bg-skope-accent/10 hover:text-skope-accent"
              disabled={busy}
              onClick={approve}
            >
              <Check className="size-4" />
              {busy ? "…" : meta.automated ? "Einstellen" : "Freigeben"}
            </Button>
          </>
        )}
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Vorschau                                                            */
/* ------------------------------------------------------------------ */

function PreviewDialog({
  proposal,
  onOpenChange,
}: {
  proposal: PublicationProposal | null
  onOpenChange: (open: boolean) => void
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!proposal) return
    try {
      await navigator.clipboard.writeText(proposalAsText(proposal))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error("Kopieren nicht möglich", {
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <Modal
      open={proposal !== null}
      onOpenChange={onOpenChange}
      title="Inserat-Vorschau"
      description={proposal ? CHANNEL_META[proposal.channel].label : ""}
      size="lg"
      footer={
        <>
          <Button
            variant="outline"
            className="h-10 gap-2 px-4"
            onClick={copy}
          >
            {copied ? (
              <Check className="size-4 text-state-ready" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? "Kopiert" : "Text kopieren"}
          </Button>
          <Button className="h-10 px-4" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </>
      }
    >
      {proposal && (
        <div className="space-y-5">
          <div>
            <p className="type-label">Titel</p>
            <p className="mt-1 text-base font-medium text-foreground">
              {proposal.title}
            </p>
            <p className="mt-1 type-caption text-muted-foreground">
              {proposal.title.length} von 80 Zeichen
            </p>
          </div>

          {proposal.imageUrls.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {proposal.imageUrls.map((url, index) => (
                <img
                  key={url}
                  src={url}
                  alt={`Bild ${index + 1}`}
                  className="size-24 shrink-0 rounded-lg border border-skope-line object-cover"
                />
              ))}
            </div>
          )}

          <div>
            <p className="type-label">Beschreibung</p>
            <pre className="mt-1.5 rounded-lg border border-skope-line bg-surface-sunken p-3.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/85">
              {proposal.description}
            </pre>
          </div>

          {proposal.attributeLines.length > 0 && (
            <div>
              <p className="type-label">Artikelmerkmale</p>
              <ul className="mt-1.5 space-y-1">
                {proposal.attributeLines.map((line) => (
                  <li key={line} className="text-sm text-foreground/85">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-baseline justify-between border-t border-skope-line pt-4">
            <span className="text-sm text-muted-foreground">Preis</span>
            <span className="text-lg font-medium tabular-nums text-foreground">
              {formatCents(proposal.priceCents)}
              {proposal.quantity > 1 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  × {proposal.quantity}
                </span>
              )}
            </span>
          </div>
        </div>
      )}
    </Modal>
  )
}
