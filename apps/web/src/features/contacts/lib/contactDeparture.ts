import type { ApolloEmploymentEntry, Contact } from '@bellum/contracts'

/**
 * #4465 — LE POSTE EN COURS ET LE DÉPART D'UN CONTACT, lus du parcours déjà collecté
 * (`apollo_enrichment.employment_history[]`) À L'AFFICHAGE : rien n'est écrit, ni colonne ni rejeu, donc les comptes
 * déjà analysés en profitent tout de suite.
 *
 * - Le poste en cours est celui que la source marque `current` — jamais « le plus récent par défaut ».
 * - Un contact est PARTI quand son poste `current` est dans une AUTRE entreprise que le compte, ou quand tous ses
 *   postes chez le compte portent une date de fin. Sans nom de compte, sans parcours ou sans signal : `null` — on
 *   n'écrit ni « probablement parti », ni date, ni employeur devinés. Parti ne veut pas dire retiré : le contact reste
 *   consultable, il est seulement marqué.
 * - La preuve datée déjà projetée par le serveur (`employment_left`) gagne sur la déduction.
 */
type ContactDeparture = { organization: string | null; at: string | null }

const LEGAL_WORDS = /\b(sa|sas|sasu|sarl|eurl|snc|se|spa|gmbh|ltd|inc|plc|group|groupe|holding|societe|the)\b/g

function foldEmployer(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Même rapprochement que le serveur (`sameEmployer`) : l'un contient l'autre, à la forme juridique près. */
function sameEmployer(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = foldEmployer(left)
  const b = foldEmployer(right)
  return a !== '' && b !== '' && (a.includes(b) || b.includes(a))
}

function history(contact: Pick<Contact, 'apollo_enrichment'>): ApolloEmploymentEntry[] {
  return (contact.apollo_enrichment?.employment_history ?? []).filter(entry => entry != null)
}

/** Le poste marqué `current` (le premier), ou `null` : aucun poste en cours connu ⇒ rien à dire. */
export function contactCurrentPost(contact: Pick<Contact, 'apollo_enrichment'>): ApolloEmploymentEntry | null {
  return history(contact).find(entry => entry.current === true) ?? null
}

/**
 * #4889 — la frise du parcours : quels postes sont VRAIMENT en cours. Un seul par employeur, le premier
 * `current` (celui que `contactCurrentPost` retient) ; les autres postes `current` du même employeur sont
 * des postes passés mal marqués par la source. Rend, pour chaque indice de poste écarté, la date de début du
 * poste plus récent du même employeur qui le clôt (`null` : on ne devine aucune date de fin).
 */
export function supersededCurrentPosts(entries: readonly ApolloEmploymentEntry[]): Map<number, string | null> {
  const out = new Map<number, string | null>()
  const kept: number[] = []
  entries.forEach((entry, index) => {
    if (entry?.current !== true) return
    const holder = kept.find(k => sameEmployer(entries[k]?.organization_name, entry.organization_name))
    if (holder === undefined) {
      kept.push(index)
      return
    }
    const next = index > 0 ? entries[index - 1] : undefined
    out.set(
      index,
      next && sameEmployer(next.organization_name, entry.organization_name) ? readableDate(next.start_date) : null,
    )
  })
  return out
}

function readableDate(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed !== '' && !Number.isNaN(new Date(trimmed).getTime()) ? trimmed : null
}

export function contactDeparture(
  contact: Pick<Contact, 'apollo_enrichment' | 'employment_left'>,
  accountName: string | null | undefined,
): ContactDeparture | null {
  if (contact.employment_left) {
    return { organization: contact.employment_left.organization.trim() || null, at: contact.employment_left.at }
  }
  if (!accountName || foldEmployer(accountName) === '') return null
  const entries = history(contact)
  const here = entries.filter(entry => sameEmployer(entry.organization_name, accountName))
  const ongoingHere = here.some(
    entry => entry.current === true || (!readableDate(entry.end_date) && entry.current !== false),
  )
  if (ongoingHere) return null

  const elsewhere = entries.find(entry => entry.current === true && entry.organization_name?.trim())
  const ends = here
    .map(entry => readableDate(entry.end_date))
    .filter((end): end is string => end !== null)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
  const at = ends[0] ?? null
  if (elsewhere) return { organization: elsewhere.organization_name!.trim(), at }
  return at ? { organization: null, at } : null
}
