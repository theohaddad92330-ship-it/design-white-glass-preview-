import {
  ACCOUNT_CONTEXT_SCREEN,
  ACCOUNT_HIRING_INTERVENTION_KEY,
  ACCOUNT_PAIN_INTERVENTION_KEY,
  GOLDEN_MOMENTS,
  LAURA_INTERVENTIONS,
  LONG_ACTION_FRESH_MINUTES,
  RETURN_FROM_ABSENCE_DAYS,
  type AccountSuggestionFact,
  type HealthInput,
} from '@bellum/contracts'
import {
  countsNeededForScreen,
  DETECTABLE_KEYS,
  detectGoldenMoment,
  detectInterventions,
  GOLDEN_MOMENT_COUNTS,
  INTERVENTION_DETECTORS,
  matchesScreen,
  UNDETECTED_INTERVENTIONS,
  type DetectionCounts,
} from './laura-detector'
import { BRIEFING_SCREEN, BRIEFING_SIGNAL_KEYS, CHAT_SCREEN, CHAT_SIGNAL_KEYS } from './laura-chat-signals'

/** Un signal de recrutement tel que le dossier le porte — avec sa provenance. */
const HIRING: AccountSuggestionFact = {
  kind: 'hiring_signal',
  statement: 'Deux postes Méthodes ouverts sur le site de Toulouse',
  source: 'Site carrières du groupe',
  observedOn: '2026-07-21',
  count: null,
}

const NOTHING: HealthInput = {
  activation: null,
  connectors: null,
  dataDensity: null,
  teamAdoption: null,
  depth: null,
  consumption: null,
  quality: null,
  actionability: null,
  value: null,
}

/** Un espace dont TOUT va bien : neuf axes au maximum, aucun blocage. */
const HEALTHY: HealthInput = {
  activation: 1,
  connectors: 1,
  dataDensity: 1,
  teamAdoption: 1,
  depth: 1,
  consumption: 1,
  quality: 1,
  actionability: 1,
  value: 1,
}

/** Une mesure généreuse pour CHAQUE clé : rien ne doit se déclencher dessus. */
const PLENTY: DetectionCounts = {
  consultants: 12,
  accounts: 40,
  accountsWithoutNextAction: 0,
  accountsWithoutOwner: 0,
  accountsActedOnBySeveralPeople: 0,
  myActiveAccounts: 12,
  crmConnections: 2,
  openNeeds: 4,
  shortlists: 6,
  missions: 9,
  activeMissions: 5,
  activeMissionsWithCost: 5,
  missionTimesheets: 30,
  endedMissionsWithoutFeedback: 0,
  openRenewalRisks: 0,
  skillsDossiers: 7,
  consultantsFreeingSoon: 0,
  consultantsOnLongBench: 0,
  paidSeats: 6,
  activeSeats: 6,
  copilotMessages: 20,
  enabledRoutines: 3,
  enabledNotificationChannels: 7,
  accountAgeDays: 120,
  daysUntilCreditCycleEnds: 20,
  daysUntilTrialEnds: null,
  daysAwayBeforeThisVisit: 1,
  repeatedManualCorrections: 0,
  rfpsDueWithGaps: 0,
  needsOpenWithoutShortlist: 0,
  timesheetsMissingAfterReminders: 0,
  invoicesOverdueBeyondGrace: 0,
  pipelineCoverageDays: 180,
  consultantsPlacedThriceAtSameAccount: 0,
  minutesSinceLongActionFinished: null,
  spontaneousQueriesYesterday: 0,
  // Un vivier généreux : trois personnes déclarées libres, aucune fiche muette.
  // La bulle du dossier ne se déclenche pas pour autant — il lui faut AUSSI un
  // signal de recrutement sur le compte ouvert, et `detect()` n'en passe aucun.
  consultantsAvailableNow: 3,
  consultantsAvailabilityUndeclared: 0,
  // Aucune mission en cours ne contredit sa propre date de fin : #1937.4 se tait.
  activeMissionsPastEndDate: 0,
  // #2409.8 / #2409.9 — aucune mission n'approche de son démarrage incomplète,
  // aucune arrivée du jour 1 n'attend sa confirmation.
  missionsStartingSoonNotReady: 0,
  missionsStartedUnconfirmed: 0,
  // #3398 — aucune disponibilité déclarée périmée, aucune relance en retard.
  consultantsAvailabilityStale: 0,
  accountTasksOverdue: 0,
  // #3398.1 — aucun compte ne porte plus du tiers du CA quotidien affecté.
  topAccountRevenueSharePercent: 0,
  // #3398 (lot R12 07/10) — aucun appel loggé à la main sans débrief.
  callsWithoutDebrief: 0,
  // #2875/#3398 (lot T06 08/10) — aucun entretien proche sans brief ouvert.
  interviewsAwaitingBrief: 0,
}

const SCREENS = [...new Set(LAURA_INTERVENTIONS.map(intervention => intervention.screen))]

function detect(
  screen: string,
  counts: DetectionCounts = {},
  health: HealthInput = HEALTHY,
  blocking: string[] | null = [],
): string[] {
  return detectInterventions({ health, blockingIssues: blocking, counts, screen })
}

/** L'écran où le catalogue pose cette clé — pour n'écrire l'écran qu'une fois. */
function screenOf(key: string): string {
  const found = LAURA_INTERVENTIONS.find(intervention => intervention.key === key)
  if (!found) throw new Error(`clé absente du catalogue : ${key}`)
  return found.screen
}

describe('ce qu’on sait réellement détecter', () => {
  it.each([...DETECTABLE_KEYS])('%s existe au catalogue — aucune clé fantôme', key => {
    // Une clé détectée sans définition serait une intervention sans message et
    // sans écran : l'écran afficherait un vide, et personne ne saurait pourquoi.
    expect(LAURA_INTERVENTIONS.some(intervention => intervention.key === key)).toBe(true)
  })

  it('n’a aucun détecteur en double', () => {
    expect(new Set(DETECTABLE_KEYS).size).toBe(DETECTABLE_KEYS.length)
  })

  it('couvre tout le catalogue moins cinq, et NOMME ces cinq-là', () => {
    // Le chiffre est écrit pour qu'il se conteste : il était de huit sur trente,
    // c'est-à-dire vingt-deux entrées de catalogue que rien ne pouvait
    // déclencher. Une entrée de catalogue n'est pas une intervention.
    expect(DETECTABLE_KEYS).toHaveLength(46) // +1 : lot B3 15/10 (forecast fondateur, un COUNT), +1 : #3939.3 (douleur sourcée et datée du dossier ouvert), +1 : 11/10 (métiers placés inconnus, Laura pose la question), +4 : #3398 lot F27 (sans responsable, collisions, portefeuille trop large, fiches à qualifier), +2 : #2409.8 et #2409.9 (démarrage de mission), +2 : #3398 (disponibilité périmée, relance due), +1 : #3398.1 (dépendance à un client), +1 : lot R12 07/10 (appels sans débrief), +1 : lot T06 08/10 (entretien à préparer, brief non consulté)
    expect(Object.keys(UNDETECTED_INTERVENTIONS)).toHaveLength(5)
    expect(LAURA_INTERVENTIONS).toHaveLength(51)
  })

  it.each([...DETECTABLE_KEYS])('%s dit sur quoi il repose — une approximation muette n’est pas contestable', key => {
    const basis = INTERVENTION_DETECTORS.find(detector => detector.key === key)?.basis ?? ''
    expect(basis.trim().length).toBeGreaterThan(20)
    expect(basis).toMatch(/\s/)
  })

  it.each(Object.keys(UNDETECTED_INTERVENTIONS))('%s dit ce qui lui MANQUE', key => {
    const entry = UNDETECTED_INTERVENTIONS[key]
    expect((entry?.missing ?? '').trim().length).toBeGreaterThan(20)
    expect(['detectable_not_yet', 'not_detectable', 'must_not_detect']).toContain(entry?.status)
  })
})

describe('un `null` ne conclut jamais', () => {
  it.each(SCREENS)('%s : rien de mesuré, rien de détecté — sauf l’absence de connecteur', screen => {
    // `connectors === null` est le seul `null` qui soit une information : la
    // sonde ne peut pas faire de ratio sur zéro connecteur, donc l'absence de
    // valeur EST l'absence de connecteur.
    const expected = screen === '/settings/integrations' ? ['no_connector'] : []
    expect(detect(screen, {}, NOTHING, null)).toEqual(expected)
  })

  it('ne prend pas « je n’ai pas pu regarder » pour « rien à signaler »', () => {
    const health = { ...HEALTHY, connectors: 1 }
    // `null` : la lecture a raté. Aucune intervention — annoncer un connecteur
    // en panne sur une lecture ratée est un faux positif, et l'inverse est un
    // faux négatif : les deux se taisent.
    expect(detect('/settings/integrations', {}, health, null)).toEqual([])
    expect(detect('/settings/integrations', {}, health, [])).toEqual([])
    expect(detect('/settings/integrations', {}, health, ['connexion expirée'])).toEqual(['connector_error_48h'])
  })

  it.each(SCREENS)('%s : un espace sain et entièrement mesuré ne déclenche rien', screen => {
    // La mesure la plus généreuse possible : rien ne doit sortir. Sans ce cas,
    // un détecteur écrit à l'envers (`=== 0` au lieu de `> 0`) passerait tous
    // les autres tests.
    expect(detect(screen, PLENTY)).toEqual([])
  })
})

describe('chaque détecteur lit une mesure qui parle de SON sujet', () => {
  it('empty_talent_pool compte le VIVIER, jamais les comptes', () => {
    // Trouvé en recette live : l'espace avait dix-neuf comptes et zéro
    // consultant, l'écran affichait « Ton vivier est vide » — et Laura se
    // taisait, parce que la détection lisait la densité de COMPTES.
    const screen = screenOf('empty_talent_pool')
    expect(detect(screen, { consultants: 0 })).toContain('empty_talent_pool')
    expect(detect(screen, { consultants: 12 })).not.toContain('empty_talent_pool')
    expect(detect(screen, {})).not.toContain('empty_talent_pool')
  })

  // Métiers placés DÉDUITS (décision Louis 11/10/2026) — « sinon on pose la question ».
  it('placed_roles_unknown pose la question seulement quand rien n’est déclaré NI déductible', () => {
    const screen = screenOf('placed_roles_unknown')
    expect(detect(screen, { placedRolesUnknown: 1 })).toContain('placed_roles_unknown')
    // Déclaré ou déduit : rien à demander.
    expect(detect(screen, { placedRolesUnknown: 0 })).not.toContain('placed_roles_unknown')
    // Déduction jamais passée : on ne pose pas une question que le contexte va peut-être résoudre.
    expect(detect(screen, { placedRolesUnknown: null })).not.toContain('placed_roles_unknown')
  })

  it('consultant_free_soon exige un consultant QUI SE LIBÈRE et un besoin où aller', () => {
    const screen = screenOf('consultant_free_soon')
    expect(detect(screen, { consultantsFreeingSoon: 2, openNeeds: 3 })).toContain('consultant_free_soon')
    // Aucun besoin ouvert : le geste proposé ne mènerait nulle part. C'est le
    // défaut « une réponse juste sans chemin », et il se refuse ici.
    expect(detect(screen, { consultantsFreeingSoon: 2, openNeeds: 0 })).not.toContain('consultant_free_soon')
    expect(detect(screen, { consultantsFreeingSoon: 0, openNeeds: 3 })).not.toContain('consultant_free_soon')
    expect(detect(screen, { openNeeds: 3 })).not.toContain('consultant_free_soon')
  })

  it('availability_stale (#3398) exige une disponibilité DÉCLARÉE puis laissée périmer', () => {
    const screen = screenOf('availability_stale')
    expect(detect(screen, { consultantsAvailabilityStale: 2 })).toContain('availability_stale')
    expect(detect(screen, { consultantsAvailabilityStale: 0 })).not.toContain('availability_stale')
    // Non mesuré n'est pas « zéro périmé » ni « beaucoup » : silence.
    expect(detect(screen, {})).not.toContain('availability_stale')
  })

  it('follow_up_overdue (#3398) se déclenche sur une tâche de compte en retard, jamais sur une mesure absente', () => {
    const screen = screenOf('follow_up_overdue')
    expect(detect(screen, { accountTasksOverdue: 1 })).toContain('follow_up_overdue')
    expect(detect(screen, { accountTasksOverdue: 0 })).not.toContain('follow_up_overdue')
    expect(detect(screen, {})).not.toContain('follow_up_overdue')
  })

  it('calls_without_debrief (#3398, lot R12 07/10) se déclenche sur un appel loggé sans débrief, jamais sur une mesure absente', () => {
    const screen = screenOf('calls_without_debrief')
    expect(detect(screen, { callsWithoutDebrief: 1 })).toContain('calls_without_debrief')
    expect(detect(screen, { callsWithoutDebrief: 0 })).not.toContain('calls_without_debrief')
    expect(detect(screen, {})).not.toContain('calls_without_debrief')
  })

  it('interview_brief_not_consulted (#2875/#3398, lot T06 08/10) se déclenche sur un entretien proche dont le brief n’a pas été ouvert, jamais sur une mesure absente', () => {
    const screen = screenOf('interview_brief_not_consulted')
    expect(detect(screen, { interviewsAwaitingBrief: 1 })).toContain('interview_brief_not_consulted')
    expect(detect(screen, { interviewsAwaitingBrief: 0 })).not.toContain('interview_brief_not_consulted')
    expect(detect(screen, {})).not.toContain('interview_brief_not_consulted')
  })

  it('forecast_revenue_declared_blocked (#2875/#3398) se déclenche sur un revenu DÉCLARÉ en difficulté, jamais sur une mesure absente ni sur un « 0 »', () => {
    const screen = screenOf('forecast_revenue_declared_blocked')
    expect(detect(screen, { forecastDeclaredBlockedMissions: 2 })).toContain('forecast_revenue_declared_blocked')
    expect(detect(screen, { forecastDeclaredBlockedMissions: 0 })).not.toContain('forecast_revenue_declared_blocked')
    expect(detect(screen, {})).not.toContain('forecast_revenue_declared_blocked')
  })

  it('client_dependency (#3398.1) exige un compte au-dessus du tiers du CA quotidien affecté, jamais une mesure absente', () => {
    const screen = screenOf('client_dependency')
    expect(detect(screen, { topAccountRevenueSharePercent: 40 })).toContain('client_dependency')
    expect(detect(screen, { topAccountRevenueSharePercent: 34 })).toContain('client_dependency')
    // Un tiers pile n'est pas « au-delà d'un tiers » : silence.
    expect(detect(screen, { topAccountRevenueSharePercent: 33 })).not.toContain('client_dependency')
    // Non mesuré (aucun TJM d'affectation saisi) n'est ni 0 % ni 100 % : silence.
    expect(detect(screen, {})).not.toContain('client_dependency')
  })

  it('accounts_without_owner (#3398.2) se déclenche sur un compte libre, jamais sur une mesure absente (seul à bord)', () => {
    const screen = screenOf('accounts_without_owner')
    expect(detect(screen, { accountsWithoutOwner: 3 })).toContain('accounts_without_owner')
    expect(detect(screen, { accountsWithoutOwner: 0 })).not.toContain('accounts_without_owner')
    expect(detect(screen, { accountsWithoutOwner: null })).not.toContain('accounts_without_owner')
    expect(detect(screen, {})).not.toContain('accounts_without_owner')
  })

  it('account_collisions (#3398.2) exige au moins un compte travaillé à plusieurs', () => {
    const screen = screenOf('account_collisions')
    expect(detect(screen, { accountsActedOnBySeveralPeople: 1 })).toContain('account_collisions')
    expect(detect(screen, { accountsActedOnBySeveralPeople: 0 })).not.toContain('account_collisions')
    expect(detect(screen, {})).not.toContain('account_collisions')
  })

  it('portfolio_too_wide (#3398.1/.4) : au-delà de cinquante comptes, pile cinquante se tait', () => {
    const screen = screenOf('portfolio_too_wide')
    expect(detect(screen, { myActiveAccounts: 51 })).toContain('portfolio_too_wide')
    expect(detect(screen, { myActiveAccounts: 50 })).not.toContain('portfolio_too_wide')
    expect(detect(screen, {})).not.toContain('portfolio_too_wide')
  })

  it('consultant_to_requalify (#3398.5) lit les fiches sans disponibilité déclarée, jamais une mesure absente', () => {
    const screen = screenOf('consultant_to_requalify')
    expect(detect(screen, { consultantsAvailabilityUndeclared: 2 })).toContain('consultant_to_requalify')
    expect(detect(screen, { consultantsAvailabilityUndeclared: 0 })).not.toContain('consultant_to_requalify')
    expect(detect(screen, { consultantsAvailabilityUndeclared: null })).not.toContain('consultant_to_requalify')
  })

  it('long_bench ne compte que des intercontrats MESURÉS', () => {
    const screen = screenOf('long_bench')
    expect(detect(screen, { consultantsOnLongBench: 1 })).toContain('long_bench')
    expect(detect(screen, { consultantsOnLongBench: 0 })).not.toContain('long_bench')
    // Une ESN qui ne renseigne pas ses affectations n'a pas un vivier en
    // intercontrat : elle a un vivier dont on ne sait rien.
    expect(detect(screen, {})).not.toContain('long_bench')
  })

  it('missions_without_timesheet exige des missions ET zéro relevé', () => {
    const screen = screenOf('missions_without_timesheet')
    expect(detect(screen, { missions: 4, missionTimesheets: 0 })).toContain('missions_without_timesheet')
    expect(detect(screen, { missions: 4, missionTimesheets: 1 })).not.toContain('missions_without_timesheet')
    // Aucune mission : il n'y a rien à relever, et le dire serait un reproche
    // adressé à quelqu'un qui n'a rien fait de mal.
    expect(detect(screen, { missions: 0, missionTimesheets: 0 })).not.toContain('missions_without_timesheet')
  })

  it('high_correction_rate lit le journal des champs', () => {
    const screen = screenOf('high_correction_rate')
    expect(detect(screen, { repeatedManualCorrections: 1 })).toContain('high_correction_rate')
    expect(detect(screen, { repeatedManualCorrections: 0 })).not.toContain('high_correction_rate')
    expect(detect(screen, {})).not.toContain('high_correction_rate')
  })

  it('single_active_seat exige UN seul actif, pas un ratio d’adoption bas', () => {
    // L'ancienne détection se déclenchait à `teamAdoption < 0.5` : trois actifs
    // sur huit s'entendaient dire « un seul utilisateur actif », ce qui est
    // faux. Un ratio proche n'est pas la mesure.
    const screen = screenOf('single_active_seat')
    expect(detect(screen, { paidSeats: 6, activeSeats: 1 })).toContain('single_active_seat')
    expect(detect(screen, { paidSeats: 8, activeSeats: 3 })).not.toContain('single_active_seat')
    // Un seul siège ET un seul actif : c'est un espace mono-utilisateur, pas un
    // gâchis de sièges.
    expect(detect(screen, { paidSeats: 1, activeSeats: 1 })).not.toContain('single_active_seat')
  })

  it('credits_expiring exige les DEUX moitiés : peu consommé ET cycle qui se termine', () => {
    // L'ancienne détection ne lisait que la consommation : elle se déclenchait
    // le 2 du mois, quand il reste vingt-huit jours pour dépenser.
    const screen = screenOf('credits_expiring')
    const idle = { ...HEALTHY, consumption: 0.1 }
    expect(detect(screen, { daysUntilCreditCycleEnds: 3 }, idle)).toContain('credits_expiring')
    expect(detect(screen, { daysUntilCreditCycleEnds: 25 }, idle)).not.toContain('credits_expiring')
    expect(detect(screen, {}, idle)).not.toContain('credits_expiring')
    // Presque tout consommé : il n'y a rien à sauver.
    expect(detect(screen, { daysUntilCreditCycleEnds: 3 }, { ...HEALTHY, consumption: 0.95 })).not.toContain(
      'credits_expiring',
    )
  })

  it('no_connection_7_days parle au RETOUR, et se referme tout seul', () => {
    const screen = screenOf('no_connection_7_days')
    expect(detect(screen, { daysAwayBeforeThisVisit: 21 })).toContain('no_connection_7_days')
    // Le lendemain, `previous_seen_at` a avancé : l'écart retombe, et le brief
    // de reprise ne se propose pas deux jours de suite.
    expect(detect(screen, { daysAwayBeforeThisVisit: 1 })).not.toContain('no_connection_7_days')
    expect(detect(screen, {})).not.toContain('no_connection_7_days')
  })

  it('trial_ending ne parle ni trop tôt, ni après coup', () => {
    const screen = screenOf('trial_ending')
    expect(detect(screen, { daysUntilTrialEnds: 3 })).toContain('trial_ending')
    expect(detect(screen, { daysUntilTrialEnds: 0 })).toContain('trial_ending')
    expect(detect(screen, { daysUntilTrialEnds: 12 })).not.toContain('trial_ending')
    // Essai déjà terminé : ce n'est plus « en parler avant de décider ».
    expect(detect(screen, { daysUntilTrialEnds: -2 })).not.toContain('trial_ending')
  })

  it('les jalons d’adoption comptent l’âge du COMPTE de la personne', () => {
    // L'âge de l'ESPACE ferait dire « ton copilote t'attend depuis dix jours » à
    // quelqu'un invité ce matin dans un espace ouvert l'an dernier.
    expect(detect(screenOf('copilot_never_used'), { copilotMessages: 0, accountAgeDays: 30 })).toContain(
      'copilot_never_used',
    )
    expect(detect(screenOf('copilot_never_used'), { copilotMessages: 0, accountAgeDays: 2 })).not.toContain(
      'copilot_never_used',
    )
    expect(detect(screenOf('no_routine_enabled'), { enabledRoutines: 0, accountAgeDays: 30 })).toContain(
      'no_routine_enabled',
    )
    expect(detect(screenOf('no_routine_enabled'), { enabledRoutines: 0, accountAgeDays: 3 })).not.toContain(
      'no_routine_enabled',
    )
  })

  it('notifications_all_off ne parle que quand TOUT est coupé', () => {
    const screen = screenOf('notifications_all_off')
    expect(detect(screen, { enabledNotificationChannels: 0 })).toContain('notifications_all_off')
    expect(detect(screen, { enabledNotificationChannels: 1 })).not.toContain('notifications_all_off')
    expect(detect(screen, {})).not.toContain('notifications_all_off')
  })

  it('accounts_without_next_action attend PLUSIEURS comptes sans suite', () => {
    const screen = screenOf('accounts_without_next_action')
    expect(detect(screen, { accountsWithoutNextAction: 5 })).toContain('accounts_without_next_action')
    // Un seul compte sans suite est une respiration, pas une habitude.
    expect(detect(screen, { accountsWithoutNextAction: 1 })).not.toContain('accounts_without_next_action')
  })

  it('no_action_14_days lit ZÉRO action, et non « peu d’actions »', () => {
    const screen = screenOf('no_action_14_days')
    expect(detect(screen, {}, { ...HEALTHY, activation: 0 })).toContain('no_action_14_days')
    expect(detect(screen, {}, { ...HEALTHY, activation: 0.05 })).not.toContain('no_action_14_days')
    expect(detect(screen, {}, { ...HEALTHY, activation: null })).not.toContain('no_action_14_days')
  })

  it('mission_ending_no_plan LIT l’alerte du balayeur au lieu de la recalculer', () => {
    const screen = screenOf('mission_ending_no_plan')
    expect(detect(screen, { openRenewalRisks: 2 })).toContain('mission_ending_no_plan')
    expect(detect(screen, { openRenewalRisks: 0 })).not.toContain('mission_ending_no_plan')
  })

  /* #1937.4 — « Laura peut signaler une incohérence ».
   *
   * Le premier détecteur du catalogue qui ne lit pas un MANQUE mais une
   * CONTRADICTION : deux faits saisis par la même ESN sur la même ligne, et
   * qui ne peuvent pas être vrais ensemble. Les trois assertions tiennent la
   * distinction, parce que c'est elle qu'un raccourci ferait perdre — compter
   * les missions en retard « quelle que soit leur date » rendrait une mission
   * sans échéance connue contradictoire avec elle-même, ce qu'elle n'est pas.
   */
  it('mission_active_past_end_date se déclenche sur une CONTRADICTION, jamais sur un manque', () => {
    const screen = screenOf('mission_active_past_end_date')
    expect(detect(screen, { activeMissionsPastEndDate: 1 })).toContain('mission_active_past_end_date')
    expect(detect(screen, { activeMissionsPastEndDate: 3 })).toContain('mission_active_past_end_date')
    // Zéro MESURÉ : les deux faits concordent partout, il n'y a rien à signaler.
    expect(detect(screen, { activeMissionsPastEndDate: 0 })).not.toContain('mission_active_past_end_date')
    // Non mesuré n'est pas « aucune contradiction » — et ne déclenche rien non
    // plus : Laura ne signale pas une incohérence qu'elle n'a pas constatée.
    expect(detect(screen, { activeMissionsPastEndDate: null })).not.toContain('mission_active_past_end_date')
    expect(detect(screen, {})).not.toContain('mission_active_past_end_date')
  })

  it('mission_active_past_end_date ne parle QUE du tableau des missions', () => {
    // Le témoin voisin légitime : la même mesure sur un autre écran ne dit
    // rien. Sans cette borne, la contradiction s'afficherait sur six écrans à
    // la fois, et la règle « une intervention par écran » n'aurait plus rien à
    // arbitrer.
    expect(detect('/pilotage', { activeMissionsPastEndDate: 4 })).toEqual([])
    expect(detect('/dashboard', { activeMissionsPastEndDate: 4 })).not.toContain('mission_active_past_end_date')
  })

  /* #2409.8 / #2409.9 — le DÉMARRAGE d'une mission, par le détecteur existant
   * (tranché sans Louis, décision §12 : pas de second mécanisme). */
  it('mission_start_not_ready se déclenche sur une mission proche du démarrage et incomplète', () => {
    const screen = screenOf('mission_start_not_ready')
    expect(screen).toBe('/missions')
    expect(detect(screen, { missionsStartingSoonNotReady: 1 })).toContain('mission_start_not_ready')
    expect(detect(screen, { missionsStartingSoonNotReady: 0 })).not.toContain('mission_start_not_ready')
    // Non mesuré ne déclenche rien : Laura n'annonce pas un manque qu'elle n'a pas lu.
    expect(detect(screen, { missionsStartingSoonNotReady: null })).not.toContain('mission_start_not_ready')
    expect(detect('/dashboard', { missionsStartingSoonNotReady: 3 })).not.toContain('mission_start_not_ready')
  })

  it('mission_day_one_unconfirmed se déclenche sur une arrivée du jour 1 non confirmée, sur SA mesure', () => {
    const screen = screenOf('mission_day_one_unconfirmed')
    expect(detect(screen, { missionsStartedUnconfirmed: 1 })).toContain('mission_day_one_unconfirmed')
    expect(detect(screen, { missionsStartedUnconfirmed: 0 })).not.toContain('mission_day_one_unconfirmed')
    expect(detect(screen, { missionsStartedUnconfirmed: null })).not.toContain('mission_day_one_unconfirmed')
    // La mesure voisine ne la déclenche pas : préparer n'est pas arriver.
    expect(detect(screen, { missionsStartingSoonNotReady: 2 })).not.toContain('mission_day_one_unconfirmed')
  })

  it('margin_not_measured exige des missions EN COURS et aucun coût saisi', () => {
    const screen = screenOf('margin_not_measured')
    expect(detect(screen, { activeMissions: 3, activeMissionsWithCost: 0 })).toContain('margin_not_measured')
    expect(detect(screen, { activeMissions: 3, activeMissionsWithCost: 1 })).not.toContain('margin_not_measured')
    expect(detect(screen, { activeMissions: 0, activeMissionsWithCost: 0 })).not.toContain('margin_not_measured')
  })

  it('needs_without_matching attend TROIS besoins ouverts', () => {
    const screen = screenOf('needs_without_matching')
    expect(detect(screen, { openNeeds: 3, shortlists: 0 })).toContain('needs_without_matching')
    expect(detect(screen, { openNeeds: 2, shortlists: 0 })).not.toContain('needs_without_matching')
    expect(detect(screen, { openNeeds: 5, shortlists: 1 })).not.toContain('needs_without_matching')
  })

  it('need_open_without_shortlist compte des besoins QUI TRAÎNENT, pas l’absence d’usage', () => {
    // Son voisin `needs_without_matching` dit « tu n'as jamais composé de
    // sélection » (adoption) ; celui-ci dit « CE besoin-là traîne » (valeur
    // métier). La distinction porte : le premier se tait sur un espace sain,
    // parce que le budget d'adoption l'écarte, et le second doit passer.
    const screen = screenOf('need_open_without_shortlist')
    expect(detect(screen, { needsOpenWithoutShortlist: 1 })).toContain('need_open_without_shortlist')
    expect(detect(screen, { needsOpenWithoutShortlist: 0 })).not.toContain('need_open_without_shortlist')
    // Non mesuré : un espace dont on n'a pas pu lire les besoins n'a pas de
    // besoin qui traîne — il a des besoins dont on ne sait rien.
    expect(detect(screen, {})).not.toContain('need_open_without_shortlist')
  })

  it('timesheet_missing_after_reminders lit le COMPTEUR de relances, pas l’absence de relevé', () => {
    // Son voisin `missions_without_timesheet` dit « aucun relevé n'a jamais été
    // saisi » ; celui-ci lit `mission_timesheets.reminders_sent`, la colonne que
    // `TimesheetsService.recordReminder` incrémente. Sans elle, on aurait
    // annoncé « après deux relances » sans savoir si une seule était partie.
    const screen = screenOf('timesheet_missing_after_reminders')
    expect(detect(screen, { timesheetsMissingAfterReminders: 1 })).toContain('timesheet_missing_after_reminders')
    expect(detect(screen, { timesheetsMissingAfterReminders: 0 })).not.toContain('timesheet_missing_after_reminders')
    expect(detect(screen, {})).not.toContain('timesheet_missing_after_reminders')
  })

  it('payment_overdue_30_days ne compte que des retards MESURÉS', () => {
    // Une facture sans échéance connue n'est pas en retard : `due_on IS NULL`
    // se lit « on ne sait pas », et la sonde l'écarte. Ici on vérifie l'autre
    // moitié : sans mesure du tout, la bulle se tait.
    const screen = screenOf('payment_overdue_30_days')
    expect(detect(screen, { invoicesOverdueBeyondGrace: 1 })).toContain('payment_overdue_30_days')
    expect(detect(screen, { invoicesOverdueBeyondGrace: 0 })).not.toContain('payment_overdue_30_days')
    expect(detect(screen, {})).not.toContain('payment_overdue_30_days')
  })

  it('pipeline_runs_dry distingue « le pipe se vide » de « personne ne date ses affaires »', () => {
    // La mesure est la DISTANCE à la clôture espérée la plus lointaine. Un
    // espace qui ne saisit aucune date rend `null` — et `null` ne déclenche
    // rien : une date non renseignée n'est pas un pipe vide, c'est un pipe
    // qu'on ne sait pas lire. Sans cette distinction, la bulle annoncerait la
    // tension à toute ESN qui ne remplit pas ce champ.
    const screen = screenOf('pipeline_runs_dry')
    expect(detect(screen, { pipelineCoverageDays: 42 })).toContain('pipeline_runs_dry')
    expect(detect(screen, { pipelineCoverageDays: 90 })).not.toContain('pipeline_runs_dry')
    expect(detect(screen, {})).not.toContain('pipeline_runs_dry')
    // Toutes les clôtures espérées sont derrière nous : le pipe est déjà vide,
    // et c'est le cas le plus fort, pas un cas à écarter.
    expect(detect(screen, { pipelineCoverageDays: -9 })).toContain('pipeline_runs_dry')
  })

  it('consultant_repeat_placement compte des PLACEMENTS chez le MÊME compte', () => {
    // La mesure est un couple (consultant, compte), pas un total de placements :
    // quelqu'un placé une fois chez trois clients différents n'ouvre aucune
    // porte particulière, et c'est exactement ce que la bulle prétend voir.
    const screen = screenOf('consultant_repeat_placement')
    expect(detect(screen, { consultantsPlacedThriceAtSameAccount: 1 })).toContain('consultant_repeat_placement')
    expect(detect(screen, { consultantsPlacedThriceAtSameAccount: 0 })).not.toContain('consultant_repeat_placement')
    // Une ESN qui ne renseigne pas ses affectations n'a personne de placé trois
    // fois : elle a un historique dont on ne sait rien.
    expect(detect(screen, {})).not.toContain('consultant_repeat_placement')
  })

  it('crm_not_connected attend DIX comptes analysés', () => {
    const screen = screenOf('crm_not_connected')
    expect(detect(screen, { accounts: 10, crmConnections: 0 })).toContain('crm_not_connected')
    expect(detect(screen, { accounts: 4, crmConnections: 0 })).not.toContain('crm_not_connected')
    expect(detect(screen, { accounts: 40, crmConnections: 1 })).not.toContain('crm_not_connected')
  })

  it('no_skills_dossier exige des consultants ET aucun dossier produit', () => {
    const screen = screenOf('no_skills_dossier')
    expect(detect(screen, { consultants: 8, skillsDossiers: 0 })).toContain('no_skills_dossier')
    expect(detect(screen, { consultants: 8, skillsDossiers: 2 })).not.toContain('no_skills_dossier')
    expect(detect(screen, { consultants: 0, skillsDossiers: 0 })).not.toContain('no_skills_dossier')
  })

  it('mission_ended_without_feedback et rfp_deadline_gaps se taisent sur zéro', () => {
    expect(detect(screenOf('mission_ended_without_feedback'), { endedMissionsWithoutFeedback: 2 })).toContain(
      'mission_ended_without_feedback',
    )
    expect(detect(screenOf('mission_ended_without_feedback'), { endedMissionsWithoutFeedback: 0 })).not.toContain(
      'mission_ended_without_feedback',
    )
    expect(detect(screenOf('rfp_deadline_gaps'), { rfpsDueWithGaps: 1 })).toContain('rfp_deadline_gaps')
    expect(detect(screenOf('rfp_deadline_gaps'), { rfpsDueWithGaps: 0 })).not.toContain('rfp_deadline_gaps')
  })

  it('week_one_recap attend la fenêtre ET une action réellement préparée', () => {
    const screen = screenOf('week_one_recap')
    const busy = { ...HEALTHY, activation: 0.3 }
    expect(detect(screen, { accountAgeDays: 7 }, busy)).toContain('week_one_recap')
    expect(detect(screen, { accountAgeDays: 20 }, busy)).not.toContain('week_one_recap')
    // Sept jours sans la moindre action : ce n'est pas un récapitulatif qu'il
    // faut, et le §5.4 a une autre intervention pour ça.
    expect(detect(screen, { accountAgeDays: 7 }, { ...HEALTHY, activation: 0 })).not.toContain('week_one_recap')
  })
})

describe('/briefing dit la relance due que son en-tête compte (#3398)', () => {
  // Recette prod Y8 02/10 : « 1 tâche en retard » visible sur /briefing, aucune
  // bulle de Laura. `follow_up_overdue` ne vivait que sur /actions et /chat.
  it('une tâche de compte en retard fait parler Laura sur /briefing, et seulement elle', () => {
    expect(BRIEFING_SIGNAL_KEYS).toEqual(['follow_up_overdue'])
    expect(detect(BRIEFING_SCREEN, { accountTasksOverdue: 1 })).toEqual(['follow_up_overdue'])
  })

  it('⚠️ SAIT DIRE NON — aucune tâche en retard, ou mesure absente : silence', () => {
    expect(detect(BRIEFING_SCREEN, { accountTasksOverdue: 0 })).toEqual([])
    expect(detect(BRIEFING_SCREEN, {})).toEqual([])
  })

  it('la sonde lit la mesure de la relance due sur /briefing, en plus de celles de ses interventions', () => {
    // Théo A today-jour (863f9d9d0) : « Tableau de bord » retiré, ses interventions vivent sur /briefing — la
    // relance due (#3398) s'AJOUTE à leurs mesures, elle ne les remplace pas.
    const needed = countsNeededForScreen(BRIEFING_SCREEN)
    expect(needed).toContain('accountTasksOverdue')
    expect(needed.filter(name => name === 'accountTasksOverdue')).toHaveLength(1)
  })
})

describe('une intervention ne se pose que sur SON écran', () => {
  it('ne sort pas une clé sur l’écran d’à côté', () => {
    // Sans ce filtre, la règle « une par écran » du §5.3 se contenterait de la
    // première page ouverte, et Laura parlerait des connecteurs sur l'écran de
    // facturation.
    expect(detect('/billing', { consultants: 0 })).toEqual([])
    expect(detect(screenOf('empty_talent_pool'), { consultants: 0 })).toEqual(['empty_talent_pool'])
  })

  it('rend une liste vide sur un écran que le catalogue ne couvre pas', () => {
    expect(detect('/journal', { consultants: 0 })).toEqual([])
    expect(countsNeededForScreen('/journal')).toEqual([])
  })
})

describe('un écran PARAMÉTRÉ — le dossier de compte ouvert', () => {
  const DOSSIER = '/accounts/8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'

  it('reconnaît un dossier, et RIEN d’autre', () => {
    expect(matchesScreen(ACCOUNT_CONTEXT_SCREEN, DOSSIER)).toBe(true)
    // La LISTE n'est pas un dossier : l'y faire passer poserait la bulle là où
    // le compte dont elle parle n'est même pas ouvert.
    expect(matchesScreen(ACCOUNT_CONTEXT_SCREEN, '/accounts')).toBe(false)
    // Un SOUS-écran non plus : le catalogue ne l'a jamais nommé.
    expect(matchesScreen(ACCOUNT_CONTEXT_SCREEN, `${DOSSIER}/contacts`)).toBe(false)
    // Un segment VIDE ne remplit pas un paramètre.
    expect(matchesScreen(ACCOUNT_CONTEXT_SCREEN, '/accounts/')).toBe(false)
    // Un autre module n'emprunte pas le motif.
    expect(matchesScreen(ACCOUNT_CONTEXT_SCREEN, '/consultants/abc')).toBe(false)
  })

  it('laisse les trente-cinq chemins LITTÉRAUX se comparer par égalité', () => {
    // La règle ajoutée ne doit rien élargir de ce qui existait : un chemin sans
    // `/:` ne peut couvrir que lui-même.
    expect(matchesScreen('/accounts', '/accounts')).toBe(true)
    expect(matchesScreen('/accounts', '/accounts/abc')).toBe(false)
    expect(matchesScreen('/settings/integrations', '/settings')).toBe(false)
  })

  it('se tait quand le dossier n’est pas nommé — c’est ce qui laisse la place au panneau', () => {
    // La carte de coin (`LauraCard`, montée dans `__root.tsx`) demande son plan
    // sur le MÊME chemin, mais elle ne connaît aucun compte : elle ne trouve
    // aucune candidate, donc le service rend `nothing_to_say` AVANT d'écrire la
    // moindre trace, et le budget du jour reste intact pour le panneau.
    expect(detect(DOSSIER, { consultantsAvailableNow: 3, consultantsAvailabilityUndeclared: 0 })).toEqual([])
  })

  it('se tait quand le dossier n’a AUCUN signal de recrutement', () => {
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: { consultantsAvailableNow: 3, consultantsAvailabilityUndeclared: 0 },
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [] },
      }),
    ).toEqual([])
  })

  it('se tait quand le vivier n’a personne de DÉCLARÉ disponible', () => {
    // Zéro déclaré est un fait, et ce fait ne déclenche rien : proposer un
    // profil qu'on n'a pas serait exactement la donnée inventée qu'on refuse.
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: { consultantsAvailableNow: 0, consultantsAvailabilityUndeclared: 12 },
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [HIRING] },
      }),
    ).toEqual([])
  })

  it('se tait quand le vivier n’a pas pu être LU — un `null` ne conclut jamais', () => {
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: { consultantsAvailableNow: null, consultantsAvailabilityUndeclared: null },
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [HIRING] },
      }),
    ).toEqual([])
  })

  it('parle quand les DEUX moitiés sont vraies', () => {
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: { consultantsAvailableNow: 1, consultantsAvailabilityUndeclared: 4 },
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [HIRING] },
      }),
    ).toEqual([ACCOUNT_HIRING_INTERVENTION_KEY])
  })

  // #3939.3 — la douleur sourcée et DATÉE du dossier : sans vivier à croiser.
  const PAIN_FACTS = [
    {
      kind: 'pain_hypothesis' as const,
      statement: 'Arbitrage budgétaire',
      source: null,
      observedOn: null,
      count: null,
    },
    { kind: 'pain_signal' as const, statement: 'Plan annoncé', source: null, observedOn: '2026-07', count: null },
  ]

  it('#3939.3 parle d’une douleur fondée et datée, même sans vivier mesuré', () => {
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: {},
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [], painFacts: PAIN_FACTS },
      }),
    ).toEqual([ACCOUNT_PAIN_INTERVENTION_KEY])
  })

  it('#3939.3 se tait sans douleur fondée — et ailleurs que sur le dossier', () => {
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: {},
        screen: DOSSIER,
        account: { accountId: 'x', hiringSignals: [], painFacts: [] },
      }),
    ).toEqual([])
    expect(
      detectInterventions({
        health: HEALTHY,
        blockingIssues: [],
        counts: {},
        screen: '/accounts',
        account: { accountId: 'x', hiringSignals: [], painFacts: PAIN_FACTS },
      }),
    ).not.toContain(ACCOUNT_PAIN_INTERVENTION_KEY)
  })

  it('demande les deux mesures du vivier sur cet écran, et rien de plus', () => {
    expect(new Set(countsNeededForScreen(DOSSIER))).toEqual(
      new Set(['consultantsAvailableNow', 'consultantsAvailabilityUndeclared']),
    )
    // Et rien sur la LISTE : les détecteurs de `/accounts` n'ont pas changé.
    expect(countsNeededForScreen('/accounts')).not.toContain('consultantsAvailableNow')
  })
})

describe('la sonde ne lit que ce dont l’écran a besoin', () => {
  it.each(SCREENS)('%s : la liste demandée est EXACTEMENT ce que ses détecteurs exigent', screen => {
    // La liste est dérivée de la table des détecteurs. Si elle divergeait, la
    // divergence serait SILENCIEUSE : une mesure non lue vaut `null`, et un
    // `null` ne déclenche rien — le détecteur mourrait sans un test rouge.
    const required = new Set(
      INTERVENTION_DETECTORS.filter(
        // #3398 — /chat sert aussi les signaux métier (`laura-chat-signals.ts`).
        detector =>
          screenOf(detector.key) === screen ||
          (screen === CHAT_SCREEN && CHAT_SIGNAL_KEYS.includes(detector.key)) ||
          // #3398 — /briefing sert aussi la relance due que son en-tête compte.
          (screen === BRIEFING_SCREEN && BRIEFING_SIGNAL_KEYS.includes(detector.key)),
      ).flatMap(detector => detector.requires),
    )
    expect(new Set(countsNeededForScreen(screen))).toEqual(required)
  })

  it.each(SCREENS)('%s ne paie jamais le catalogue entier', screen => {
    // Le garde-fou de coût : une navigation ne doit pas payer les vingt-six
    // mesures. Cinq est le maximum réel aujourd'hui (`/consultants`, qui porte
    // quatre interventions) ; le franchir veut dire qu'un écran est devenu trop
    // bavard, et c'est une décision produit, pas un ajustement de seuil.
    // #3398 (tranché sans Louis) — /chat est la seule exception : il sert les
    // onze signaux métier d'un rôle (une lecture COUNT par signal, en parallèle,
    // une fois par jour et par écran — `screensServed`). Sa borne est écrite,
    // pas supprimée : la franchir reste une décision produit.
    // #3398 (X13, tranché sans Louis) : 16 → 18 — deux signaux de plus (disponibilité
    // périmée, relance due), deux COUNT de plus ; les deux vivent sur /projects/needs
    // et /actions, jamais sur /consultants (déjà à 5).
    // #3398 (F27, tranché sans Louis) : 19 → 23 — quatre signaux de rôle de plus (sans
    // responsable, collisions, portefeuille trop large, fiches à qualifier), quatre COUNT.
    // #3398 (lot R12 07/10, tranché sans Louis) : 23 → 24 — un signal de plus
    // (information terrain non enregistrée : appels sans débrief), un COUNT de plus.
    // #2875/#3398 (lot B3 15/10, forecast fondateur : UN COUNT, pas les sept lectures du prévisionnel) : 25 → 26.
    // #2875/#3398 (lot T06 08/10, tranché sans Louis) : 24 → 25 — un signal de plus
    // (entretien à préparer : brief non consulté), un COUNT de plus.
    expect(countsNeededForScreen(screen).length).toBeLessThanOrEqual(screen === CHAT_SCREEN ? 26 : 5)
  })

  it('lit un corpus NON VIDE — une garde qui ne lit rien passe au vert pour toujours', () => {
    expect(SCREENS.length).toBeGreaterThanOrEqual(10)
    expect(INTERVENTION_DETECTORS.filter(detector => detector.requires.length > 0).length).toBeGreaterThanOrEqual(15)
  })
})

/* ------------------------------------------------------------------ */
/*  §13.3 — les trois moments d'or                                     */
/* ------------------------------------------------------------------ */

function goldenMoment(counts: DetectionCounts = {}, blocking: string[] | null = []) {
  return detectGoldenMoment({ counts, blockingIssues: blocking })
}

describe('les moments d’or — leur DÉTECTION, côté serveur', () => {
  it('un espace ordinaire n’en a aucun', () => {
    expect(goldenMoment(PLENTY)).toBeNull()
  })

  it('un retour d’absence de plus de cinq jours en est un', () => {
    expect(goldenMoment({ daysAwayBeforeThisVisit: RETURN_FROM_ABSENCE_DAYS + 1 })).toBe('return_from_absence')
    // « > 5 » : cinq pile ne suffit pas.
    expect(goldenMoment({ daysAwayBeforeThisVisit: RETURN_FROM_ABSENCE_DAYS })).toBeNull()
  })

  it('la fin d’une action longue en est un, tant qu’elle est FRAÎCHE', () => {
    expect(goldenMoment({ minutesSinceLongActionFinished: 2 })).toBe('long_action_finished')
    expect(goldenMoment({ minutesSinceLongActionFinished: LONG_ACTION_FRESH_MINUTES + 1 })).toBeNull()
  })

  it('un blocage réel en est un', () => {
    expect(goldenMoment({}, ['La connexion à ton CRM a expiré.'])).toBe('real_blocker')
  })

  it('une mesure NON LUE n’ouvre aucune dérogation', () => {
    // « Je n'ai pas pu regarder » ne vaut ni « il revient de trois semaines »
    // ni « tout va bien » : ça ne déclenche rien, comme partout ailleurs.
    expect(goldenMoment({ daysAwayBeforeThisVisit: null, minutesSinceLongActionFinished: null }, null)).toBeNull()
  })

  it('le blocage passe devant, puis l’action finie, puis le retour', () => {
    // Un seul moment est rendu, et l'ordre est celui du coût du silence : un
    // blocage coûte de l'argent maintenant, un résultat attendu coûte une
    // attente, un retour d'absence coûte un rattrapage qui peut suivre.
    expect(
      goldenMoment({ daysAwayBeforeThisVisit: 30, minutesSinceLongActionFinished: 1 }, [
        'La connexion à ton CRM a expiré.',
      ]),
    ).toBe('real_blocker')
    expect(goldenMoment({ daysAwayBeforeThisVisit: 30, minutesSinceLongActionFinished: 1 })).toBe(
      'long_action_finished',
    )
  })

  it('rend TOUJOURS un moment du contrat, jamais une chaîne inventée', () => {
    const produced = [
      goldenMoment({ daysAwayBeforeThisVisit: 30 }),
      goldenMoment({ minutesSinceLongActionFinished: 1 }),
      goldenMoment({}, ['bloqué']),
    ]
    // Le corpus n'est pas vide : les trois moments sont réellement produits.
    expect(new Set(produced)).toEqual(new Set(GOLDEN_MOMENTS))
    for (const moment of produced) expect(GOLDEN_MOMENTS).toContain(moment)
  })

  it('les mesures du moment d’or sont demandées sur TOUS les écrans', () => {
    // Le moment d'or ne dépend pas de l'écran : il dépend de la personne. Si
    // ces mesures n'étaient demandées que sur l'écran d'un détecteur, la
    // dérogation ne s'ouvrirait que là — et personne ne le verrait, un `null`
    // ne déclenchant rien.
    expect(GOLDEN_MOMENT_COUNTS.length).toBeGreaterThan(0)
    expect([...GOLDEN_MOMENT_COUNTS]).toEqual(
      expect.arrayContaining(['daysAwayBeforeThisVisit', 'minutesSinceLongActionFinished']),
    )
  })

  it.each(SCREENS)('%s : le coût RÉEL d’une navigation reste borné', screen => {
    // ⚠️ Le garde-fou de coût voisin ne mesure que `countsNeededForScreen`, et
    // le contrôleur y AJOUTE les mesures du budget. Sans ce cas, trois lectures
    // de plus par navigation seraient entrées sans qu'aucun compteur ne bouge —
    // une garde qui ne voit plus qu'une partie de son sujet.
    const asked = new Set<string>([...countsNeededForScreen(screen), ...GOLDEN_MOMENT_COUNTS])
    expect(asked.size).toBeGreaterThanOrEqual(GOLDEN_MOMENT_COUNTS.length)
    // #2875/#3398 (lot B3 15/10) : 28 → 29, le forecast fondateur en un COUNT.
    // #3398 (lot R12 07/10, tranché sans Louis) : 27 → 28, même raison que le garde-fou voisin.
    expect(asked.size).toBeLessThanOrEqual(screen === CHAT_SCREEN ? 29 : 8)
  })
})
