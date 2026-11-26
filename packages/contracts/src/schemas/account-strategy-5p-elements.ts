import { z } from 'zod'

/**
 * Extrait de `account-strategy-5p.ts` (BEL-SC-225, #3254) pour BEL-SC-229
 * (#3258) — la matrice intérêt × pénétrabilité a besoin exactement du même
 * vocabulaire de statut par élément (GA-26 : un réglage vit à un seul
 * endroit). Dupliquer les sept statuts dans un second fichier aurait recréé
 * la « deuxième qualification concurrente » que l'instruction commune (#3249,
 * règle 4) interdit ; les extraire ici, puis les faire relire par les deux
 * projections, garde une seule définition.
 *
 * `account-strategy-5p.ts` réexporte tout ce module pour que rien ne change
 * côté consommateurs déjà branchés sur `@bellum/contracts`.
 */

/* ───────────────────────── Statut par élément ───────────────────────── */

export const ACCOUNT_STRATEGY_5P_ELEMENT_STATUSES = [
  'verified',
  'observed',
  'inferred',
  'user_supplied',
  'stale',
  'missing',
  'not_applicable',
] as const
export const accountStrategy5PElementStatusSchema = z.enum(ACCOUNT_STRATEGY_5P_ELEMENT_STATUSES)
export type AccountStrategy5PElementStatus = (typeof ACCOUNT_STRATEGY_5P_ELEMENT_STATUSES)[number]

/**
 * Les statuts qui comptent comme « on sait » — jamais `inferred` seul (une
 * déduction n'est pas un fait), jamais `stale` (un fait périmé redevient
 * inconnu, doctrine « archive, ne supprime pas » : une relation ancienne ne
 * prouve pas un accès actif).
 */
const KNOWN_STATUSES: ReadonlySet<AccountStrategy5PElementStatus> = new Set(['verified', 'observed', 'user_supplied'])

export function isElementKnown(status: AccountStrategy5PElementStatus): boolean {
  return KNOWN_STATUSES.has(status)
}

export function isElementGap(status: AccountStrategy5PElementStatus): boolean {
  return status === 'missing' || status === 'inferred'
}

/** Un élément de dossier : sa valeur, ou `null`, et le statut qui dit POURQUOI. */
export type AccountStrategy5PElement<T> = { value: T | null; status: AccountStrategy5PElementStatus }

export function elementSchema<T extends z.ZodTypeAny>(value: T) {
  return z.object({ value: value.nullable(), status: accountStrategy5PElementStatusSchema })
}

export function missingElement<T>(): AccountStrategy5PElement<T> {
  return { value: null, status: 'missing' }
}

export function knownElement<T>(
  value: T,
  status: Extract<AccountStrategy5PElementStatus, 'verified' | 'observed'>,
): AccountStrategy5PElement<T> {
  return { value, status }
}
