import { describe, expect, it } from 'vitest'
import { ESN_COMPANY_ANSWER_KEYS, type EsnAnswers } from '@bellum/contracts'
import { firstPendingSubStep } from './pending-steps'
import { TEMPS1_SUBSTEPS } from './questions'

/**
 * #1671-ter — l'associé ne repose que ce qui reste.
 *
 * Le cas réel : APRICOT LABS, fiche remplie par Adel (propriétaire), Bedros
 * rejoint le 07/09/2026 et se voit reposer les douze questions.
 */

const EMPTY: EsnAnswers = {
  esn_name: null,
  consultant_size: null,
  sales_team_size: null,
  expertise_areas: [],
  positioning: null,
  target_sectors: [],
  target_company_types: [],
  staffing_model: null,
  geo_zones: [],
  remote_and_travel_scope: [],
  zone_capability_status: [],
  main_sales_pain: null,
  offer_domain: null,
  offer_domains: [],
  recruits_for_clients: null,
  // Lot 26 — champs additifs, non pertinents pour ce test.
  service_types: [],
  service_types_proven: [],
  service_types_desired: [],
  reference_sectors: [],
  case_study_results: [],
  reference_accounts: [],
  client_testimonials: [],
  expertise_no_concrete_proof: [],
  expertise_client_reference: [],
  expertise_personal_experience: [],
  expertise_partner: [],
  expertise_talent_pool: [],
  staffing_modes: [],
  profile_validation_methods: [],
  contractual_constraints: [],
  priority_sectors: [],
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée.
  company_locations: [],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — non pertinents pour ce test.
  consultant_count: null,
  annual_revenue_amount: null,
  annual_revenue_period: null,
  // #2640.2 — non pertinent pour ce test.
  esn_website: null,
}

/** Ce que le membre REÇOIT quand la fiche de l'ESN est complète : tout est
 *  rempli, y compris le frein commercial, qui retombe sur celui de l'associé. */
const FICHE_ESN_COMPLETE: EsnAnswers = {
  esn_name: 'Apricot Labs',
  consultant_size: '10-30',
  sales_team_size: '1-3 personnes',
  expertise_areas: ['Data & Intelligence Artificielle'],
  positioning: 'Expertise de niche',
  target_sectors: ['Banque de détail & Banque privée'],
  target_company_types: ['ETI (500-5 000 salariés)'],
  staffing_model: 'Uniquement des CDI internes',
  geo_zones: ['Paris & Île-de-France'],
  remote_and_travel_scope: [],
  zone_capability_status: [],
  main_sales_pain: 'Trouver les bons comptes à cibler',
  offer_domain: 'esn_it',
  offer_domains: ['data_ia'],
  recruits_for_clients: 'no',
  // Lot L15 (#2034, #2035) — trois sous-étapes de plus dans `company_info` :
  // sans ces sept clés, la fiche « complète » ne l'est plus.
  esn_maturity_situation: 'Croissance',
  company_growth_goal: 'Ouvrir un nouveau territoire',
  active_clients_band: '6 à 15 clients actifs',
  revenue_recurrence: 'Un mix de récurrent et de one-shot',
  client_concentration_risk: 'Je ne sais pas encore',
  consultants_managed_by_user_band: '1 à 5 consultants',
  available_consultants_band: 'Quelques consultants disponibles en intercontrat',
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
  // Lot L19 (#2048, #2049) — deux sous-étapes de plus dans `target_market` :
  // sans ces sept clés, la fiche « complète » ne l'est plus. Les valeurs sont
  // celles du catalogue (`ENTRY_CHANNEL_VALUES`, `ACTIVITY_MEASURE_VALUES`) :
  // un test qui invente sa donnée d'entrée ne garde rien.
  entry_channels_used: ['Réseau personnel et anciens clients'],
  // #2048.13 — septième clé de ce lot depuis le 16/09.
  entry_channels_period: ['Réseau personnel et anciens clients'],
  entry_channels_measured: ['Réseau personnel et anciens clients'],
  entry_channels_last_starts: ['Réseau personnel et anciens clients'],
  entry_channels_time_split: ['Réseau personnel et anciens clients'],
  activity_measures_tracked: ['Comptes travaillés'],
  activity_reference_period: 'Le mois dernier',
  // Lot L19 (#2050, #2051) — trois sous-étapes de plus dans `company_info` :
  // sans ces neuf clés, la fiche « complète » ne l'est plus.
  weekly_sales_time_declared: '5 à 10 heures par semaine',
  weekly_sales_time_protected: '2 à 5 heures par semaine',
  weekly_sales_time_residual: 'Moins de 2 heures par semaine',
  weekly_sales_time_slots: ['Tôt le matin, avant 9 h'],
  competing_workloads: ['Le delivery et le suivi des consultants en poste'],
  workload_variability: 'Elle varie selon les semaines, mais de façon prévisible',
  protected_slot_capacity: 'Je bloque des créneaux mais ils sautent souvent',
  dossier_continuity_practices: ['Une revue hebdomadaire du portefeuille'],
  dossier_continuity_breaks: ['Un compte reste sans prochaine action'],
  // Lot G4 (#2054) — trois sous-étapes de plus dans `company_info` : la chaîne
  // d'outillage. Même raison que les sept ci-dessus : sans ces dix-huit clés,
  // la fiche « complète » ne l'est plus et le test mesurerait autre chose.
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
  // Lot G4 (#2055) — la sous-étape `freins` de `target_market`. Ces quatre-là
  // sont PERSONNELLES : remplies et non héritées, elles ne se reposent pas.
  sales_freins: ['Le suivi : je perds le fil de mes relances'],
  frein_attempted: 'Un rappel hebdomadaire dans mon agenda',
  frein_stopped: 'Je ne le regarde plus depuis juin',
  frein_stopped_reason: 'Il tombe le vendredi, le jour où je suis en clientèle',
  // Lot L17 (#2042, #2043, #2044) — trois sous-étapes de plus dans
  // `target_market` : sans ces quinze clés, la fiche « complète » ne l'est plus.
  ideal_client_size: ['500 à 5 000 salariés'],
  ideal_client_structure: ['Filiale de groupe'],
  ideal_client_maturity: ['Client en forte croissance'],
  ideal_client_territory: ['Clients basés en Île-de-France'],
  ideal_client_accessibility: 'Accessible directement (réseau ou déjà en contact)',
  ideal_client_max_sales_cycle: '1 à 3 mois',
  ideal_client_min_deal_size: '10 000 à 50 000 €',
  ideal_client_referencement_constraints: ['Aucune contrainte de référencement connue'],
  ideal_client_current_state: ['Accessible dès maintenant'],
  real_response_level: 'Niveau management intermédiaire',
  budget_validator: 'Le décideur rencontré directement',
  access_orienteur: 'Un sponsor interne déjà identifié',
  entry_channels_dependency: ['Réseau personnel et anciens clients'],
  entry_channels_prerequisites: ['Accréditation fournisseur requise'],
  entry_channels_saturation: ['Appels sortants'],
  // Lot 26 (#2038, #2039, #2040, #2041) — quatre sous-étapes de plus : sans
  // ces neuf clés, la fiche « complète » ne l'est plus.
  service_types: ['Régie', 'Forfait'],
  service_types_proven: ['Régie'],
  service_types_desired: ['Audit'],
  reference_sectors: ['Banque de détail & Banque privée'],
  case_study_results: ['-30% de délai de recrutement'],
  reference_accounts: [],
  client_testimonials: ['« Équipe réactive » — DSI, client X'],
  expertise_no_concrete_proof: [],
  expertise_client_reference: [],
  expertise_personal_experience: [],
  expertise_partner: [],
  expertise_talent_pool: [],
  staffing_modes: ['Sous-traitance'],
  profile_validation_methods: ['Entretien technique interne'],
  contractual_constraints: ["Durée d'engagement minimale"],
  priority_sectors: [],
  // #2018.2 / #2018.4 — stages `role` et `goals` : cinq clés PERSONNELLES de
  // plus, comme le frein plus haut. Remplies et NON héritées ici (Adel a
  // répondu pour lui-même) : elles ne se reposent pas à Bedros, exactement
  // comme `main_sales_pain`.
  user_role: 'Fondateur / CEO',
  // #2018.3 — le portefeuille, personnel lui aussi, dans la même étape.
  portfolio_size: '6-15',
  role_tenure: '2-5 ans',
  industry_tenure: '5 ans et plus',
  individual_goal: 'Ouvrir de nouveaux comptes',
  monthly_target: '3-5 RDV',
  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée : sans
  // cette clé, la fiche « complète » ne l'est plus.
  company_locations: ['Paris (siège)'],
  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — facultatives comme
  // `heard_about_bellum` ci-dessus : `null` ici ne rend PAS la fiche
  // incomplète (#2059.7, même mécanisme).
  consultant_count: null,
  annual_revenue_amount: null,
  annual_revenue_period: null,
  // #2640.2 — facultatif comme les champs juste au-dessus : `null` ne rend
  // PAS la fiche incomplète.
  esn_website: null,
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ, huit clés PERSONNELLES de plus (comme `user_role` plus haut) :
  // sans elles, la fiche « complète » ne l'est plus.
  decisions_alone: ['Envoyer une offre commerciale'],
  decisions_to_validate: ['Signer un nouveau compte client'],
  people_managed: ['Des consultants'],
  recruitment_accounts_authority: 'Je dois faire valider',
  staffing_authority: 'Je décide seul',
  margin_billing_authority: "Je n'ai pas cette responsabilité",
  tools_access: ['CRM'],
  invite_authority: 'Je dois faire valider',
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi », six clés
  // ENTREPRISE de plus (comme `sales_team_size` plus haut, PAS dans
  // `ESN_PERSONAL_ANSWER_KEYS`) : sans elles, la fiche « complète » ne l'est
  // plus, puisque `sales_team_size` de cette fixture n'est pas solo.
  associates_count: '1 associé',
  recruiters_team_size: 'Aucun recruteur dédié',
  delivery_team_size: '1-5 personnes',
  marketing_team_size: 'Aucune personne dédiée au marketing',
  ops_team_size: '1 personne',
  team_coordination_mode: 'Réunion hebdomadaire formelle',
}

const TOUT_HERITE = [...ESN_COMPANY_ANSWER_KEYS, 'main_sales_pain', 'offer_domains', 'recruits_for_clients']

describe('firstPendingSubStep', () => {
  it('LE LOT — fiche ESN complète : il ne reste QUE la question personnelle', () => {
    const step = firstPendingSubStep(FICHE_ESN_COMPLETE, TOUT_HERITE)

    // « frein » est la dernière sous-étape : le frein commercial est la seule
    // clé personnelle du premier temps. Douze questions deviennent une.
    expect(step?.slug).toBe('frein')
    expect(step?.stageCode).toBe('target_market')
  })

  it('SAIT DIRE NON — une fiche ESN incomplète renvoie sur le trou, pas sur la fin', () => {
    // Adel n'a pas renseigné le positionnement : c'est un fait sur l'ESN, donc
    // il reste à poser, et il passe AVANT la question personnelle.
    const partielle: EsnAnswers = { ...FICHE_ESN_COMPLETE, positioning: null }
    const heritees = TOUT_HERITE.filter(key => key !== 'positioning')

    expect(firstPendingSubStep(partielle, heritees)?.slug).toBe('positionnement')
  })

  it('rend `null` quand plus aucune question n’attend une réponse', () => {
    // Il a répondu à SA question : le questionnaire n'a plus rien à lui demander.
    // #2059.7 — `heard_about_bellum` (facultative) reste `null` dans
    // FICHE_ESN_COMPLETE : ce test couvre AUSSI qu'une question facultative
    // vide ne renvoie jamais l'utilisateur dessus à la reprise.
    const heritees = TOUT_HERITE.filter(key => key !== 'main_sales_pain')

    expect(firstPendingSubStep(FICHE_ESN_COMPLETE, heritees)).toBeNull()
  })

  it('LE CONTRÔLE NÉGATIF — rien d’hérité : la première sous-étape, comme avant', () => {
    // L'utilisateur seul dans son espace. Le garde de route ne l'appelle même
    // pas dans ce cas, mais le prédicat doit rester celui d'avant.
    expect(firstPendingSubStep(EMPTY, [])?.slug).toBe(TEMPS1_SUBSTEPS[0]!.slug)
    expect(firstPendingSubStep(FICHE_ESN_COMPLETE, [])).toBeNull()
  })

  it('n’attrape pas ce qu’il ne vise pas — une clé héritée REMPLIE d’entreprise ne repose rien', () => {
    // Le cœur de la règle : hériter d'un fait sur l'ESN suffit, hériter d'un
    // fait sur la personne ne suffit pas.
    for (const key of ESN_COMPANY_ANSWER_KEYS) {
      const uneSeuleHeritee = firstPendingSubStep(FICHE_ESN_COMPLETE, [key])
      // Toutes les autres restent « non héritées mais remplies » → non posées.
      // Seul le frein, personnel et non hérité ici, ne l'est pas non plus.
      expect(uneSeuleHeritee).toBeNull()
    }
  })
})
