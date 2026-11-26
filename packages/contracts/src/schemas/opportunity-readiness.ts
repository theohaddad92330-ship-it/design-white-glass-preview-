import { z } from 'zod'
import { BTMMP_AXES, btmmpCompleteness, type Btmmp } from './project.js'
import { evidenceGapSchema, projectReadRowSchema, type EvidenceGap } from './opportunity-ontology.js'

/**
 * READINESS — BEL-SC-237 (#3266.16) : « dimensions connues, dimensions
 * manquantes, blocage principal, prochaine question, niveau de confiance »,
 * pour une opportunité.
 *
 * ⚠️ CE N'EST PAS UN TROISIÈME BARÈME (doctrine CLAUDE.md — « jamais un
 * deuxième score, une deuxième qualification »). Deux barèmes existaient déjà,
 * chacun avec son appelant, et ne se parlaient pas :
 *   - {@link btmmpCompleteness} — six axes de texte libre (annexe méthodo p21) ;
 *   - les manques « opportunité » du barème anti-inflation
 *     (`opportunityEvidenceGaps`, `opportunity-ontology.ts`, #2325.13).
 * Ce module ne recalcule NI L'UN NI L'AUTRE : il les COMBINE, dans l'ordre où
 * un commercial doit les lire — d'abord ce qui empêche de revendiquer
 * « opportunité » au sens du barème (fit, périmètre, décideur, prochaine
 * action, demande exprimée), puis, seulement une fois ces manques comblés, le
 * premier axe BTMMP encore vide.
 *
 * STATUTS (BEL-SC-237) — SIGNAL/TO_QUALIFY/QUALIFIED_NEED/MATCHABLE/
 * PROPOSAL_READY/DECISION_PENDING/WON/LOST/PAUSED n'ont PAS de code ici : ce
 * sont, un à un, `PROJECT_STAGES` (`project.ts`) — detected/potential/
 * qualified/confirmed/profiles_submitted/negotiation/won/lost/dormant. En
 * ajouter un second serait exactement le « deuxième objet concurrent » que la
 * doctrine interdit (règle commune #3249.4).
 */

const btmmpAxisSchema = z.enum(BTMMP_AXES)
export type BtmmpAxisName = z.infer<typeof btmmpAxisSchema>

export const opportunityReadinessBlockerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('evidence'), gap: evidenceGapSchema }),
  z.object({ kind: z.literal('btmmp'), axis: btmmpAxisSchema }),
])
export type OpportunityReadinessBlocker = z.infer<typeof opportunityReadinessBlockerSchema>

export const opportunityReadinessSchema = z.object({
  /** Axes BTMMP déjà renseignés. */
  known: z.array(btmmpAxisSchema),
  /** Axes BTMMP encore vides — jamais comptés « zéro », toujours nommés. */
  missing: z.array(btmmpAxisSchema),
  /** Les manques « opportunité » du barème anti-inflation, tels que reçus. */
  evidence_gaps: z.array(evidenceGapSchema),
  /** Le SEUL blocage à traiter en premier. `null` = rien ne bloque. */
  main_blocker: opportunityReadinessBlockerSchema.nullable(),
  /** Fournie par l'appelant (déjà décroissante avec la fraîcheur) — jamais
   *  recalculée ici : {@link withDecayedConfidence} (`projects.service.ts`)
   *  reste l'UNIQUE calcul. `null` = non mesurée, jamais un niveau inventé. */
  confidence: z.enum(['high', 'medium', 'low']).nullable(),
})
export type OpportunityReadiness = z.infer<typeof opportunityReadinessSchema>

/**
 * Ordre de priorité des manques « opportunité » — celui qui empêche le plus
 * une affaire d'avancer d'abord. `not_expressed` en tête : sans une demande
 * exprimée, discuter du fit ou du périmètre reste hypothétique (même principe
 * que `EVIDENCE_REQUIREMENTS.opportunity`, `opportunity-ontology.ts`).
 *
 * `no_dated_fact` / `single_dated_fact` / `unattached_fact` sont ABSENTS,
 * délibérément : ce sont les manques des niveaux `fact`/`detected_project`,
 * jamais rendus par `opportunityEvidenceGaps` (elle applique le barème au
 * seul niveau `opportunity`) — les lister ici les rendrait inatteignables et
 * gèlerait le blocage sur un manque qui ne peut jamais survenir en entrée.
 */
const EVIDENCE_GAP_PRIORITY: readonly EvidenceGap[] = [
  'not_expressed',
  'no_fit',
  'no_perimeter',
  'no_decision_maker',
  'no_next_action',
]

/** Ordre de priorité des axes BTMMP — ce qu'on ne sait toujours pas FAIRE
 *  (mission) prime sur ce qu'on ne sait pas encore VENDRE (budget/process). */
const BTMMP_AXIS_PRIORITY: readonly BtmmpAxisName[] = [
  'mission',
  'management',
  'budget',
  'timing',
  'process',
  'nextStep',
]

export function opportunityReadiness(input: {
  btmmp: Btmmp | null | undefined
  evidenceGaps: readonly EvidenceGap[]
  confidence: 'high' | 'medium' | 'low' | null
}): OpportunityReadiness {
  const { filled, missing } = btmmpCompleteness(input.btmmp)

  let mainBlocker: OpportunityReadinessBlocker | null = null
  for (const gap of EVIDENCE_GAP_PRIORITY) {
    if (input.evidenceGaps.includes(gap)) {
      mainBlocker = { kind: 'evidence', gap }
      break
    }
  }
  if (!mainBlocker) {
    for (const axis of BTMMP_AXIS_PRIORITY) {
      if (missing.includes(axis)) {
        mainBlocker = { kind: 'btmmp', axis }
        break
      }
    }
  }

  return {
    known: filled,
    missing,
    evidence_gaps: [...input.evidenceGaps],
    main_blocker: mainBlocker,
    confidence: input.confidence,
  }
}

/**
 * La ligne d'opportunité, `readiness` compris — même patron que `evidence`/
 * `stage_detail` sur {@link projectReadRowSchema} : calculé À LA LECTURE,
 * optionnel pour le deploy-skew (`undefined` = l'API ne l'a pas dit).
 *
 * Défini ICI plutôt que d'étendre `projectReadRowSchema` sur place
 * (`opportunity-ontology.ts`) : ce module a besoin de son `evidenceGapSchema`,
 * et l'étendre en retour l'importerait en boucle. Le sens unique
 * (`opportunity-readiness.ts` → `opportunity-ontology.ts` → `project.ts`)
 * garde les trois fichiers chargeables.
 */
export const projectReadinessRowSchema = projectReadRowSchema.extend({
  readiness: opportunityReadinessSchema.optional(),
})
export type ProjectReadinessRow = z.infer<typeof projectReadinessRowSchema>
