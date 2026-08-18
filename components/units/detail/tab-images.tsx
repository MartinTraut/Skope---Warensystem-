"use client"

import { ImageGallery } from "@/components/shared/image-gallery"
import { repositories } from "@/lib/data/demo-repository"
import type { ArticleUnit } from "@/lib/domain/types"

/** Bilder eines Geräts. Die Galerie selbst ist geteilt (siehe ImageGallery). */
export function TabImages({ unit }: { unit: ArticleUnit }) {
  return (
    <ImageGallery
      images={unit.images}
      locked={unit.saleStatus === "VERKAUFT"}
      subject="Gerät"
      api={{
        add: (images) => repositories.units.addImages(unit.id, images),
        remove: (imageId) => repositories.units.removeImage(unit.id, imageId),
        setPrimary: (imageId) =>
          repositories.units.setPrimaryImage(unit.id, imageId),
        reorder: (imageIds) => repositories.units.reorderImages(unit.id, imageIds),
      }}
    />
  )
}
