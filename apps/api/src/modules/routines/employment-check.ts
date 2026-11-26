import type { SearchPeopleByNameResult } from '@bellum/contracts'

/**
 * #4016.L2 — « ton champion a changé de boîte ».
 *
 * L'employeur COURANT d'un champion se relit auprès d'un annuaire professionnel
 * SOUS CONTRAT (le tier de recherche gratuit déjà branché, `searchPeopleByName`) :
 * jamais de scraping, jamais d'automatisation de session (c24, c79). Le résultat
 * est un FAIT OBSERVÉ « vu le <date> » (c67), jamais une vérité acquise ; le nom du
 * fournisseur ne s'affiche nulle part.
 */

/** Titre de la notification quand un champion a changé d'employeur. */
export const MOVED_CHAMPION_TITLE = 'Ton champion a changé de boîte'

/** Rôles de décision qui font un champion (même ensemble que `contact-ranking`). */
export const CHAMPION_DECISION_ROLES = ['champion', 'sponsor'] as const

/** Un contrôle par champion et par mois : un annuaire se relit, il ne se martèle pas. */
export const EMPLOYMENT_CHECK_EVERY_DAYS = 30

/**
 * #4286.13 (Louis 22/10/2026) — « on relit le contact quand on va dessus sur sa fiche au bout d'un mois ».
 *
 * À l'OUVERTURE de la fiche d'un contact (n'importe lequel), une relecture est enfilée si `employmentCheck.at` est
 * absent ou plus vieux que {@link EMPLOYMENT_CHECK_EVERY_DAYS} — la MÊME constante que la routine, jamais une seconde.
 */
export const EMPLOYMENT_RECHECK_QUEUE = 'employment-recheck'

export type EmploymentRecheckJobData = { workspaceId: string; contactId: string }

/** Un job par contact : deux ouvertures rapprochées partagent la même relecture. Aucun `:` (séparateur Redis de BullMQ). */
export function employmentRecheckJobId(contactId: string): string {
  return `employment-recheck-${contactId}`
}

/**
 * Le contact a-t-il une relecture à faire ? Il faut un identifiant d'annuaire (`raw_data.apolloId`) — sans lui,
 * rien à relire, jamais de recherche par nom devinée — et une relecture absente, illisible ou périmée.
 */
export function employmentCheckIsDue(rawData: Record<string, unknown> | null | undefined, now: Date): boolean {
  const apolloId = rawData?.['apolloId']
  if (typeof apolloId !== 'string' || apolloId.trim() === '') return false
  const check = rawData?.['employmentCheck']
  const at = typeof check === 'object' && check !== null ? (check as Record<string, unknown>)['at'] : null
  const seenMs = typeof at === 'string' ? new Date(at).getTime() : Number.NaN
  if (Number.isNaN(seenMs)) return true
  return seenMs < now.getTime() - EMPLOYMENT_CHECK_EVERY_DAYS * 86_400_000
}

const MAX_PER_RUN = 50

/**
 * Combien de champions relire par passage. Absent, vide ou invalide ⇒ 0 : aucun
 * appel réseau, chemin byte-identique (« sans clé = no-op strict »).
 */
export function championEmploymentCheckLimit(raw: string | undefined): number {
  const n = Number.parseInt((raw ?? '').trim(), 10)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, MAX_PER_RUN)
}

export type ObservedEmployment = { organization: string; title: string }

/**
 * La fiche du contact PARMI les résultats : par identifiant, jamais par nom — deux
 * homonymes d'entreprises différentes ne se confondent pas. Pas de fiche, ou fiche
 * sans employeur ⇒ `null` (« non vérifié »), jamais une valeur devinée.
 */
export function employmentFromHits(
  hits: SearchPeopleByNameResult['hits'],
  apolloId: string,
): ObservedEmployment | null {
  const found = hits.find(h => h.id !== '' && h.id === apolloId)
  const organization = found?.organizationName.trim() ?? ''
  if (!found || organization === '') return null
  return { organization, title: found.title.trim() }
}

/**
 * #4055.8 (Louis 15/10/2026) — LES ÉTATS D'UNE RELECTURE D'EMPLOYEUR, datés.
 *
 * - `not_found`  : la relecture n'a pas retrouvé la personne chez l'annuaire (« non retrouvé ») ;
 * - `confirmed`  : l'employeur observé est celui du compte (à la forme juridique près) ;
 * - `left`       : un AUTRE employeur est observé, daté — la seule preuve qui autorise « a quitté l'entreprise » ;
 * - `seen`       : un employeur est vu mais le compte n'a pas de nom lisible pour le comparer : on ne conclut pas.
 *
 * « Pas encore vérifié » n'est pas un état écrit : c'est l'absence de relecture (`employmentCheck` absent).
 */
type EmploymentCheckState = 'not_found' | 'confirmed' | 'left' | 'seen'

const LEGAL_WORDS = /\b(sa|sas|sasu|sarl|eurl|snc|se|spa|gmbh|ltd|inc|plc|group|groupe|holding|societe|the)\b/g

function foldOrganization(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(LEGAL_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function employmentCheckState(
  seen: ObservedEmployment | null,
  accountName: string | null,
): EmploymentCheckState {
  if (!seen) return 'not_found'
  const account = foldOrganization(accountName ?? '')
  if (account === '') return 'seen'
  const observed = foldOrganization(seen.organization)
  if (observed === '') return 'seen'
  // « Orange Business » chez « Orange » est le même groupe : l'un contient l'autre. Prudent par construction —
  // dire « a quitté » à tort est pire que ne pas le dire.
  return observed.includes(account) || account.includes(observed) ? 'confirmed' : 'left'
}
