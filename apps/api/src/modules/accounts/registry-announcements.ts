import {
  REGISTRY_ANNOUNCEMENT_KINDS,
  type AccountRegistryAnnouncements,
  type RegistryAnnouncement,
} from '@bellum/contracts'

/** Une ligne de `public_registry_announcements` telle que la lecture la rend. */
type AnnouncementRow = {
  siren: string
  source: string
  kind: string
  family_label: string | null
  published_on: string | Date
  url: string | null
  tribunal: string | null
  /** #3915.decp — la partie d'en face d'un marché attribué ; absente des lectures d'avant ce lot. */
  label?: string | null
}

const KINDS = new Set<string>(REGISTRY_ANNOUNCEMENT_KINDS)

function isoDay(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/**
 * #3916.b — une ligne de registre devient une annonce d'écran. Une ligne d'une
 * source ou d'un genre inconnus ne fait AUCUNE ligne (on n'affiche pas ce qu'on
 * n'a pas) ; un genre hors liste n'est jamais deviné, il tombe en `other`.
 */
export function toRegistryAnnouncement(row: AnnouncementRow): RegistryAnnouncement | null {
  const date = isoDay(row.published_on)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  // #3915.decp — un marché public attribué lu en continu : seuls ses deux genres sont rendus.
  if (row.source === 'decp') {
    if (row.kind !== 'award' && row.kind !== 'award_won') return null
    return {
      source: 'decp',
      kind: row.kind,
      type: row.family_label?.trim() || null,
      date,
      url: row.url?.trim() || null,
      tribunal: null,
      counterpart: row.label?.trim() || null,
    }
  }
  // #3921.11 — `rne` (registre national) : dirigeant, ouverture/fermeture d'établissement, rendus comme le reste.
  if (row.source !== 'bodacc' && row.source !== 'sirene' && row.source !== 'rne') return null
  return {
    source: row.source,
    kind: (KINDS.has(row.kind) ? row.kind : 'other') as RegistryAnnouncement['kind'],
    type: row.family_label?.trim() || null,
    date,
    url: row.url?.trim() || null,
    tribunal: row.tribunal?.trim() || null,
  }
}

/** #3916.b — la réponse de `GET /accounts/:id/registry-announcements`. */
export function toAccountRegistryAnnouncements(
  rows: readonly AnnouncementRow[],
  state: { checked_at: string | Date | null; truncated: boolean | null } | null,
): AccountRegistryAnnouncements {
  return {
    announcements: rows.map(toRegistryAnnouncement).filter((a): a is RegistryAnnouncement => a !== null),
    checkedAt: state?.checked_at ? new Date(state.checked_at).toISOString() : null,
    truncated: state?.truncated === true,
  }
}

/** Au-delà, la fiche n'a plus rien à gagner — et la requête reste bornée. */
export const REGISTRY_ANNOUNCEMENTS_MAX = 500

export const REGISTRY_ANNOUNCEMENTS_SQL = `
  SELECT siren, source, kind, family_label, label, published_on, url, tribunal
    FROM public_registry_announcements
   WHERE siren = ANY($1::text[])
   ORDER BY published_on DESC
   LIMIT $2`
