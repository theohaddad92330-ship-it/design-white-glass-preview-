import { z } from 'zod'
import type { CommercialTransitionSubjectType } from './commercial-transition.js'

/**
 * Épopée #2967 — LA MACHINE D'ÉTAT COMMERCIALE & STAFFING CANONIQUE.
 *
 * Six objets portaient déjà chacun leur statut (opportunité, besoin,
 * shortlist, positionnement, mission, et le sujet `signal` du journal), chacun
 * avec sa propre machine locale (`canTransitionNeedStatus`, `canTransition`
 * des positionnements…). Ce fichier ne les remplace pas : il les RATTACHE à
 * une seule échelle commune, sans renommer une valeur ni migrer une ligne
 * (enum-additivity) — une seule source des stades et des transitions permises,
 * lue par l'API (journal, contrôle de transition préparée par Laura) et par
 * l'écran.
 *
 * Tranché (Louis, lot V39) : la machine vit ICI, en Zod ; chaque transition
 * écrit une ligne d'audit avec sa SOURCE ; une correction humaine gagne
 * toujours ; Laura PROPOSE, l'humain valide.
 */
export const COMMERCIAL_CANONICAL_STAGES = [
  'signal',
  'piste',
  'opportunite',
  'besoin_confirme',
  'match',
  'shortlist',
  'positionnement',
  'retenu',
  'mission',
  // Deux sorties, hors de la progression.
  'perdu',
  'en_veille',
] as const
export const commercialCanonicalStageSchema = z.enum(COMMERCIAL_CANONICAL_STAGES)
export type CommercialCanonicalStage = z.infer<typeof commercialCanonicalStageSchema>

/** Les stades de la PROGRESSION, dans l'ordre (sans les deux sorties). */
const PROGRESSION: readonly CommercialCanonicalStage[] = COMMERCIAL_CANONICAL_STAGES.slice(0, 9)

/**
 * Qui a produit une ligne du journal de transition (#2320.23).
 *  · `human` — un geste d'utilisateur ;
 *  · `laura` — une transition PROPOSÉE par Laura et validée par un humain
 *    (`actor_id` reste l'humain qui a validé : Laura n'exécute jamais seule) ;
 *  · `human_correction` — un humain qui corrige l'état : elle gagne toujours,
 *    quelle que soit sa date (doctrine « une correction humaine gagne »).
 * Liste fermée, gardée par `commercial_transitions_source_check`
 * (migration `1796349317423`) — une valeur s'ajoute ICI d'abord (GA-11/GA-12).
 */
export const COMMERCIAL_TRANSITION_SOURCES = ['human', 'laura', 'human_correction'] as const
export const commercialTransitionSourceSchema = z.enum(COMMERCIAL_TRANSITION_SOURCES)
export type CommercialTransitionSource = z.infer<typeof commercialTransitionSourceSchema>

/**
 * Le rattachement des statuts STOCKÉS aux stades canoniques. Une table par
 * sujet du journal ; un statut absent de sa table rend `null` (jamais un stade
 * deviné). Garanti exhaustif par le test : chaque statut existant a son stade.
 *
 * Un besoin `won` et un positionnement `accepted` sont RETENUS, jamais déjà
 * une mission (#2320.3 : un entretien positif ne devient pas une mission tout
 * seul — la mission exige l'accord client ET consultant, #2320.21).
 */
const STAGE_BY_SUBJECT: Readonly<
  Record<CommercialTransitionSubjectType, Readonly<Record<string, CommercialCanonicalStage>>>
> = {
  signal: { piste: 'piste' },
  opportunity: {
    detected: 'signal',
    potential: 'signal',
    qualified: 'opportunite',
    confirmed: 'besoin_confirme',
    profiles_submitted: 'positionnement',
    negotiation: 'retenu',
    won: 'retenu',
    lost: 'perdu',
    dormant: 'en_veille',
  },
  need: {
    detected: 'signal',
    to_qualify: 'opportunite',
    open: 'opportunite',
    qualified: 'besoin_confirme',
    to_match: 'match',
    matching: 'match',
    shortlist_ready: 'shortlist',
    submitted: 'positionnement',
    client_review: 'positionnement',
    interview: 'positionnement',
    negotiation: 'retenu',
    won: 'retenu',
    staffed: 'mission',
    lost: 'perdu',
    cancelled: 'perdu',
    on_hold: 'en_veille',
    to_reactivate: 'en_veille',
  },
  shortlist: { draft: 'match', shared: 'shortlist' },
  submission: {
    shortlisted: 'shortlist',
    submitted: 'positionnement',
    interview: 'positionnement',
    accepted: 'retenu',
    rejected: 'perdu',
    withdrawn: 'perdu',
  },
  mission: {
    onboarding: 'mission',
    active: 'mission',
    paused: 'mission',
    ready_to_start: 'mission',
    at_risk: 'mission',
    renewal_pending: 'mission',
    ending: 'mission',
    ended: 'mission',
    terminated: 'mission',
    renewed: 'mission',
    completed: 'mission',
    cancelled: 'perdu',
    archived: 'mission',
  },
}

export function canonicalCommercialStage(
  subjectType: CommercialTransitionSubjectType,
  storedState: string | null | undefined,
): CommercialCanonicalStage | null {
  if (!storedState) return null
  return STAGE_BY_SUBJECT[subjectType]?.[storedState] ?? null
}

/** Les preuves qu'une transition gardée peut exiger. */
export const COMMERCIAL_TRANSITION_EVIDENCE_KEYS = [
  'interpretation',
  'qualification',
  'criteria_review',
  'unknowns_review',
  'consultant_agreement',
  'client_agreement',
] as const
export type CommercialTransitionEvidenceKey = (typeof COMMERCIAL_TRANSITION_EVIDENCE_KEYS)[number]

type GuardedTransition = {
  from: CommercialCanonicalStage
  to: CommercialCanonicalStage
  requires: readonly CommercialTransitionEvidenceKey[]
}

/** Les CINQ transitions nommées de l'épopée, chacune avec sa preuve exigée. */
export const COMMERCIAL_GUARDED_TRANSITIONS: readonly GuardedTransition[] = [
  // #2320.14 — une interprétation explicable, jamais un signal brut.
  { from: 'signal', to: 'piste', requires: ['interpretation'] },
  // #2320.16 — une qualification écrite.
  { from: 'opportunite', to: 'besoin_confirme', requires: ['qualification'] },
  // #2320.17 — la revue des critères ET des inconnues.
  { from: 'match', to: 'shortlist', requires: ['criteria_review', 'unknowns_review'] },
  // #2320.18 — l'accord du consultant avant de le positionner.
  { from: 'shortlist', to: 'positionnement', requires: ['consultant_agreement'] },
  // #2320.21 — double accord : client ET consultant.
  { from: 'retenu', to: 'mission', requires: ['client_agreement', 'consultant_agreement'] },
]

export const commercialTransitionEvidenceSchema = z
  .object({
    interpretation: z.string().max(2000).optional(),
    qualification: z.string().max(2000).optional(),
    criteria_review: z.string().max(2000).optional(),
    unknowns_review: z.string().max(2000).optional(),
    consultant_agreement: z.string().max(2000).optional(),
    client_agreement: z.string().max(2000).optional(),
  })
  .strict()
export type CommercialTransitionEvidence = z.infer<typeof commercialTransitionEvidenceSchema>

type CommercialTransitionRefusal =
  | 'same_stage'
  | 'backward_requires_human_correction'
  | 'reopen_requires_human_correction'
  | 'missing_evidence'

export type CommercialTransitionVerdict = {
  allowed: boolean
  reason: CommercialTransitionRefusal | null
  /** Les preuves manquantes, dans l'ordre des gardes traversées (#2320.27). */
  missing: CommercialTransitionEvidenceKey[]
  /** Vrai dès que la transition vient de Laura : elle propose, l'humain valide. */
  requiresHumanValidation: boolean
}

function hasEvidence(evidence: CommercialTransitionEvidence, key: CommercialTransitionEvidenceKey): boolean {
  return (evidence[key] ?? '').trim().length > 0
}

/**
 * Le verdict d'UNE transition canonique, sans l'exécuter.
 *
 * - Aller de l'avant est permis, mais chaque transition gardée TRAVERSÉE exige
 *   sa preuve : sauter des stades ne contourne jamais une garde (#2320.22 —
 *   aucune transition ne se déduit d'un signal faible).
 * - Reculer, ou rouvrir un dossier perdu, n'est permis qu'à une correction
 *   humaine — qui, elle, passe toujours.
 * - Sortir (perdu / en veille) est permis depuis tout stade actif ; sortir de
 *   la veille vers un stade actif aussi.
 * - Une transition venue de Laura n'est jamais appliquée seule.
 */
export function evaluateCommercialTransition(input: {
  from: CommercialCanonicalStage
  to: CommercialCanonicalStage
  source: CommercialTransitionSource
  evidence: CommercialTransitionEvidence
}): CommercialTransitionVerdict {
  const { from, to, source, evidence } = input
  const requiresHumanValidation = source === 'laura'
  const refuse = (reason: CommercialTransitionRefusal, missing: CommercialTransitionEvidenceKey[] = []) => ({
    allowed: false,
    reason,
    missing,
    requiresHumanValidation,
  })
  if (from === to) return refuse('same_stage')
  if (source === 'human_correction') return { allowed: true, reason: null, missing: [], requiresHumanValidation }
  if (from === 'perdu') return refuse('reopen_requires_human_correction')
  if (to === 'perdu' || to === 'en_veille' || from === 'en_veille') {
    return { allowed: true, reason: null, missing: [], requiresHumanValidation }
  }

  const fromIndex = PROGRESSION.indexOf(from)
  const toIndex = PROGRESSION.indexOf(to)
  if (toIndex < fromIndex) return refuse('backward_requires_human_correction')

  const missing: CommercialTransitionEvidenceKey[] = []
  for (const guard of COMMERCIAL_GUARDED_TRANSITIONS) {
    const guardFrom = PROGRESSION.indexOf(guard.from)
    const guardTo = PROGRESSION.indexOf(guard.to)
    if (guardFrom < fromIndex || guardTo > toIndex) continue
    for (const key of guard.requires) {
      if (!hasEvidence(evidence, key) && !missing.includes(key)) missing.push(key)
    }
  }
  if (missing.length > 0) return refuse('missing_evidence', missing)
  return { allowed: true, reason: null, missing: [], requiresHumanValidation }
}

type StageJournalLine = {
  stage: CommercialCanonicalStage
  source: CommercialTransitionSource
  occurredAt: string
}

/**
 * Le stade EFFECTIF d'un dossier, lu depuis son journal : la dernière ligne,
 * sauf qu'une correction humaine gagne toujours, quelle que soit sa date —
 * une transition Laura postérieure à une correction ne l'écrase jamais. `null`
 * = journal vide, jamais un stade par défaut.
 */
export function effectiveCommercialStage(lines: readonly StageJournalLine[]): CommercialCanonicalStage | null {
  if (lines.length === 0) return null
  const ordered = [...lines].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  const corrected = ordered.some(line => line.source === 'human_correction')
  const kept = corrected ? ordered.filter(line => line.source !== 'laura') : ordered
  return kept.length > 0 ? kept[kept.length - 1].stage : null
}
