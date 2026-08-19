"use client"

import { useState, type ReactNode } from "react"

import { Modal } from "@/components/skope/modal"
import { Button } from "@/components/ui/button"

/**
 * Rückfrage vor einer Aktion, die Daten vernichtet.
 *
 * Bilder und Reparaturen ließen sich mit einem einzigen Tap löschen — am
 * Tablet liegt der Papierkorb direkt neben „Als Titelbild setzen", und
 * Reparaturkosten fließen in die Marge. Ein Fehlgriff war damit unwiderruflich.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Löschen",
  cancelLabel = "Abbrechen",
  tone = "destructive",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /**
   * Nicht jede Rückfrage steht vor einer Vernichtung. Ein Vorgang, der nur
   * schwer rückgängig zu machen ist (Buchen, Einstellen), wird bestätigt,
   * aber nicht rot angemalt — sonst stumpft die Warnfarbe ab, wo sie zählt.
   */
  tone?: "destructive" | "default"
  onConfirm: () => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={busy ? () => {} : onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button
            variant="outline"
            className="h-11 px-4"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            className="h-11 px-4"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Wird ausgeführt …" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-foreground/85">
        {description}
      </div>
    </Modal>
  )
}
