import {
  accessStrategy,
  auditFunnelBreak,
  auditStartingPoint,
  frontsBudget,
  routineProposalsFromBreaks,
} from '@bellum/contracts'
import type { OnboardingAnswers, OnboardingAnswerValue } from '@/stores/onboardingStore'

/**
 * #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16 — CE QUE L'AUDIT SAIT
 * DÉJÀ DIRE, à l'écran de relecture, juste avant qu'on le génère.
 *
 * Le calcul vit dans `@bellum/contracts` (`onboarding/audit-readout.ts`) : ce
 * fichier ne fait que le traduire en lignes affichables. La séparation n'est pas
 * décorative — c'est elle qui permet au moteur de lire les mêmes dérivations
 * sans passer par l'écran (GA-26), et c'est aussi ce qui empêche un futur
 * `?? 0` d'apparaître ici sur une valeur que le contrat a délibérément laissée
 * non mesurée.
 *
 * ⚠️ DEUX RÈGLES QUI SE LISENT DANS LA FORME DU RETOUR.
 *  - Une dérivation `not_measured` ne produit AUCUNE ligne : « non mesuré » ne
 *    s'affiche jamais « 0 ». Mais elle n'est pas non plus passée sous silence —
 *    elle entre dans `unmeasured`, NOMMÉE. Un audit qui tait ce qu'il ne sait
 *    pas se lit comme un audit complet.
 *  - Aucune ligne ne porte de pourcentage : les cinq dérivations n'en rendent
 *    aucun, et il n'y a nulle part ici où en fabriquer un.
 */

type ReadoutValues = Record<string, string | number>

type AuditReadoutRow = {
  /** Clé React ET identifiant de l'axe — un seul nom pour les deux. */
  key: AuditReadoutAxis
  labelKey: string
  values?: ReadoutValues
  /** Ce sur quoi la lecture s'appuie, mot pour mot depuis les réponses —
   *  jamais une déduction muette. Vide quand la phrase se suffit. */
  detail: string[]
}

type AuditReadoutAxis = 'effort' | 'routines' | 'startingPoint' | 'strategy' | 'funnel'

type AuditReadout = {
  rows: AuditReadoutRow[]
  /** Les axes que les réponses ne permettent pas encore d'évaluer, NOMMÉS. */
  unmeasured: AuditReadoutAxis[]
}

function text(value: OnboardingAnswerValue | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function list(value: OnboardingAnswerValue | undefined): string[] {
  return Array.isArray(value) ? value : []
}

const STRATEGY_LABEL: Record<'top_down' | 'bottom_up' | 'multi_thread', string> = {
  top_down: 'review.readout.strategy.topDown',
  bottom_up: 'review.readout.strategy.bottomUp',
  multi_thread: 'review.readout.strategy.multiThread',
}

export function buildAuditReadout(answers: OnboardingAnswers): AuditReadout {
  const rows: AuditReadoutRow[] = []
  const unmeasured: AuditReadoutAxis[] = []

  // #2050.14 — moins de fronts, jamais un outil de plus.
  // #2067 — décision Louis du 18/09/2026 : le nombre de fronts est celui de
  // L'AUDIT, calculé par la MÊME fonction (`frontsBudget`, contrat) — la
  // relecture n'a plus de calcul à elle (plafond 3, érosion retranchée) qui
  // pouvait dire 1 là où l'audit dit 3. L'érosion déclarée est CITÉE sous le
  // nombre, jamais retranchée. `audit-readout-fronts-parity.test.ts` prouve
  // l'égalité des deux écrans.
  const budget = frontsBudget({
    weekly_sales_time_protected: text(answers.weekly_sales_time_protected),
    weekly_sales_time_declared: text(answers.weekly_sales_time_declared),
    protected_slot_capacity: text(answers.protected_slot_capacity),
    workload_variability: text(answers.workload_variability),
  })
  if (budget.kind === 'measured' && budget.maxFronts > 0) {
    rows.push({
      key: 'effort',
      labelKey: 'review.readout.fronts',
      values: { count: budget.maxFronts },
      detail: budget.erosionRisks,
    })
  } else if (budget.kind === 'measured') {
    // « Aucune heure dans une semaine ordinaire » : un zéro DÉCLARÉ, dit en mots.
    rows.push({ key: 'effort', labelKey: 'review.readout.noTimeDeclared', detail: [] })
  } else {
    unmeasured.push('effort')
  }

  // #2051.16 — une routine cite la rupture qui la fonde.
  const proposals = routineProposalsFromBreaks(list(answers.dossier_continuity_breaks))
  if (proposals.length > 0) {
    rows.push({
      key: 'routines',
      labelKey: 'review.readout.routines',
      values: { count: proposals.length },
      // La rupture CITÉE, pas seulement comptée : c'est la demande du point.
      detail: proposals.map(proposal => proposal.fromBreak),
    })
  } else {
    unmeasured.push('routines')
  }

  // #2042.15 — le point de départ peut différer de l'ambition.
  const start = auditStartingPoint({
    ideal_client_current_state: list(answers.ideal_client_current_state),
    ideal_client_accessibility: text(answers.ideal_client_accessibility),
    ideal_client_referencement_constraints: list(answers.ideal_client_referencement_constraints),
  })
  if (start.kind === 'differs') {
    rows.push({ key: 'startingPoint', labelKey: 'review.readout.startingPointDiffers', detail: start.obstacles })
  } else if (start.kind === 'ambition_is_reachable') {
    rows.push({ key: 'startingPoint', labelKey: 'review.readout.startingPointReachable', detail: start.grounds })
  } else {
    unmeasured.push('startingPoint')
  }

  // #2043.10 — l'axe d'accès, NOMMÉ, jamais un score.
  const strategy = accessStrategy({
    real_response_level: text(answers.real_response_level),
    budget_validator: text(answers.budget_validator),
    access_orienteur: text(answers.access_orienteur),
  })
  if (strategy.kind === 'axis') {
    rows.push({ key: 'strategy', labelKey: STRATEGY_LABEL[strategy.axis], detail: [] })
  } else {
    unmeasured.push('strategy')
  }

  // #2049.15 — où la chaîne cesse d'être mesurée, sans conversion inventée.
  const funnel = auditFunnelBreak({
    activity_measures_tracked: list(answers.activity_measures_tracked),
    activity_reference_period: text(answers.activity_reference_period) ?? undefined,
  })
  if (funnel.kind === 'break') {
    rows.push({
      key: 'funnel',
      labelKey: 'review.readout.funnelBreak',
      values: { measure: funnel.measure.value },
      detail: [],
    })
  } else if (funnel.kind === 'complete') {
    rows.push({ key: 'funnel', labelKey: 'review.readout.funnelComplete', detail: [] })
  } else {
    // `not_declared` = « on n'a pas demandé », jamais « rien n'est suivi ».
    unmeasured.push('funnel')
  }

  return { rows, unmeasured }
}
