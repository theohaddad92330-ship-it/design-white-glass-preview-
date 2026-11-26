/**
 * #2089.28-.36 — l'écran de génération dédié, PLEIN mais sobre. Six phases
 * réelles, « vérif → sauvegarde » (Louis 15/09 : contradiction avec #2012.2-.8
 * — SEPT phases là-bas — tranchée par Claude, « prends-les tous, ne me
 * redemande rien ». On prend les SIX de #2089, ce sont celles de CET écran).
 *
 * ⚠️ LIMITE ASSUMÉE, écrite ici pour ne pas se relire comme un oubli :
 * aujourd'hui le parcours n'expose que DEUX signaux RÉELS (`complete` puis
 * `generateProfile`, cf. `useGenerateAuditPhases.ts`) — aucun événement de
 * progression fin n'existe encore côté backend pour ce job. Les six phases
 * sont donc groupées sous ces deux signaux : la phase 1 (vérification) suit
 * `complete` ; les phases 2 à 6 suivent TOUTES `generateProfile`, ensemble —
 * « en cours » veut dire « fait partie de l'opération réelle en cours »,
 * jamais « celle-ci précisément vient de finir ». C'est moins granulaire que
 * six signaux indépendants, mais c'est vrai : aucune phase n'affiche jamais
 * « Terminé » avant que son opération réelle ait RÉELLEMENT abouti (doctrine
 * « JAMAIS de donnée fictive »).
 *
 * #2775 (#2012.9, LOT j1 26/09/2026) — le regroupement de `market`/`offer`/
 * `plan`/`persist` sous `buildProfile` n'est plus seulement une limite
 * ASSUMÉE : c'est désormais une doctrine NOMMÉE et datée
 * (`c86_onboarding_market_offer_plan_un_seul_signal`,
 * `doctrine-registry.ts`) — `ProfilerAgent._generate`
 * (`apps/ia/app/agents/profiler.py:197`) fait UN SEUL appel Claude pour tout
 * le `ProfileContext` ; le découper en trois appels ajouterait coût et
 * latence pour la seule granularité d'affichage. Tranché sans Louis.
 */

export type GenerationPhaseCode = 'verify' | 'buildProfile' | 'market' | 'offer' | 'plan' | 'persist'

export const GENERATION_PHASES: readonly { code: GenerationPhaseCode; titleKey: string }[] = [
  { code: 'verify', titleKey: 'generating.phases.verify' },
  { code: 'buildProfile', titleKey: 'generating.phases.buildProfile' },
  { code: 'market', titleKey: 'generating.phases.market' },
  { code: 'offer', titleKey: 'generating.phases.offer' },
  { code: 'plan', titleKey: 'generating.phases.plan' },
  { code: 'persist', titleKey: 'generating.phases.persist' },
]

/** #2089.30 — les cinq statuts possibles d'une phase. */
export type GenerationPhaseStatus = 'pending' | 'inProgress' | 'done' | 'partial' | 'error'

/** L'état RÉEL d'une des deux opérations réseau qui portent les six phases.
 *  Non exporté : consommé uniquement dans ce fichier (les appelants passent
 *  des littéraux `'idle' | 'pending' | 'success' | 'error'` structurellement
 *  compatibles — `pnpm lint:exports:types` interdit un export sans appelant
 *  externe qui l'importe par son nom). */
type GenerationStepState = 'idle' | 'pending' | 'success' | 'error'

/**
 * #2089.29/.30/.35 — dérive le statut des six phases depuis les deux SEULS
 * signaux réels. `verify` couvre la phase 1 ; toutes les autres suivent
 * `buildProfile`. Casser ce mapping (ex. rendre une phase « done » avant que
 * son opération résolve) doit faire rougir `onboarding-generation-phases.test.ts`.
 */
export function derivePhaseStatuses(steps: {
  verify: GenerationStepState
  buildProfile: GenerationStepState
}): Record<GenerationPhaseCode, GenerationPhaseStatus> {
  const verifyStatus = statusOfStep(steps.verify)
  // Les phases 2-6 ne peuvent commencer qu'une fois `verify` RÉUSSI — sinon
  // elles resteraient « en attente », jamais inventées « en cours ».
  const buildStatus: GenerationPhaseStatus = steps.verify === 'success' ? statusOfStep(steps.buildProfile) : 'pending'

  return {
    verify: verifyStatus,
    buildProfile: buildStatus,
    market: buildStatus,
    offer: buildStatus,
    plan: buildStatus,
    persist: buildStatus,
  }
}

function statusOfStep(state: GenerationStepState): GenerationPhaseStatus {
  if (state === 'success') return 'done'
  if (state === 'error') return 'error'
  if (state === 'pending') return 'inProgress'
  return 'pending'
}

/** #2089.35 — quelle opération réelle relancer pour une phase en erreur. */
export function stepOfPhase(phase: GenerationPhaseCode): 'verify' | 'buildProfile' {
  return phase === 'verify' ? 'verify' : 'buildProfile'
}
