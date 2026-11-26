import type { DiscoverSourceAxis } from '@bellum/contracts'

/**
 * #4067 — l'âge d'une source, DIT : un signal ancien se lit « il y a 8 mois »,
 * jamais comme récent. Jours sous un mois, mois sous deux ans, années au-delà.
 * Rien de daté (ou illisible) ⇒ `null` : aucune mention, jamais une date devinée.
 */
export function sourceAgeLabel(
  latestAt: string | null,
  now: Date = new Date(),
): { key: 'sourceAxes.ago.days' | 'sourceAxes.ago.months' | 'sourceAxes.ago.years'; count: number } | null {
  if (!latestAt) return null
  const parsed = Date.parse(latestAt)
  if (Number.isNaN(parsed)) return null
  const days = Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
  if (days < 30) return { key: 'sourceAxes.ago.days', count: days }
  if (days < 730) return { key: 'sourceAxes.ago.months', count: Math.round(days / 30) }
  return { key: 'sourceAxes.ago.years', count: Math.floor(days / 365) }
}

/** Le nombre que la preuve d'un axe NOMME (pluriel i18n) : contacts connus,
 *  consultants du vivier, sinon `n` (signaux, documents, missions). */
export function sourceEvidenceCount(axis: DiscoverSourceAxis): number {
  const params = axis.label_params ?? {}
  const pick =
    axis.label_key === 'crm_contacts'
      ? params.contacts
      : axis.label_key === 'missions_bench'
        ? params.consultants
        : params.n
  return typeof pick === 'number' ? pick : 0
}

/**
 * #4067 (R17 15/10) — une mission dont la date de fin est dans le FUTUR n'est pas « passée » :
 * la carte l'écrit « en cours » (Dassault, 30/11/2026 lu « 1 mission passée »).
 * Seul l'axe missions est concerné ; toute autre preuve garde sa clé.
 */
export function sourceEvidenceKey(axis: DiscoverSourceAxis, now: Date = new Date()): string {
  if (axis.label_key !== 'missions') return axis.label_key
  const parsed = axis.latestAt ? Date.parse(axis.latestAt) : Number.NaN
  return !Number.isNaN(parsed) && parsed > now.getTime() ? 'missions_ongoing' : axis.label_key
}
