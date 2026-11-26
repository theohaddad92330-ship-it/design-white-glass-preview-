/**
 * E1 (07/10/2026, #3698 — décision Louis) — L'ÉTAT D'UNE COORDONNÉE APRÈS UNE
 * TENTATIVE D'ENRICHISSEMENT.
 *
 * « Chaque contact enrichi doit sortir avec téléphone + e-mail + LinkedIn » : et
 * quand ce n'est pas possible, la fiche doit DIRE pourquoi — « recherché,
 * introuvable chez N sources » — au lieu d'un champ vide qui se lit « jamais
 * cherché ». Persisté par coordonnée dans `contacts.enrichment_coordinates`
 * (migration `1796436688517`) ; l'écran /contacts (#3822, lot C5) le lit.
 *
 * Quatre états, et pas un de plus :
 * - `found` — la coordonnée est sur la fiche ;
 * - `not_found` — au moins une source a RÉPONDU « rien », aucune n'est encore
 *   attendue : « introuvable chez `sources_queried` sources » ;
 * - `pending` — une source livre plus tard (mobile Apollo par webhook) ;
 * - `unknown` — on ne peut pas conclure : un timeout, une panne de toutes les
 *   sources. **Un timeout n'est pas un échec** (doctrine) — jamais `not_found`.
 *
 * `sources_queried` est un NOMBRE : les sources ne se nomment jamais côté
 * client (doctrine « nos fournisseurs ne se nomment jamais »). Leur détail
 * vit dans la trace interne de l'API (`contacts.enrichment_trace`, jamais
 * sélectionnée par défaut).
 */
import { z } from 'zod'
import type { EnrichmentChannel } from './contact-enrichment.js'

export const ENRICHMENT_COORDINATE_STATES = ['found', 'not_found', 'pending', 'unknown'] as const
export type EnrichmentCoordinateStateValue = (typeof ENRICHMENT_COORDINATE_STATES)[number]

const enrichmentCoordinateStateSchema = z.object({
  state: z.enum(ENRICHMENT_COORDINATE_STATES),
  sources_queried: z.number().int().nonnegative(),
  at: z.string(),
})

/**
 * Intégration J1 (#3822) — la forme SERVIE au client de
 * `contacts.enrichment_coordinates` : la liste /contacts et la fiche la lisent
 * (« erreur » = `unknown`, « introuvable chez N sources » = `not_found`).
 * Aucune source nommée — un nombre seulement.
 */
export const enrichmentCoordinateStatesSchema = z.object({
  email: enrichmentCoordinateStateSchema.optional(),
  phone: enrichmentCoordinateStateSchema.optional(),
  linkedin: enrichmentCoordinateStateSchema.optional(),
})

export type EnrichmentCoordinateState = {
  state: EnrichmentCoordinateStateValue
  /** Sources qui ont RÉPONDU sur cette coordonnée (une panne n'en est pas une). */
  sources_queried: number
  /** ISO — date de la tentative. */
  at: string
}

export type EnrichmentCoordinateStates = Partial<Record<EnrichmentChannel, EnrichmentCoordinateState>>

/** Ce qu'UNE source a répondu sur UNE coordonnée. Interne à l'API. */
export type EnrichmentSourceOutcome = 'found' | 'not_found' | 'error' | 'unknown' | 'pending'

export type EnrichmentSourceAttempt = {
  source: string
  coordinate: EnrichmentChannel
  outcome: EnrichmentSourceOutcome
}

/**
 * Trace INTERNE (`contacts.enrichment_trace`, jamais sélectionnée par défaut).
 * - `attempts` : les réponses de la dernière tentative, par source et par
 *   coordonnée — la mesure de couverture (point 7 du lot E1) se lit ici.
 * - `phone_reveal` : la révélation du mobile attendue par webhook. `nonce` est
 *   signé dans l'URL de retour ; le webhook n'est accepté qu'une fois, pour CE
 *   nonce. `debited` : la tentative synchrone a déjà débité — le webhook ne
 *   redébite pas (pas de double débit). `free` : rattrapage à notre charge.
 * - `async_lookup` : une recherche asynchrone restée sans réponse dans la sonde
 *   bornée — reprise par son identifiant au passage suivant, jamais relancée
 *   (le fournisseur facturerait deux fois).
 */
export type ContactEnrichmentTrace = {
  attempts?: Array<EnrichmentSourceAttempt & { at: string }>
  phone_reveal?: { nonce: string; requested_at: string; debited: boolean; free: boolean } | null
  async_lookup?: { id: string; requested_at: string } | null
  /**
   * #4106 — le journal INTERNE de la cascade du dernier passage : qui a servi (`served_by`),
   * la liste ORDONNÉE des essais (`tried` : fournisseur, hit/miss/error/skipped_budget, coût),
   * le plafond par contact, la dépense, et l'arrêt éventuel. Jamais affiché ; sources jamais
   * nommées côté écran.
   */
  cascade?: {
    served_by: string | null
    tried: Array<{
      provider: string
      outcome: 'hit' | 'miss' | 'error' | 'skipped_budget'
      cost: number
      status?: number
      pattern_confirmed?: true
    }>
    ceiling: number | null
    spent: number
    stopped: 'budget' | 'client_error' | null
  }
}

type CoordinateValues = {
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
}

const CHANNELS: readonly EnrichmentChannel[] = ['email', 'phone', 'linkedin']

function valueOf(values: CoordinateValues, channel: EnrichmentChannel): string {
  const raw = channel === 'linkedin' ? values.linkedin_url : values[channel]
  return (raw ?? '').trim()
}

/**
 * Plie les réponses des sources en un état par coordonnée. Une coordonnée sur
 * laquelle aucune source n'a été interrogée et qui reste vide n'a PAS d'état —
 * « jamais cherché » ne s'invente pas.
 */
export function foldEnrichmentCoordinateStates(
  attempts: readonly EnrichmentSourceAttempt[],
  after: CoordinateValues,
  at: string,
): EnrichmentCoordinateStates {
  const states: EnrichmentCoordinateStates = {}
  for (const channel of CHANNELS) {
    const mine = attempts.filter(attempt => attempt.coordinate === channel)
    const answered = new Set(
      mine.filter(attempt => attempt.outcome === 'found' || attempt.outcome === 'not_found').map(a => a.source),
    ).size
    if (valueOf(after, channel)) {
      states[channel] = { state: 'found', sources_queried: answered, at }
      continue
    }
    if (mine.length === 0) continue
    if (mine.some(attempt => attempt.outcome === 'pending')) {
      states[channel] = { state: 'pending', sources_queried: answered, at }
    } else if (mine.some(attempt => attempt.outcome === 'unknown') || answered === 0) {
      states[channel] = { state: 'unknown', sources_queried: answered, at }
    } else {
      states[channel] = { state: 'not_found', sources_queried: answered, at }
    }
  }
  return states
}

/**
 * E1 — LA règle de débit (décision Louis 07/10, point 4) : on ne débite QUE si
 * au moins une coordonnée MANQUANTE est trouvée. Rafraîchir une valeur déjà
 * présente ne se facture plus ; LinkedIn reste un champ gratuit du même appel
 * (le bug de facturation « Apollo Basic » de `BILLABLE_ENRICHMENT_FIELDS`).
 */
export function newlyFoundCoordinates(
  before: { email?: string | null; phone?: string | null; linkedin_url?: string | null },
  incoming: { email?: string | null; phone?: string | null; linkedin_url?: string | null },
): Array<'email' | 'phone'> {
  return (['email', 'phone'] as const).filter(
    field => !(before[field] ?? '').trim() && Boolean((incoming[field] ?? '').trim()),
  )
}

/**
 * Au-delà de ce délai, une livraison attendue par webhook (mobile Apollo, « en
 * plusieurs minutes ») ne viendra plus : la fiche ne reste pas « en recherche »
 * pour toujours. Bien en deçà du TTL du jeton (24 h).
 */
export const PENDING_COORDINATE_MAX_AGE_MS = 15 * 60_000

/**
 * Une recherche qui n'aboutit pas a une FIN. Un état `pending` plus vieux que
 * `maxAgeMs` est tranché À LA LECTURE (la valeur stockée ne bouge pas) :
 * - au moins une source a RÉPONDU « rien » ⇒ `not_found` (« introuvable ») ;
 * - aucune n'a répondu ⇒ `unknown` — un timeout n'est pas un échec (doctrine),
 *   jamais « introuvable » inventé, et `unknown` arrête la reprise.
 * Un état `pending` récent, ou à date illisible, est laissé tel quel.
 */
export function settleStalePendingCoordinates(
  states: EnrichmentCoordinateStates | null | undefined,
  nowMs: number,
  maxAgeMs: number = PENDING_COORDINATE_MAX_AGE_MS,
): EnrichmentCoordinateStates | null {
  if (!states) return null
  let changed = false
  const settled: EnrichmentCoordinateStates = { ...states }
  for (const channel of CHANNELS) {
    const entry = states[channel]
    if (entry?.state !== 'pending') continue
    const at = Date.parse(entry.at)
    if (!Number.isFinite(at) || nowMs - at < maxAgeMs) continue
    settled[channel] = { ...entry, state: entry.sources_queried > 0 ? 'not_found' : 'unknown' }
    changed = true
  }
  return changed ? settled : states
}
