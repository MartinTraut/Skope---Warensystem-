"use client"

/**
 * Clientseitige Bildoptimierung vor dem Speichern.
 *
 * Im Prototyp verhindert das, dass ein paar Handyfotos den Browser-Speicher
 * sprengen. In der Produktion bleibt derselbe Schritt sinnvoll: kleinere
 * Dateien laden schneller nach Supabase Storage hoch und sind für Shopify
 * ohnehin ausreichend.
 */

const MAX_EDGE = 1600
const QUALITY = 0.82

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

  // JPEG statt PNG: Produktfotos brauchen keine Transparenz und werden
  // dadurch um ein Vielfaches kleiner.
  return canvas.toDataURL("image/jpeg", QUALITY)
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
