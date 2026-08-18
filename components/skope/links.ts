import type { AuditEvent } from "@/lib/domain/types"

/**
 * Wohin führt ein Protokolleintrag?
 *
 * Ein Ereignis kann ein Gerät, einen Artikel oder gar nichts betreffen. Die
 * Entscheidung steht hier einmal, damit Protokollliste und Dashboard-Feed
 * nicht auseinanderlaufen.
 */
export function auditEventHref(event: AuditEvent): string | null {
  if (event.unitId) return `/units/${event.unitId}`
  if (event.articleId) return `/inventory/${event.articleId}`
  return null
}

export function articleHref(articleId: string): string {
  return `/inventory/${articleId}`
}

export function unitHref(unitId: string): string {
  return `/units/${unitId}`
}
