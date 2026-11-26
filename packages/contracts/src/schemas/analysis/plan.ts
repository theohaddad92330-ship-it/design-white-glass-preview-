import { z } from 'zod'
import { dossierReadSchema } from './dossier-read.js'
import { nullableInt, nullableNumber, nullableString } from './base.js'
import { channelSchema, effortSchema, goNoGoSchema, probabilitySchema, riskImpactSchema } from './primitives.js'

/**
 * Plan-phase payload: action plan, evaluation, offers, risks. Defined by
 * BELLUM-PLAN (apps/ia/app/prompts/bellum_plan.py). Only the fields that
 * TabPlan / TabEvaluation / account-pdf render are kept.
 *
 * Wire shape is **snake_case** — see ./account-analysis.ts header.
 */

/** The proof a scored factor — or a dated quick win / risk — is tied to (Théo:
 *  signal / source / contact / profil / règle métier). ONE taxonomy for the whole
 *  dossier: the score factors and the p28 quick-wins/risks proofs share it rather
 *  than each inventing their own vocabulary. */
export const PROOF_TYPES = ['signal', 'source', 'contact', 'profile', 'business_rule'] as const
export const proofTypeSchema = z.enum(PROOF_TYPES)
export type ProofType = z.infer<typeof proofTypeSchema>

/**
 * « Quick wins et risques doivent être recalculés après chaque enrichissement,
 * avec preuve et date » (Théo, restitution TF1 p28).
 *
 * Four fields the phase-4 post-processing stamps deterministically (no prompt
 * change — the prompts are golden-tested):
 * - `computed_at` — when THIS item was last recomputed. Phase 4 replays on every
 *   analysis and every replan, so it is a real recompute date.
 * - `proof_type` / `proof` — what the item rests on, in the taxonomy above.
 * - `proof_date` — the date carried by the PROOF itself (a sourced signal), never
 *   the recompute date wearing a disguise.
 *
 * All optional: a dossier produced before this shipped carries none of them, and
 * an item nothing could be tied to carries no proof at all. The reader must then
 * show "no date" / "preuve à qualifier" — never a fabricated one.
 */
const datedProofShape = {
  computed_at: nullableString,
  // Tolerant on the enum (see base.ts header): an unknown future proof type is
  // kept as a plain string rather than dropping the whole item.
  proof_type: z.union([proofTypeSchema, z.string()]).optional().nullable(),
  proof: nullableString,
  proof_date: nullableString,
}

export const planActionSchema = z.object({
  action_id: nullableString,
  action: nullableString,
  contact: nullableString,
  channel: z.union([channelSchema, z.string()]).optional().nullable(),
  deadline: nullableString,
  expected_outcome: nullableString,
  kpi: nullableString,
})
export type PlanAction = z.infer<typeof planActionSchema>

export const planPhaseSchema = z.object({
  name: nullableString,
  title: nullableString,
  objective: nullableString,
  actions: z.array(planActionSchema).optional(),
})
export type PlanPhase = z.infer<typeof planPhaseSchema>

export const actionPlanBodySchema = z.object({
  strategy: nullableString,
  justification: nullableString,
  phases: z.array(planPhaseSchema).optional(),
})
export type ActionPlanBody = z.infer<typeof actionPlanBodySchema>

export const offerProposalSchema = z.object({
  title: nullableString,
  pitch: nullableString,
  target_contact: nullableString,
  pain_addressed: nullableString,
  estimated_tjm: nullableString,
  estimated_team_size: z.union([z.number().int(), z.string()]).optional().nullable(),
  estimated_duration: nullableString,
  differentiator: nullableString,
})
export type OfferProposal = z.infer<typeof offerProposalSchema>

export const competitorStrategySchema = z.object({
  competitor: nullableString,
  differentiator: nullableString,
  talking_point: nullableString,
})
export type CompetitorStrategy = z.infer<typeof competitorStrategySchema>

export const competitiveStrategySchema = z.object({
  positioning_statement: nullableString,
  vs_competitors: z.array(competitorStrategySchema).optional(),
})
export type CompetitiveStrategy = z.infer<typeof competitiveStrategySchema>

export const planRiskSchema = z.object({
  risk: nullableString,
  probability: z.union([probabilitySchema, z.string()]).optional().nullable(),
  impact: z.union([riskImpactSchema, z.string()]).optional().nullable(),
  mitigation: nullableString,
  ...datedProofShape,
})
export type PlanRisk = z.infer<typeof planRiskSchema>

/** Rang de sévérité, du plus grave au moins grave — 0 = hors énumération/absent,
 *  qui se classe toujours DERNIER (jamais premier par accident de tri). */
const IMPACT_RANK: Record<string, number> = { critique: 3, important: 2, modere: 1 }
const PROBABILITY_RANK: Record<string, number> = { haute: 3, moyenne: 2, basse: 1 }

/**
 * #2304.8 (épopée #2932, LAU-FINAL-045) — Q7 « quel est le principal risque
 * du compte », DÉRIVÉ des risques déjà écrits (`risks`), jamais un second
 * appel modèle (GA-26, même principe que `computeDossierScore`).
 *
 * Classement : l'IMPACT prime (un risque critique et peu probable reste plus
 * grave qu'un risque probable et mineur), la PROBABILITÉ départage à impact
 * égal. Un impact/une probabilité absent ou hors énumération vaut 0 — il ne
 * peut jamais l'emporter par accident de tri. À égalité stricte, le premier
 * risque de la liste gagne (ordre stable, jamais un tri qui varie sans
 * raison). Un risque sans texte lisible (`risk` vide) ne devient jamais
 * principal si un autre en porte un.
 */
export function mainRisk(risks: readonly PlanRisk[] | undefined): PlanRisk | null {
  const candidates = (risks ?? []).filter(risk => (risk.risk ?? '').trim().length > 0)
  if (candidates.length === 0) return null
  return candidates.reduce((best, current) => (severity(current) > severity(best) ? current : best))
}

function severity(risk: PlanRisk): number {
  const impact = IMPACT_RANK[risk.impact ?? ''] ?? 0
  const probability = PROBABILITY_RANK[risk.probability ?? ''] ?? 0
  return impact * 10 + probability
}

/**
 * #1607.1 — BELLUM READ EN QUATRE BLOCS.
 *
 * `BellumReadCard.tsx` ne rendait qu'une phrase libre unique (`justification`,
 * recopiée dans `accounts.priority_justification`). Le retour demande quatre
 * blocs distincts — VERDICT / POURQUOI / CE QUI MANQUE / PROCHAINE ACTION —
 * produits par `bellum_plan.py` dans la MÊME section `evaluation`, en plus de
 * `justification` (jamais à sa place — voir `evaluationSchema.bellum_read`).
 */
export const bellumReadSchema = z.object({
  /** Une phrase courte et directe (ex: « SNCF se travaille par entité, pas au niveau groupe. »). */
  verdict_line: nullableString,
  /** 1 à 3 preuves maximum — jamais une reformulation du score. */
  why: z.array(z.string()).max(3).optional(),
  /** Une ligne explicite sur ce qui manque pour trancher plus fort. */
  missing: nullableString,
  /** Une seule action : vérification si mémoire marché seule, commerciale si preuve actuelle. */
  next_action: nullableString,
})
export type BellumRead = z.infer<typeof bellumReadSchema>

export const quickWinSchema = z.object({
  action: nullableString,
  channel: z.union([channelSchema, z.string()]).optional().nullable(),
  contact: nullableString,
  time_required: nullableString,
  expected_impact: nullableString,
  timeline: nullableString,
  effort: z.union([effortSchema, z.string()]).optional().nullable(),
  ...datedProofShape,
})
export type QuickWin = z.infer<typeof quickWinSchema>

export const evaluationSchema = z.object({
  go_no_go: z.union([goNoGoSchema, z.string()]).optional().nullable(),
  global_score: nullableInt,
  justification: nullableString,
  risks: z.array(planRiskSchema).optional(),
  quick_wins: z.array(quickWinSchema).optional(),
  /**
   * La note sur la grille CANONIQUE /25 (annexe méthodo p25) et le verdict que
   * l'IA a réellement écrit.
   *
   * Ils manquaient à ce schéma, et `parseAccountAnalysis` — qui ne garde que les
   * clés déclarées — les SUPPRIMAIT en silence. Conséquence vue en production le
   * 04/08 sur un dossier réel : l'onglet Score, qui lit `raw_analysis` sans
   * filtrer, affichait « 17/25 » ; la Vue d'ensemble, qui lit l'objet filtré,
   * ne trouvait plus rien et retombait sur la projection « 6/10 ». Le même
   * dossier annonçait donc deux notes différentes à un onglet d'écart.
   *
   * `verdict` compte pour la même raison : seul le verdict ÉCRIT peut porter
   * EXPLORER ; celui qu'on dérive de la note ne le connaît pas.
   */
  score: nullableInt,
  verdict: nullableString,
  /** Plafonnement par le juge qualité — l'écran le badge, il doit survivre au filtre. */
  quality_capped: z.boolean().optional().nullable(),
  quality_cap_reason: nullableString,
  /**
   * #1607.1 — additif à `justification` ci-dessus, jamais un remplacement.
   *
   * `.optional().nullable()` : une analyse d'avant ce lot ne porte pas cette
   * clé, et l'écran doit continuer à afficher `justification` seule — jamais
   * quatre blocs vides. Les consommateurs qui lisent encore `justification`
   * (executiveSummary, priority_justification, documents.service.ts,
   * share-public…) continuent de la recevoir telle quelle, sans dépendre de ce
   * champ neuf. Voir `bellumReadSchema` juste au-dessus.
   */
  bellum_read: bellumReadSchema.optional().nullable(),
  /**
   * #2118 — la lecture du dossier en contrat FERMÉ : sept axes fixes + les
   * blocs rédigés (voir `dossier-read.ts` pour la raison de chacun).
   *
   * `.catch(null)` n'est pas de la mollesse : `parseAccountAnalysis` filtre
   * champ par champ, et sans lui un `dossier_read` malformé — un modèle qui
   * rend un axe hors liste, une note sur un axe inconnu — ferait tomber
   * l'évaluation ENTIÈRE, donc le score et le verdict avec elle. Le bloc neuf
   * n'a pas le droit d'emporter ce qui marchait avant lui.
   */
  dossier_read: dossierReadSchema.optional().nullable().catch(null),
})
export type Evaluation = z.infer<typeof evaluationSchema>

/**
 * Two explicit score axes (Théo P1 « Score et quick wins ») — the plan surfaces
 * the business fit SEPARATELY from how trustworthy the underlying data is, and
 * ties every factor of the score to a proof. Mirror of
 * ``apps/ia/app/services/score_axes.py``.
 */

export const scoreFactorSchema = z.object({
  label: nullableString,
  // Tolerant on the enum (see base.ts header): an unknown future proof type is
  // kept as a plain string rather than dropping the whole factor.
  proof_type: z.union([proofTypeSchema, z.string()]).optional().nullable(),
  weight: nullableInt,
  /** ``axis`` factors ADD UP to the single ``total`` factor. Absent on legacy
   *  runs — the reader then treats the factor as an axis. */
  kind: z.enum(['axis', 'total']).optional().nullable(),
  /** Scale the ``weight`` is expressed on (5 per axis, 25 for the total). */
  max: nullableInt,
})
export type ScoreFactor = z.infer<typeof scoreFactorSchema>

export const planOutputSchema = z
  .object({
    action_plan: actionPlanBodySchema.optional(),
    offers_to_propose: z.array(offerProposalSchema).optional(),
    quick_wins: z.array(quickWinSchema).optional(),
    evaluation: evaluationSchema.optional(),
    competitive_strategy: competitiveStrategySchema.optional(),
    // Two explicit axes + evidence (both 0-100). Optional / backward-compatible —
    // present only on runs produced after the score-axes split shipped.
    commercial_score: nullableNumber,
    data_confidence: nullableNumber,
    score_factors: z.array(scoreFactorSchema).optional(),
  })
  .passthrough()
export type PlanOutput = z.infer<typeof planOutputSchema>

export const userPlanActionSchema = z.object({
  text: z.string().trim().min(1),
  responsable: nullableString,
  outil: nullableString,
  deadline: nullableString,
  kpi: nullableString,
  expected_outcome: nullableString,
})
export type UserPlanAction = z.infer<typeof userPlanActionSchema>

export const userAttackAngleSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableString,
  entry_point: nullableString,
  offer: nullableString,
  estimated_deal_size: nullableString,
  recommended: z.boolean().optional(),
})
export type UserAttackAngle = z.infer<typeof userAttackAngleSchema>

export const accountPlanMutationResponseSchema = z.object({
  raw_analysis: z.record(z.string(), z.unknown()),
  /**
   * `false` quand l'élément était DÉJÀ au plan — l'append est idempotent
   * (containment JSONB), il ne l'était juste pas *observable*. C'est ce qui
   * permet à un appelant en masse d'annoncer « N ajoutés, M ignorés (déjà au
   * plan) » avec de vrais compteurs plutôt qu'une estimation.
   *
   * Optional : une API antérieure à ce déploiement ne l'envoie pas — l'absence
   * signifie « le serveur ne sait pas le dire », pas « rien n'a été ajouté ».
   */
  added: z.boolean().optional(),
})
export type AccountPlanMutationResponse = z.infer<typeof accountPlanMutationResponseSchema>
