"use client"

import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { FOCUS_RING } from "@/components/skope/focus"
import { cn } from "@/lib/utils"

/**
 * Einheitlicher Dialograhmen.
 *
 * Auf schmalen Viewports wird der Dialog bewusst zu einem bodenbündigen Blatt:
 * am Telefon ist das mit dem Daumen erreichbar, ein mittig schwebendes Fenster
 * nicht. Ab `sm` steht er wieder klassisch in der Mitte.
 */

const WIDTHS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
} as const

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof WIDTHS
  className?: string
  /**
   * Formular enthält ungespeicherte Eingaben.
   *
   * Der Dialog dockt mobil bodenbündig an; ein Fehltipp daneben ist am
   * Tablet der Normalfall und würde sonst ein ausgefülltes Formular
   * kommentarlos verwerfen. Ist das gesetzt, schließt weder der Klick auf
   * den Hintergrund noch Escape ohne Rückfrage.
   */
  dirty?: boolean
  /** Text der Rückfrage beim Verwerfen. */
  dirtyPrompt?: string
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  dirty = false,
  dirtyPrompt = "Die Eingaben in diesem Dialog wurden noch nicht gespeichert. Verwerfen?",
}: ModalProps) {
  const [askingDiscard, setAskingDiscard] = useState(false)

  function requestClose(next: boolean) {
    if (next) {
      onOpenChange(true)
      return
    }
    if (dirty) {
      setAskingDiscard(true)
      return
    }
    onOpenChange(false)
  }

  function discard() {
    setAskingDiscard(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className={cn(
          "flex max-h-[90svh] flex-col gap-0 overflow-hidden border border-skope-line bg-[#0d0e10] p-0 ring-0",
          // Mobil unten andocken, ab sm zentriert.
          "top-auto bottom-0 left-1/2 max-w-full -translate-x-1/2 translate-y-0 rounded-b-none",
          "sm:top-1/2 sm:bottom-auto sm:-translate-y-1/2 sm:rounded-b-xl",
          WIDTHS[size],
          className
        )}
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-4 border-b border-skope-line px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="type-section text-foreground">
              {title}
            </DialogTitle>
            {description && (
              <DialogDescription className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogDescription>
            )}
          </div>
          <button
            type="button"
            onClick={() => requestClose(false)}
            aria-label="Schließen"
            className={cn(
              "-mt-1 -mr-1.5 grid size-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors",
              "hover:bg-surface-raised hover:text-foreground",
              FOCUS_RING
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {askingDiscard ? (
          <div className="flex flex-col gap-3 border-t border-state-warn/30 bg-state-warn/8 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground/90">{dirtyPrompt}</p>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                className="h-11 px-4"
                onClick={() => setAskingDiscard(false)}
              >
                Weiter bearbeiten
              </Button>
              <Button variant="destructive" className="h-11 px-4" onClick={discard}>
                Verwerfen
              </Button>
            </div>
          </div>
        ) : (
          footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-skope-line px-5 py-4 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  )
}
