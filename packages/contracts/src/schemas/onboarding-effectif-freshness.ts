import { z } from 'zod'

/**
 * #2035.8 — la fraîcheur d'une réponse d'EFFECTIF (bandes de consultants).
 *
 * Doctrine « un fait périmé redevient INCONNU avec sa date, il ne disparaît
 * pas » : un effectif répondu il y a six mois n'est pas un effectif
 * d'aujourd'hui, et l'afficher sans distinction en ferait une fausse
 * précision pour le moteur d'analyse — le même défaut que #2027 corrigeait
 * pour l'incertitude, appliqué ici à l'effectif.
 *
 * Construit sur la primitive `Provenance` (`provenance.ts` : la source ET la
 * date) plutôt que d'en refaire une — `observedAt` reprend le nom exact du
 * champ de `fieldProvenanceSchema` et d'`answerProvenanceSchema`
 * (`onboarding-answer-contract.ts`, #2006.6) : une date de réponse PAR CLÉ,
 * jamais un état global du profil.
 *
 * ⚠️ Un seuil DISTINCT de celui d'`org-freshness.ts` (180 jours — le rythme
 * de réorganisation d'une direction) : un effectif de consultants bouge à
 * l'échelle du TRIMESTRE (recrutements, fins de mission, intercontrat), pas
 * du semestre. Le seuil vit ICI et nulle part ailleurs (GA-26) ; un service
 * qui le recopierait créerait un second propriétaire du réglage.
 */
export const EFFECTIF_FRESHNESS_STALE_AFTER_DAYS = 90

/**
 * Les clés d'`EsnAnswers` que cette fraîcheur couvre — les bandes d'effectif
 * déclarées (#2035.1/.2/.3/.5), jamais un total dérivé ni une valeur calculée.
 */
export const EFFECTIF_FRESHNESS_ANSWER_KEYS = [
  'consultant_size',
  'consultant_size_group_band',
  'consultant_size_business_unit_band',
  'consultants_managed_by_user_band',
  'available_consultants_band',
] as const
export type EffectifFreshnessAnswerKey = (typeof EFFECTIF_FRESHNESS_ANSWER_KEYS)[number]

/**
 * Trois états, comme `org-freshness.ts` : `never_observed` est un état à
 * PART ENTIÈRE, pas l'absence des deux autres — c'est ce qui l'empêche de se
 * rendre à l'écran sous la forme d'un tiret muet ou d'un zéro (GA-18/GA-19).
 */
export const EFFECTIF_FRESHNESS_STATES = ['never_observed', 'fresh', 'stale'] as const
export const effectifFreshnessStateSchema = z.enum(EFFECTIF_FRESHNESS_STATES)
export type EffectifFreshnessState = z.infer<typeof effectifFreshnessStateSchema>

/**
 * `observedAt` et `ageDays` sont `null` ENSEMBLE, et uniquement sur
 * `never_observed` : un âge sans date serait un chiffre sans provenance, une
 * date sans âge obligerait chaque écran à refaire la soustraction.
 */
export const effectifFreshnessSchema = z.object({
  state: effectifFreshnessStateSchema,
  /** La date TELLE QU'ELLE A ÉTÉ ÉCRITE — jamais reformatée, jamais devinée. */
  observedAt: z.string().nullable(),
  /** Jours entiers écoulés. `null` = rien à compter, jamais `0`. */
  ageDays: z.number().int().min(0).nullable(),
})
export type EffectifFreshness = z.infer<typeof effectifFreshnessSchema>

const NEVER_OBSERVED: EffectifFreshness = { state: 'never_observed', observedAt: null, ageDays: null }

/**
 * L'état de fraîcheur d'UNE date d'observation. La seule lecture — tout appelant
 * (API, écran) passe par elle plutôt que de recalculer sa propre soustraction.
 *
 * Une date illisible rend `never_observed`, pas une erreur : on ne sait pas
 * quand la réponse a été donnée, et c'est exactement ce que `never_observed`
 * dit. Une date FUTURE (horloge décalée, migration de données) rend un âge de
 * 0 jour — jamais un nombre négatif, qui ferait mentir un tri par ancienneté.
 */
export function readEffectifFreshness(observedAt: string | null | undefined, now: Date): EffectifFreshness {
  if (!observedAt) return NEVER_OBSERVED
  const observedMs = Date.parse(observedAt)
  if (Number.isNaN(observedMs)) return NEVER_OBSERVED

  const ageDays = Math.max(0, Math.floor((now.getTime() - observedMs) / 86_400_000))
  return {
    state: ageDays >= EFFECTIF_FRESHNESS_STALE_AFTER_DAYS ? 'stale' : 'fresh',
    observedAt,
    ageDays,
  }
}

/**
 * La map persistée `esn_profiles.effectif_observed_at` (JSONB, migration
 * `EffectifObservedAt`) — clé d'`EsnAnswers` → ISO de la dernière fois que
 * CETTE clé a été écrite par un humain. Additive, jamais rétro-remplie : une
 * ligne antérieure à ce lot n'a d'entrée pour AUCUNE clé, ce qui se lit
 * `never_observed`, jamais une fausse fraîcheur.
 */
export const effectifObservedAtMapSchema = z.record(z.string(), z.string())
export type EffectifObservedAtMap = z.infer<typeof effectifObservedAtMapSchema>
