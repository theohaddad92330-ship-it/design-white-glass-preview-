import { z } from 'zod'

/**
 * #2045.15 — « un contact ancien n'est pas un accès actif » : le réseau
 * personnel déclaré (`reseau-comptage.ts`, #2045.1/.2/.4/.7) porte sa date,
 * exactement comme l'effectif (#2035.8, `onboarding-effectif-freshness.ts`) —
 * doctrine « un fait périmé redevient INCONNU avec sa date, il ne disparaît
 * pas ».
 *
 * Même primitive, même colonne persistée (`esn_profiles.effectif_observed_at`,
 * une map GÉNÉRIQUE clé→date — AUCUNE migration ici, `stampReseauObservedAt`
 * réutilise la colonne exactement comme `stampEffectifObservedAt`), SEUIL
 * DISTINCT : un réseau personnel (anciens clients, anciens collègues,
 * partenaires, recommandeurs) bouge au rythme d'une réorganisation de
 * direction, pas de l'intercontrat — la cadence d'`org-freshness.ts` (180
 * jours), pas celle de l'effectif (90 jours, rythme trimestriel). Le seuil
 * vit ICI et nulle part ailleurs (GA-26).
 *
 * ⚠️ `warm_relations_count_band` (#2045.6) N'EST PAS COUVERT : mesuré en
 * écrivant ce fichier (24/09/2026) — cette clé n'a NI colonne sur
 * `EsnProfileEntity`, NI mapping dans `esn-answers.mapper.ts` (contrairement
 * aux quatre autres portes du même sous-écran). Une réponse à cette question
 * précise est donc perdue au premier rechargement, AVANT même la question de
 * sa fraîcheur — un défaut voisin, distinct de #2045.15, non corrigé ici
 * (hors lot, nécessite sa propre migration).
 */
export const RESEAU_FRESHNESS_STALE_AFTER_DAYS = 180

/**
 * Les quatre portes de réseau personnel PERSISTÉES (#2045.1/.2/.4/.7) —
 * `warm_relations_count_band` (#2045.6) exclu, voir note ci-dessus.
 */
export const RESEAU_FRESHNESS_ANSWER_KEYS = [
  'former_clients_count_band',
  'former_colleagues_count_band',
  'partners_count_band',
  'referrers_count_band',
] as const
export type ReseauFreshnessAnswerKey = (typeof RESEAU_FRESHNESS_ANSWER_KEYS)[number]

/** Trois états, comme `effectifFreshnessStateSchema` : `never_observed` est
 *  un état À PART ENTIÈRE (GA-18/GA-19), pas un zéro déguisé. */
export const RESEAU_FRESHNESS_STATES = ['never_observed', 'fresh', 'stale'] as const
export const reseauFreshnessStateSchema = z.enum(RESEAU_FRESHNESS_STATES)
export type ReseauFreshnessState = z.infer<typeof reseauFreshnessStateSchema>

export const reseauFreshnessSchema = z.object({
  state: reseauFreshnessStateSchema,
  observedAt: z.string().nullable(),
  ageDays: z.number().int().min(0).nullable(),
})
export type ReseauFreshness = z.infer<typeof reseauFreshnessSchema>

const NEVER_OBSERVED: ReseauFreshness = { state: 'never_observed', observedAt: null, ageDays: null }

/** La lecture, même forme que `readEffectifFreshness` — seul le seuil change. */
export function readReseauFreshness(observedAt: string | null | undefined, now: Date): ReseauFreshness {
  if (!observedAt) return NEVER_OBSERVED
  const observedMs = Date.parse(observedAt)
  if (Number.isNaN(observedMs)) return NEVER_OBSERVED

  const ageDays = Math.max(0, Math.floor((now.getTime() - observedMs) / 86_400_000))
  return {
    state: ageDays >= RESEAU_FRESHNESS_STALE_AFTER_DAYS ? 'stale' : 'fresh',
    observedAt,
    ageDays,
  }
}
