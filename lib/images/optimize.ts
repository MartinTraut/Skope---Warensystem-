"use client"

/**
 * Clientseitige Bildoptimierung vor dem Speichern.
 *
 * Im Prototyp verhindert das, dass ein paar Handyfotos den Browser-Speicher
 * sprengen. In der Produktion bleibt derselbe Schritt sinnvoll: kleinere
 * Dateien laden schneller nach Supabase Storage hoch und sind für Shopify
 * ohnehin ausreichend.
 */

/*
 * 1400 px und WebP statt 1600 px und JPEG.
 *
 * Ein Produktfoto im Shop wird nie größer als etwa 1200 px dargestellt; die
 * zusätzliche Kantenlänge kostet nur Platz. WebP bei 0,72 liefert bei diesen
 * Motiven sichtbar dieselbe Qualität wie JPEG bei 0,82, bei etwa einem Drittel
 * der Dateigröße — aus rund 400 KB werden rund 130 KB. Das entscheidet im
 * Prototyp darüber, ob der Browserspeicher reicht, und spart später
 * Storage und Ladezeit.
 */
const MAX_EDGE = 1400
const QUALITY = 0.72

export async function optimizeImageFile(file: File): Promise<string> {
  const bitmap = await loadBitmap(file)

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Canvas nicht verfügbar — Bild konnte nicht verkleinert werden.")
  }

  context.drawImage(bitmap, 0, 0, width, height)
  if ("close" in bitmap) bitmap.close()

  // WebP, wo der Browser es kann — sonst JPEG. Beides ohne Transparenz,
  // die Produktfotos nicht brauchen. `toDataURL` liefert bei einem nicht
  // unterstützten Format stillschweigend PNG zurück, deshalb wird das
  // Ergebnis geprüft statt geglaubt.
  const webp = canvas.toDataURL("image/webp", QUALITY)
  if (webp.startsWith("data:image/webp")) return webp

  return canvas.toDataURL("image/jpeg", QUALITY)
}

/** Ungefähre Bytegröße einer Data-URL — Base64 trägt rund ein Drittel Overhead. */
export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",")
  if (comma === -1) return dataUrl.length
  return Math.round((dataUrl.length - comma - 1) * 0.75)
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file)
    } catch {
      // Fällt z. B. bei exotischen Formaten durch — dann der klassische Weg.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`„${file.name}" konnte nicht gelesen werden.`))
    }
    image.src = url
  })
}
