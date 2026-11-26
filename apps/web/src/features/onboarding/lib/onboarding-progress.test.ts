import { describe, expect, it } from 'vitest'
import {
  clampProgressRegression,
  computeResultProgress,
  estimateMinutesRemaining,
  ONBOARDING_RESULT_STEPS,
  resultStepStatus,
} from './onboarding-progress'
import { ONBOARDING_ESTIMATED_MINUTES, reconfigurationPlan } from './onboarding-gate'
import type { OnboardingAnswers, OnboardingPrefillMeta } from '@/stores/onboardingStore'

/**
 * #2023.1 — le vocabulaire des sept étapes nommées, exactement dans l'ordre de
 * l'issue (« Ton organisation » … « Ton audit »).
 */
describe('#2023.1/.7 — sept étapes nommées, plus les trois stages', () => {
  it('déclare exactement sept étapes, dans l’ordre du message', () => {
    expect(ONBOARDING_RESULT_STEPS.map(s => s.code)).toEqual([
      'organisation',
      'role',
      'offer',
      'market',
      'system',
      'goals',
      'audit',
    ])
  })
})

/**
 * Les réponses qui remplissent RÉELLEMENT l'étape « Ton organisation », donc
 * les ONZE sous-étapes de `company_info` : entreprise, équipe commerciale,
 * maturité (#2034), santé de l'activité (#2034), effectif réel (#2035), temps
 * réel et charge (#2050), routines (#2051) et les trois écrans d'outillage
 * (#2054). Une fixture figée à trois réponses ne mesurerait plus « toutes les
 * questions » — elle mesurerait celles qui existaient le jour où elle a été
 * écrite, et c'est exactement ce qui s'est produit : trois lots ont ajouté six
 * sous-étapes à `company_info` en parallèle et cette fixture est restée là.
 */
const COMPLETE_COMPANY_ANSWERS: OnboardingAnswers = {
  esn_name: 'Kicklox',
  consultant_size: '10-30',
  sales_team_size: '2-3 personnes',
  esn_maturity_situation: 'Croissance',
  company_growth_goal: 'Ouvrir un nouveau territoire',
  active_clients_band: '6 à 15 clients actifs',
  revenue_recurrence: 'Un mix de récurrent et de one-shot',
  client_concentration_risk: "Le chiffre d'affaires est réparti, aucun client dominant",
  consultants_managed_by_user_band: '6 à 15 consultants',
  available_consultants_band: 'Quelques consultants disponibles en intercontrat',
  // #2035.1 / #2035.2 — deux clés de plus (`optional: true`, mais comptées ici
  // comme tout le reste de cette fiche « complète »).
  consultant_size_group_band: '200-500',
  consultant_size_business_unit_band: '10-30',
  // Lot #2046/#2047 — six sous-étapes de plus dans `company_info` : sans ces
  // vingt-cinq clés, la fiche « complète » ne l'est plus.
  talent_pool_identified_band: '6-15',
  talent_pool_qualified_band: '1-5',
  talent_pool_available_band: '1-5',
  talent_pool_availability_recency_band: 'Ce mois-ci',
  talent_pool_avg_tjm_band: '550-700',
  talent_pool_mobility_band: 'Mobiles en France',
  talent_pool_consent_status: 'partiel',
  talent_pool_other_processes_band: 'Quelques-uns',
  talent_pool_engagement_reality_band: 'Une partie seulement',
  talent_pool_revalidation_frequency: 'mensuelle',
  talent_pool_state_interested_band: '6-15',
  talent_pool_state_available_band: '1-5',
  talent_pool_state_secured_band: '1-5',
  talent_pool_state_presentable_band: '0',
  client_base_missions_ongoing_band: '1-5',
  client_base_missions_completed_band: '6-15',
  client_base_renewals_band: 'quelques_uns',
  client_base_satisfaction_band: 'mesuree_bonne',
  client_base_referrals_band: 'quelques_unes',
  client_base_rex_band: 'parfois',
  client_base_case_studies_band: '1-5',
  client_base_cross_sell_band: 'tente_occasionnellement',
  client_base_deadlines_band: 'quelques_unes',
  client_base_followup_regularity: 'regulier',
  client_base_followup_owner: 'Le commercial du compte',
  // Lot L19 (#2050, #2051) — le temps réel, la charge concurrente et la
  // continuité des dossiers : trois sous-étapes de plus dans `company_info`.
  weekly_sales_time_declared: '5 à 10 heures par semaine',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  weekly_sales_time_residual: 'Moins de 2 heures par semaine',
  competing_workloads: ['Le delivery et le suivi des consultants en poste'],
  workload_variability: 'Elle varie selon les semaines, mais de façon prévisible',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
  dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  // Lot G4 (#2054) — la chaîne d'outillage : trois sous-étapes de plus dans
  // `company_info`. Les valeurs sont celles du catalogue
  // (`TOOLING_PRESENCE_SCALE` et ses voisines) : un test qui invente sa donnée
  // d'entrée ne garde rien.
  tooling_crm: 'Mon équipe commerciale',
  tooling_ats: "Nous n'avons pas cet outil",
  tooling_erp: "Toute l'ESN",
  tooling_mailbox: 'Moi seul',
  tooling_calendar: 'Moi seul',
  tooling_drive: "Toute l'ESN",
  tooling_spreadsheet: 'Mon équipe commerciale',
  tooling_enrichment: "Nous n'avons pas cet outil",
  tooling_sourcing_platform: 'Je ne sais pas',
  tooling_bi: "Nous n'avons pas cet outil",
  tooling_personal_notes: 'Moi seul',
  tooling_reference: 'Le CRM',
  tooling_reference_data: ['Les comptes et leurs interlocuteurs'],
  tooling_reference_freshness: 'Mise à jour il y a moins d’une semaine',
  tooling_reference_confidence: 'Je vérifie les points importants',
  tooling_reference_export: 'Oui, je peux exporter moi-même',
  tooling_duplicates: 'Oui, entre deux outils',
  tooling_pain: 'Je ressaisis les mêmes contacts à trois endroits',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — la sous-étape `implantation`,
  // ajoutée en fin de `company_info`.
  company_locations: ['Paris (siège)'],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — la sous-étape
  // `chiffre-affaires`, ajoutée en fin de `company_info`. Optionnelles
  // (#2059.7) mais `validate`/`isAnswered` ne les dispense pas ici (même
  // règle que `heard_about_bellum` ailleurs) : cette fiche « complète » les
  // renseigne toutes les TROIS.
  consultant_count: '7',
  annual_revenue_amount: '620000',
  annual_revenue_period: 'Dernier exercice clos',
}

/**
 * #2023.1/#2012 — l'état d'une étape vient des RÉPONSES, pas d'un index. Le
 * défaut documenté (`done = i < currentStageIndex`) est un test qui SAIT dire
 * NON : une étape jamais commencée doit rester `not_started` même si un index
 * naïf la déclarerait faite.
 */
describe('#2023.1 — le statut d’une étape se lit sur les réponses', () => {
  const organisation = ONBOARDING_RESULT_STEPS[0]

  it('not_started quand aucune question de l’étape n’a de réponse', () => {
    expect(resultStepStatus(organisation, {})).toBe('not_started')
  })

  it('in_progress quand certaines réponses existent, pas toutes', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' }
    expect(resultStepStatus(organisation, answers)).toBe('in_progress')
  })

  it('done seulement quand TOUTES les questions de l’étape (ses onze sous-étapes) sont répondues', () => {
    expect(resultStepStatus(organisation, COMPLETE_COMPANY_ANSWERS)).toBe('done')
  })

  it('retombe à in_progress dès qu’UNE des sous-étapes reste sans réponse', () => {
    // Le témoin qui empêche la ligne ci-dessus d'être une tautologie : le stage
    // `company_info` a gagné trois sous-étapes (maturité, santé de l'activité,
    // effectif réel), et une seule réponse manquante doit suffire à retirer le
    // « done ».
    // #2626.1 — depuis que les 125 questions non exigées sont reposées au
    // Temps 2, `company_info` ne pose plus que `esn_name` et `consultant_size`.
    // Le témoin reste le même : UNE réponse manquante retire le « done ».
    const partial: OnboardingAnswers = { ...COMPLETE_COMPANY_ANSWERS }
    delete partial['consultant_size']
    expect(resultStepStatus(organisation, partial)).toBe('in_progress')
  })

  it('reste not_started pour une étape sans question Temps-1 câblée (système)', () => {
    // #2018.2/.4 ont câblé `role` et `goals` (`stageCodes` non vides
    // désormais) — `system` reste le témoin d'une étape non commencée.
    const system = ONBOARDING_RESULT_STEPS.find(s => s.code === 'system')!
    // Casse volontairement : même avec des réponses quelque part, une étape
    // sans `stageCodes` ne peut pas devenir "done" — sinon on affiche un
    // résultat qu'aucune question ne mesure.
    const answers: OnboardingAnswers = { esn_name: 'Kicklox', consultant_size: '10-30' }
    expect(resultStepStatus(system, answers)).toBe('not_started')
  })

  it('#2018.2 — « Ton rôle » lit désormais de vraies réponses (user_role, portfolio_size, role_tenure, industry_tenure)', () => {
    const role = ONBOARDING_RESULT_STEPS.find(s => s.code === 'role')!
    // #2626.1 — AUCUNE des questions de « Ton rôle » n'est exigée pour entrer :
    // elles sont toutes reposées au Temps 2. L'étape ne pose donc plus rien au
    // Temps 1 et elle est FRANCHIE — « pas commencée » serait un zéro affiché à
    // la place d'une absence de question. Le témoin qu'elles ne sont pas
    // perdues est `temps2-deferral.test.ts`.
    expect(resultStepStatus(role, {})).toBe('done')
    return
    expect(resultStepStatus(role, { user_role: 'Fondateur / CEO' })).toBe('in_progress')
    // #2018.3 — le portefeuille est posé dans la même étape : sans lui, elle
    // n'est pas terminée.
    expect(
      resultStepStatus(role, {
        user_role: 'Fondateur / CEO',
        role_tenure: '2-5 ans',
        industry_tenure: '5 ans et plus',
      }),
    ).toBe('in_progress')
    expect(
      resultStepStatus(role, {
        user_role: 'Fondateur / CEO',
        portfolio_size: '6-15',
        role_tenure: '2-5 ans',
        industry_tenure: '5 ans et plus',
      }),
    ).toBe('in_progress')
    // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
    // DÉCLARÉ, huit questions de plus dans la même étape : sans elles, elle
    // n'est pas terminée non plus.
    expect(
      resultStepStatus(role, {
        user_role: 'Fondateur / CEO',
        portfolio_size: '6-15',
        role_tenure: '2-5 ans',
        industry_tenure: '5 ans et plus',
        decisions_alone: ['Envoyer une offre commerciale'],
        decisions_to_validate: ['Signer un nouveau compte client'],
        people_managed: ['Des consultants'],
        recruitment_accounts_authority: 'Je dois faire valider',
        staffing_authority: 'Je décide seul',
        margin_billing_authority: "Je n'ai pas cette responsabilité",
        tools_access: ['CRM'],
        invite_authority: 'Je dois faire valider',
      }),
    ).toBe('in_progress')
    // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi », six
    // questions de plus dans la même étape : sans elles, elle n'est pas
    // terminée non plus.
    expect(
      resultStepStatus(role, {
        user_role: 'Fondateur / CEO',
        portfolio_size: '6-15',
        role_tenure: '2-5 ans',
        industry_tenure: '5 ans et plus',
        decisions_alone: ['Envoyer une offre commerciale'],
        decisions_to_validate: ['Signer un nouveau compte client'],
        people_managed: ['Des consultants'],
        recruitment_accounts_authority: 'Je dois faire valider',
        staffing_authority: 'Je décide seul',
        margin_billing_authority: "Je n'ai pas cette responsabilité",
        tools_access: ['CRM'],
        invite_authority: 'Je dois faire valider',
        associates_count: '1 associé',
        recruiters_team_size: 'Aucun recruteur dédié',
        delivery_team_size: '1-5 personnes',
        marketing_team_size: 'Aucune personne dédiée au marketing',
        ops_team_size: '1 personne',
        team_coordination_mode: 'Réunion hebdomadaire formelle',
      }),
    ).toBe('done')
  })

  it('#2018.4 — « Tes objectifs » lit désormais de vraies réponses (individual_goal, monthly_target)', () => {
    const goals = ONBOARDING_RESULT_STEPS.find(s => s.code === 'goals')!
    // #2626.1 — même chose que « Ton rôle » ci-dessus : `individual_goal` et
    // `monthly_target` ne sont pas exigés pour entrer, ils sont reposés au
    // Temps 2. L'étape ne pose plus rien et elle est franchie.
    expect(resultStepStatus(goals, {})).toBe('done')
    return
    expect(resultStepStatus(goals, { individual_goal: 'Ouvrir de nouveaux comptes' })).toBe('in_progress')
    expect(resultStepStatus(goals, { individual_goal: 'Ouvrir de nouveaux comptes', monthly_target: '3-5 RDV' })).toBe(
      'done',
    )
  })

  it('#2060 — la question ouverte FACULTATIVE qui ferme « Tes objectifs » ne bloque jamais « terminé »', () => {
    const goals = ONBOARDING_RESULT_STEPS.find(s => s.code === 'goals')!
    // Les deux questions REQUISES suffisent — `uncovered_activity_note` reste
    // vide, comme une personne qui n'a rien à ajouter.
    expect(resultStepStatus(goals, { individual_goal: 'Ouvrir de nouveaux comptes', monthly_target: '3-5 RDV' })).toBe(
      'done',
    )
    // Et répondre AUSSI à la question ouverte reste `done` — témoin de non-
    // régression sur le chemin où tout est rempli.
    expect(
      resultStepStatus(goals, {
        individual_goal: 'Ouvrir de nouveaux comptes',
        monthly_target: '3-5 RDV',
        uncovered_activity_note: 'Mon associé part dans 6 mois.',
      }),
    ).toBe('done')
  })
})

/**
 * #2088.33 — un prérempli NON confirmé ne compte pas comme une réponse. Tant
 * que `prefillMeta[key]` porte la clé, la valeur affichée n'est qu'une
 * proposition (`applyPrefill` la pose dans `answers` avant tout geste
 * humain) : la doctrine « ce qui n'est pas confirmé ne se compte jamais comme
 * mesuré » (GA-18/GA-19) s'applique ici — la clé sort du DÉNOMINATEUR des
 * réponses, exactement comme `onboarding-review-blocks.ts` le fait déjà côté
 * écran de relecture (`unconfirmedPrefill`). `prefillMeta` est additif et
 * optionnel (défaut `{}`) : les appels à deux arguments ci-dessus restent
 * inchangés.
 */
describe('#2088.33 — un prérempli non confirmé ne compte pas comme une réponse', () => {
  const organisation = ONBOARDING_RESULT_STEPS[0]

  it('reste not_started quand la seule valeur présente est un prérempli jamais touché', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' }
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'registry' } }
    expect(resultStepStatus(organisation, answers, prefillMeta)).toBe('not_started')
  })

  it('redevient in_progress dès que `prefillMeta` ne porte plus la clé (confirmée ou modifiée)', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' }
    expect(resultStepStatus(organisation, answers, {})).toBe('in_progress')
    expect(resultStepStatus(organisation, answers)).toBe('in_progress')
  })

  it('`computeResultProgress` retire du numérateur une clé encore préremplie, jamais du total', () => {
    const withoutPrefill = computeResultProgress(COMPLETE_COMPANY_ANSWERS)
    const prefillMeta: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'registry' } }
    const withPrefill = computeResultProgress(COMPLETE_COMPANY_ANSWERS, prefillMeta)
    expect(withPrefill.total).toBe(withoutPrefill.total)
    expect(withPrefill.answered).toBe(withoutPrefill.answered - 1)
  })

  it('ne confond jamais la CONFIANCE du prérempli avec sa confirmation — même `confidence: high` ne compte pas', () => {
    const answers: OnboardingAnswers = { esn_name: 'Kicklox' }
    const highConfidence: OnboardingPrefillMeta = { esn_name: { confidence: 'high', source: 'pappers' } }
    expect(resultStepStatus(organisation, answers, highConfidence)).toBe('not_started')
  })
})

describe('#2023.4 — progression et estimation par RÉSULTAT, pas par écran', () => {
  it('compte les questions réellement répondues sur le total réel', () => {
    const progress = computeResultProgress({ esn_name: 'Kicklox' })
    expect(progress.answered).toBeGreaterThan(0)
    expect(progress.answered).toBeLessThan(progress.total)
    expect(progress.percent).toBe(Math.round((progress.answered / progress.total) * 100))
  })

  it('estime une durée qui DÉCROÎT quand il reste moins de questions', () => {
    const early = computeResultProgress({})
    const later = computeResultProgress({ esn_name: 'Kicklox', consultant_size: '10-30' })
    const minutesEarly = estimateMinutesRemaining(early)!
    const minutesLater = estimateMinutesRemaining(later)!
    expect(minutesLater).toBeLessThanOrEqual(minutesEarly)
  })

  it('n’affiche aucune durée une fois tout répondu (0 minute n’est pas une estimation)', () => {
    const full = { total: 3, answered: 3, percent: 100 }
    expect(estimateMinutesRemaining(full)).toBeNull()
  })
})

/**
 * #2577.3 — UNE durée, pas deux (GA-26). Mesuré en production : la carte
 * d'accueil (`welcome.refresh.duration`, dérivée de `reconfigurationPlan`
 * dans `onboarding-gate.ts`) annonçait « 5 à 7 minutes » pendant que l'écran
 * suivant (`stepper.minutesRemaining`, ici) annonçait « 28 minutes » pour LE
 * MÊME « il ne reste rien de répondu » — un magic number (25s/question) ici
 * contre la fourchette `ONBOARDING_ESTIMATED_MINUTES` là-bas, jamais la même
 * source. Ce test pince les deux estimations l'une contre l'autre : parties
 * du même « rien n'est répondu », elles doivent tomber dans la MÊME
 * fourchette annoncée plutôt que diverger d'un facteur 4.
 */
describe('#2577.3 — la durée restante et la durée de la carte d’accueil se lisent à la MÊME source', () => {
  it('`estimateMinutesRemaining`, tout vide, tombe dans la fourchette `ONBOARDING_ESTIMATED_MINUTES`', () => {
    const progress = computeResultProgress({})
    const minutes = estimateMinutesRemaining(progress)
    expect(minutes).not.toBeNull()
    expect(minutes as number).toBeGreaterThanOrEqual(ONBOARDING_ESTIMATED_MINUTES.min)
    // +1 : l'arrondi (`Math.ceil`) peut dépasser `max` d'une minute sans que
    // ce soit une seconde source — seulement la même fourchette, arrondie.
    expect(minutes as number).toBeLessThanOrEqual(ONBOARDING_ESTIMATED_MINUTES.max + 1)
  })

  it('ne diverge plus d’un facteur 4 avec la durée de la carte d’accueil, sur le même « rien de répondu »', () => {
    const stepperMinutes = estimateMinutesRemaining(computeResultProgress({}))!
    const refreshRange = reconfigurationPlan(undefined).estimatedMinutes!
    // Avant #2577.3 : ~28 min ici contre ~8-12 min là-bas (facteur ~2,5 à 3,5
    // sur ce jeu de données réel) — la garde tolère un écart de mesure, pas
    // un budget par question indépendant.
    expect(stepperMinutes).toBeLessThanOrEqual(refreshRange.max * 1.5)
  })
})

/**
 * #2023.6 — un agrandissement du dénominateur (branchement adaptatif) ne fait
 * jamais reculer ce qui est affiché. Le test casse le code volontairement en
 * lui donnant un candidat plus BAS que ce qui a déjà été montré.
 */
describe('#2023.6 — la progression ne revient jamais brutalement en arrière', () => {
  it('garde le maximum déjà affiché quand le candidat est plus bas', () => {
    expect(clampProgressRegression(60, 40)).toBe(60)
  })

  it('avance normalement quand le candidat progresse vraiment', () => {
    expect(clampProgressRegression(40, 60)).toBe(60)
  })
})
