"use client"

/* eslint-disable @next/next/no-img-element -- Bilder liegen als Data-URL bzw.
   später als Storage-URL vor; next/image bringt hier keinen Vorteil. */

import { useRef, useState } from "react"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, ImagePlus, Star, Trash2, Upload } from "lucide-react"

import { ConfirmDialog } from "@/components/skope/confirm-dialog"
import { FOCUS_RING, TOUCH_EXTEND } from "@/components/skope/focus"
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/skope/primitives"
import { Button } from "@/components/ui/button"
import { repositories } from "@/lib/data/demo-repository"
import { runAction } from "@/lib/data/run-action"
import { optimizeImageFile } from "@/lib/images/optimize"
import type { Scooter, ScooterImage } from "@/lib/domain/types"
import { cn } from "@/lib/utils"

/**
 * Bildergalerie mit Upload, Reihenfolge, Titelbild und Löschen.
 *
 * Bilder werden vor dem Speichern clientseitig verkleinert. Im Prototyp landen
 * sie als Data-URL im Browser-Speicher; die Optimierung ist trotzdem schon
 * richtig, weil sie später genauso vor dem Upload nach Supabase Storage
 * stattfindet.
 */
/** Nur echte Kameraformate. `image/*` ließe auch SVG durch. */
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]
const MAX_BYTES = 20_000_000
const MAX_IMAGES = 12

export function TabImages({ scooter }: { scooter: Scooter }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  /** ID des Bildes, dessen Aktion gerade läuft — sperrt Doppelklicks. */
  const [busyImageId, setBusyImageId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ScooterImage | null>(null)

  const images = [...scooter.images].sort((a, b) => a.sortOrder - b.sortOrder)
  const locked = scooter.saleStatus === "VERKAUFT"

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return

    const chosen = Array.from(files)
    const accepted = chosen.filter((file) => ACCEPTED_TYPES.includes(file.type))
    const wrongType = chosen.length - accepted.length

    if (accepted.length === 0) {
      toast.error("Keine verwendbaren Bilddateien", {
        description: "Erlaubt sind JPEG, PNG, WebP und HEIC.",
      })
      return
    }
    if (wrongType > 0) {
      toast.warning(`${wrongType} Datei(en) übersprungen`, {
        description: "Erlaubt sind JPEG, PNG, WebP und HEIC.",
      })
    }

    const tooLarge = accepted.filter((file) => file.size > MAX_BYTES)
    const usable = accepted.filter((file) => file.size <= MAX_BYTES)
    if (tooLarge.length > 0) {
      toast.warning(`${tooLarge.length} Datei(en) zu groß`, {
        description: `Pro Bild sind höchstens ${MAX_BYTES / 1_000_000} MB möglich.`,
      })
    }
    if (usable.length === 0) return

    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) {
      toast.error("Höchstzahl erreicht", {
        description: `Pro Scooter sind ${MAX_IMAGES} Bilder möglich.`,
      })
      return
    }
    const batch = usable.slice(0, remaining)
    if (usable.length > remaining) {
      toast.warning(`Nur ${remaining} Bild(er) übernommen`, {
        description: `Pro Scooter sind insgesamt ${MAX_IMAGES} Bilder möglich.`,
      })
    }

    setUploading(true)
    try {
      // Bewusst nacheinander statt parallel: Zwanzig 12-Megapixel-Fotos
      // gleichzeitig zu dekodieren legt ein Tablet lahm.
      const prepared: { url: string; name: string }[] = []
      for (const file of batch) {
        prepared.push({ url: await optimizeImageFile(file), name: file.name })
      }
      await runAction(repositories.scooters.addImages(scooter.id, prepared), {
        success: `${prepared.length} Bild${prepared.length === 1 ? "" : "er"} hinzugefügt`,
        failure: "Upload fehlgeschlagen",
      })
    } catch (error) {
      // Der Fehler wird sichtbar gemacht statt still verschluckt.
      toast.error("Bild konnte nicht verarbeitet werden", {
        description:
          error instanceof Error ? error.message : "Unbekannter Fehler.",
      })
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function move(imageId: string, direction: -1 | 1) {
    const order = images.map((image) => image.id)
    const index = order.indexOf(imageId)
    const target = index + direction
    if (target < 0 || target >= order.length) return

    ;[order[index], order[target]] = [order[target], order[index]]
    setBusyImageId(imageId)
    try {
      await runAction(repositories.scooters.reorderImages(scooter.id, order), {
        failure: "Reihenfolge konnte nicht geändert werden",
      })
    } finally {
      setBusyImageId(null)
    }
  }

  async function setPrimary(image: ScooterImage) {
    setBusyImageId(image.id)
    try {
      await runAction(
        repositories.scooters.setPrimaryImage(scooter.id, image.id),
        { success: "Titelbild gesetzt", failure: "Titelbild nicht gesetzt" }
      )
    } finally {
      setBusyImageId(null)
    }
  }

  async function remove(image: ScooterImage) {
    await runAction(repositories.scooters.removeImage(scooter.id, image.id), {
      success: "Bild entfernt",
      failure: "Bild konnte nicht entfernt werden",
    })
  }

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Bilder"
          description={
            images.length > 0
              ? `${images.length} Bild${images.length === 1 ? "" : "er"} · das erste ist das Titelbild.`
              : "Mindestens ein Bild wird für die Veröffentlichung benötigt."
          }
          action={
            !locked && (
              <Button
                className="h-9 gap-2 px-3.5"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="size-4" />
                {uploading ? "Lädt …" : "Hochladen"}
              </Button>
            )
          }
        />
        <PanelBody>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="sr-only"
            onChange={(event) => handleFiles(event.target.files)}
          />

          {!locked && (
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                handleFiles(event.dataTransfer.files)
              }}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  inputRef.current?.click()
                }
              }}
              className={cn(
                "mb-5 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors duration-200",
                dragOver
                  ? "border-skope-gold/60 bg-skope-gold/8"
                  : "border-skope-line-strong hover:border-skope-gold/35 hover:bg-surface-sunken",
                "focus-visible:border-skope-gold/60 focus-visible:ring-3 focus-visible:ring-skope-gold/15 focus-visible:outline-none"
              )}
            >
              <ImagePlus
                className={cn(
                  "size-6 transition-colors",
                  dragOver ? "text-skope-gold" : "text-muted-foreground"
                )}
              />
              <p className="mt-3 text-sm font-medium text-foreground">
                Bilder hierher ziehen oder auswählen
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG oder WebP · werden automatisch auf max. 1600 px verkleinert
              </p>
            </div>
          )}

          {images.length === 0 ? (
            <EmptyState
              icon={<ImagePlus className="size-5" />}
              title="Noch keine Bilder"
              description="Ohne Bild kann der Scooter nicht auf Shopify veröffentlicht werden."
            />
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {images.map((image, index) => (
                <li
                  key={image.id}
                  className={cn(
                    "group relative overflow-hidden rounded-xl border bg-black/30 transition-colors",
                    image.isPrimary
                      ? "border-skope-gold/45"
                      : "border-skope-line hover:border-skope-line-strong"
                  )}
                >
                  <div className="aspect-4/3 w-full overflow-hidden">
                    <img
                      src={image.url}
                      alt={image.name}
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  </div>

                  {image.isPrimary && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md border border-skope-gold/35 bg-[#0b0c0e]/90 px-1.5 py-0.5 text-[10px] font-medium text-skope-gold">
                      <Star className="size-2.5 fill-current" />
                      Titelbild
                    </span>
                  )}

                  {!locked && (
                    <div className="flex items-center justify-between gap-1 border-t border-skope-line bg-[#0b0c0e] px-1.5 py-1.5">
                      <div className="flex items-center gap-0.5">
                        <IconButton
                          label="Nach vorne"
                          disabled={index === 0 || busyImageId !== null}
                          onClick={() => move(image.id, -1)}
                        >
                          <ArrowLeft className="size-3.5" />
                        </IconButton>
                        <IconButton
                          label="Nach hinten"
                          disabled={index === images.length - 1 || busyImageId !== null}
                          onClick={() => move(image.id, 1)}
                        >
                          <ArrowRight className="size-3.5" />
                        </IconButton>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {!image.isPrimary && (
                          <IconButton
                            label="Als Titelbild setzen"
                            disabled={busyImageId !== null}
                            onClick={() => setPrimary(image)}
                          >
                            <Star className="size-3.5" />
                          </IconButton>
                        )}
                        <IconButton
                          label="Bild löschen"
                          destructive
                          disabled={busyImageId !== null}
                          onClick={() => setPendingDelete(image)}
                        >
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Bild löschen?"
        description={
          <>
            Das Bild wird dauerhaft aus dem Datensatz entfernt. Bleibt danach
            kein Bild übrig, verliert der Scooter seine Freigabe für die
            Veröffentlichung.
          </>
        }
        onConfirm={async () => {
          if (pendingDelete) await remove(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  destructive,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors",
        // Sichtbar klein, antippbar groß: das Pseudo-Element dehnt die
        // Trefferfläche auf 44 px, ohne das Raster zu verschieben.
        TOUCH_EXTEND,
        FOCUS_RING,
        destructive
          ? "hover:bg-state-error/12 hover:text-state-error"
          : "hover:bg-surface-track hover:text-foreground",
        disabled && "cursor-not-allowed opacity-30 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  )
}
