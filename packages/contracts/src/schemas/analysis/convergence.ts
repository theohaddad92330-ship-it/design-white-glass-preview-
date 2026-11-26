import { z } from 'zod'

/**
 * #2952 (#2305.13/.14/.15/.16/.18/.35) — LAU-FINAL-046, la chaîne SIGNAL →
 * PROJET PLAUSIBLE/CONFIRMÉ → BESOIN DÉTECTÉ/EXPRIMÉ → OPPORTUNITÉ.
 *
 * Ce fichier pose les QUATRE niveaux intermédiaires (l'« opportunité
 * workspace » existe déjà — conversion lead→opportunité, `labels.en.ts:1508`)
 * et les deux invariants que l'issue nomme explicitement :
 *
 *  - « Aucune transition automatique » entre niveaux (#2305.18) —
 *    `assertExplicitConvergenceTransition` refuse tout changement d'état qui
 *    ne porte pas un geste humain explicite.
 *  - « Un projet plausible doit citer les signaux qui le fondent »
 *    (#2305.35) — `assertConvergenceCitesFoundingSignals`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERSISTANCE (26/09/2026) — `project_needs.convergence_state`
 * ─────────────────────────────────────────────────────────────────────────────
 * Le porteur EST `project_needs` (`ProjectNeedEntity.convergence_state`,
 * migration `1796321998392-NeedConvergenceState.ts`), pas une nouvelle table :
 * un besoin y existe déjà SANS projet (`project_id`, #2558.1), donc c'est déjà
 * l'objet qui va du signal au projet. Les deux invariants ci-dessous ont
 * maintenant un appelant réel : `ProjectPipelineService.changeNeedConvergenceState`,
 * derrière `PATCH /projects/needs/:needId/convergence-state`.
 *
 * Ce qui reste HORS de ce lot : la PRODUCTION IA qui proposerait un niveau à
 * partir des signaux (prompt `apps/ia`) — le geste reste humain, explicite,
 * un besoin à la fois. Construire cette production est un chantier séparé.
 */
/**
 * #3409.2 — ordre CROISSANT de maturité (signal → confirmé), celui que la
 * fiche du besoin (`NeedConvergenceStateControl.tsx`) propose au clic.
 * `convergenceStateSchema` reste la source de vérité pour la validation ;
 * cette liste ne fait que lui donner un ORDRE d'affichage, qu'un `z.enum`
 * n'a pas (ses `.options` reviennent dans l'ordre d'écriture ci-dessous,
 * qui était jusqu'ici arbitraire pour un lecteur).
 */
export const CONVERGENCE_STATES = [
  /** Demande formulée par le client ou le workspace. */
  'besoin_exprime',
  /** Capacité externe plausible, mais non confirmée. */
  'besoin_detecte',
  /** Hypothèse construite à partir de plusieurs signaux convergents. */
  'projet_plausible',
  /** Projet explicitement nommé ou suffisamment documenté. */
  'projet_confirme',
] as const
export const convergenceStateSchema = z.enum(CONVERGENCE_STATES)
export type ConvergenceState = z.infer<typeof convergenceStateSchema>

export class AutomaticConvergenceTransitionError extends Error {
  constructor(from: ConvergenceState, to: ConvergenceState) {
    super(
      `Transition de convergence "${from}" → "${to}" refusée : aucune transition automatique entre niveaux (#2305.18) — un geste humain explicite est requis.`,
    )
    this.name = 'AutomaticConvergenceTransitionError'
  }
}

/**
 * #2305.18 — « Aucune transition automatique » entre niveaux de convergence.
 *
 * `explicit` doit venir d'un GESTE humain (un clic, une confirmation) — jamais
 * d'une valeur par défaut, d'une reprise de batch ou d'un minuteur. Un appelant
 * qui ne peut pas produire ce booléen depuis un geste utilisateur ne doit pas
 * appeler cette fonction avec `true`.
 */
export function assertExplicitConvergenceTransition(
  from: ConvergenceState,
  to: ConvergenceState,
  { explicit }: { explicit: boolean },
): void {
  if (from === to) return
  if (!explicit) throw new AutomaticConvergenceTransitionError(from, to)
}

export class UnfoundedConvergenceError extends Error {
  constructor() {
    super(
      'Projet plausible refusé : aucun signal fondateur cité (#2305.35 — un projet plausible doit citer les signaux qui le fondent).',
    )
    this.name = 'UnfoundedConvergenceError'
  }
}

/**
 * #2305.35 — « Un projet plausible doit citer les signaux qui le fondent. »
 * Ne s'applique qu'au niveau `projet_plausible` : les autres niveaux ne sont
 * pas définis par une convergence de signaux dans l'issue (`besoin_détecté`/
 * `besoin_exprimé` viennent d'une capacité ou d'une demande, pas d'un
 * faisceau de signaux).
 */
export function assertConvergenceCitesFoundingSignals(
  state: ConvergenceState,
  foundingSignalIds: readonly string[],
): void {
  if (state !== 'projet_plausible') return
  if (foundingSignalIds.length === 0) throw new UnfoundedConvergenceError()
}
