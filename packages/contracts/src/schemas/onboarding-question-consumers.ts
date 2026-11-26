import type { EsnAnswers } from './onboarding.js'
import { PRODUCT_CONSUMER_AREAS, type ProductConsumerArea } from './onboarding-answer-contract.js'

/**
 * #2006.12 → .21 / #2007.13 — UN seul artefact (le registre nomme #2007.13 le
 * doublon de #2006.12-.21, « à fusionner en un seul artefact ») : la table de
 * correspondance question → consommateur(s) produit, sur le PATRON de
 * `apps/web/src/features/onboarding/lib/question-consequences.ts` (un lookup
 * indexé par la même clé que `EsnAnswers`, jamais un champ ajouté au contrat)
 * — mais un OBJET DE CLASSIFICATION machine-vérifiable (les aires produit), là
 * où `question-consequences.ts` porte un TEXTE d'affichage. Les deux
 * artefacts coexistent : celui-ci ne duplique pas l'autre, il répond à une
 * question différente (« qui lit cette réponse » plutôt que « que dire à
 * l'écran »).
 *
 * ⚠️ « Aucune question sans dire ce qu'elle modifie » ne veut PAS dire que
 * chaque réponse a forcément un consommateur AUJOURD'HUI — c'est très
 * exactement le défaut n°1 de ce dépôt (« chercher l'appelant, pas la
 * fonction ») que ce lot ne prétend pas résoudre pour les 114 clés d'un coup.
 * Ça veut dire que le SILENCE est interdit : la garde
 * (`onboarding-question-consumers.test.ts`) fait échouer la CI si une clé
 * d'`EsnAnswers` n'a pas de ligne ici, avec sa `reason` non vide — vraie
 * (`areas` peuplé et vérifié fichier:ligne) ou honnête (`areas` limité à ce
 * qui est prouvé, avec la raison de ce qui manque encore). Ne JAMAIS retirer
 * une aire pour faire passer un test — même règle que `demo-coverage.ts`
 * (craft rule n°9).
 *
 * ⚠️ TAILLE DE LA TABLE, REMESURÉE à chaque intégration (jamais recopiée) :
 * **158 entrées** au 16/09/2026 après absorption de `main` (PR #2364) dans la
 * vague 12 — mesuré commentaires RETIRÉS, et `Record<keyof EsnAnswers, …>`
 * fait rougir `tsc` à la première clé oubliée. Les « 114 » ci-dessous ne sont
 * PAS la taille de la table : c'est la date d'un BALAYAGE (16/09 au matin),
 * dont la portée ne grandit pas toute seule quand une branche ajoute une clé.
 *
 * `audit` couvre les 114 clés du 16/09/2026 au matin — pas « toutes les clés »,
 * une clé arrivée depuis peut n'être lue par rien (voir
 * `CLES_SANS_CONSOMMATEUR_MESURE` dans la garde). Chacune des 114 est un nom
 * de champ littéral dans
 * `apps/ia/app/prompts/bellum_profiler.py`, soit parmi les dix champs Temps-1
 * toujours rendus, soit dans `_COMPLEMENT_SECTIONS` (rendu si répondu) —
 * vérifié le 16/09/2026 par script (`node` + `esnAnswersSchema.shape` contre
 * le texte du fichier). #2007.14
 * (`apps/ia/tests/test_answer_contract_influences_audit.py`) va plus loin que
 * cette présence : il prouve que la VALEUR change le texte envoyé au modèle,
 * pas seulement que le nom du champ y figure.
 *
 * Les sept aires groundées dans ce lot (`scoring`, `decouvrir`,
 * `priorisation`, `contacts`, `reverse_market`, `laura`, `messages` — cette
 * dernière câblée le 18/09/2026, #2006.16 : `esn_name`/`expertise_areas`
 * alimentent `bellum_messages.build_system_prompt`, voir leurs entrées
 * ci-dessous) portent chacune au moins un exemple RÉEL, cité par fichier —
 * jamais un lien inventé.
 *
 * `routines` et `pilotage` n'ont, à ce jour, aucun consommateur direct
 * vérifié au-delà d'`audit` : `sales_routine`, `dossier_continuity_*` et
 * `weekly_sales_time_*` sont écrits, relus et transportés jusqu'au profiler
 * (donc `audit`), mais aucune AUTRE aire ne les lit encore (vérifié par grep
 * sur `apps/ia/app/prompts/` et `apps/api/src/modules/` le 16/09/2026, reconduit
 * le 18/09/2026 — #2006.19/#2006.20) — un futur lot les branche, celui-ci ne
 * l'invente pas. ⚠️ Cet aveu n'est PAS qu'une phrase : {@link
 * AIRES_SANS_CONSOMMATEUR_VERIFIE} et la garde de
 * `onboarding-question-consumers.test.ts` le PROUVENT (un commentaire n'est
 * jamais une preuve) — aucune ligne de {@link QUESTION_CONSUMERS} ne peut
 * citer `routines` ou `pilotage` sans faire rougir la CI.
 */
export type QuestionConsumerEntry = {
  areas: ProductConsumerArea[]
  /** Fichier(s):ligne(s) qui LISENT réellement la clé pour chaque aire citée. */
  reason: string
}

/**
 * #2006.19 / #2006.20 — les aires du produit NOMMÉES non alimentées : aucune
 * clé de {@link QUESTION_CONSUMERS} ne cite `routines` ni `pilotage`
 * aujourd'hui (grep sur `apps/ia/app/prompts/` et `apps/api/src/modules/`,
 * dernière mesure le 18/09/2026 — voir l'en-tête du fichier). La garde
 * `onboarding-question-consumers.test.ts` le vérifie dans les deux sens :
 * aucune citation présente, et toute citation future d'une aire listée ici
 * fait rougir la CI plutôt que de passer inaperçue — le silence décoratif
 * que #2006.19/#2006.20 signalaient est fermé.
 */
export const AIRES_SANS_CONSOMMATEUR_VERIFIE: readonly ProductConsumerArea[] = ['routines', 'pilotage']

const V23_PROFILER_REASON =
  'apps/ia/app/prompts/bellum_profiler.py (`_COMPLEMENT_SECTIONS`, « Précisions de cadrage (V23) ») : lue par le profiler, rendue seulement si répondue.'

const DEFAULT_REASON =
  "apps/ia/app/prompts/bellum_profiler.py — lu par build_profiler_user_prompt (Temps 1 direct ou _COMPLEMENT_SECTIONS) ; vérifié le 16/09/2026, 114/114 clés d'EsnAnswers."

/**
 * Les clés ARRIVÉES APRÈS le balayage du 16/09/2026 sur les 114 clés d'alors.
 * `DEFAULT_REASON` affirme une vérification « 114/114 » qui n'a PAS eu lieu
 * pour elles — le recopier ferait de cette phrase un mensonge. Chacune est
 * donc mesurée UNE PAR UNE (`grep -c "<clé>" apps/ia/app/prompts/bellum_profiler.py`)
 * et porte soit `audit` avec la ligne trouvée, soit `areas: []` avec l'aveu
 * ci-dessous. La modestie est permise ; le silence ne l'est pas.
 */
const AUCUN_CONSOMMATEUR_VERIFIE = (branche: string, detail: string): string =>
  `aucun consommateur vérifié au 16/09/2026 — clé ajoutée par ${branche}, absente de apps/ia/app/prompts/bellum_profiler.py (grep = 0). ${detail}`

export const QUESTION_CONSUMERS: Record<keyof EsnAnswers, QuestionConsumerEntry> = {
  // #2006.16 — `messages` lit CETTE clé : `bellum_messages.build_system_prompt`
  // (appelé par `phase4_plan.py:1234` avec le `profile_data` de la requête,
  // le profil ESN de l'utilisateur, jamais celui du compte ciblé) prend
  // `profile.get("esn_name")` en premier choix pour nommer l'ESN dans le
  // prompt système des messages M1.
  esn_name: {
    areas: ['audit', 'messages'],
    reason: DEFAULT_REASON + ' bellum_messages.py:212 — profile.get("esn_name").',
  },
  consultant_size: { areas: ['audit'], reason: DEFAULT_REASON },
  sales_team_size: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2006.16 — `messages` lit aussi cette clé, via le nom projeté `offers`
  // (`seller_context.py:242-244` : `expertise_areas` → `out["offers"]`) que
  // `bellum_messages.py:213` relit pour citer l'offre dans le prompt système.
  expertise_areas: {
    areas: ['audit', 'reverse_market', 'messages'],
    reason:
      DEFAULT_REASON +
      " bellum_signals.py:25-28 — p.get('offers'/'sectors'/'personas')." +
      ' bellum_messages.py:213 — profile.get("offers") (mappé depuis expertise_areas, seller_context.py:242-244).',
  },
  positioning: {
    areas: ['audit', 'decouvrir', 'laura'],
    reason:
      DEFAULT_REASON +
      ' bellum_discover.py:70,78 — _profile_block(profile_data) le lit par son nom projeté. ' +
      'bellum_advisor.py:1015-1086 — le bloc « le commercial à qui tu parles » (p.get(...)).',
  },
  target_sectors: {
    areas: ['audit', 'reverse_market'],
    reason: DEFAULT_REASON + " bellum_signals.py:25-28 — p.get('offers'/'sectors'/'personas').",
  },
  target_company_types: {
    areas: ['audit', 'decouvrir', 'laura'],
    reason:
      DEFAULT_REASON +
      ' bellum_discover.py:70,78 — _profile_block(profile_data) le lit par son nom projeté. ' +
      'bellum_advisor.py:1015-1086 — le bloc « le commercial à qui tu parles » (p.get(...)).',
  },
  staffing_model: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1015-1086 — le bloc « le commercial à qui tu parles » (p.get(...)).',
  },
  geo_zones: { areas: ['audit'], reason: DEFAULT_REASON },
  main_sales_pain: {
    areas: ['audit', 'decouvrir', 'laura'],
    reason:
      DEFAULT_REASON +
      ' bellum_discover.py:70,78 — _profile_block(profile_data) le lit par son nom projeté (mainChallenge). ' +
      'bellum_advisor.py:1015-1086 — le bloc « le commercial à qui tu parles » (p.get(...)).',
  },
  offer_domain: {
    areas: ['audit', 'decouvrir'],
    reason: DEFAULT_REASON + ' bellum_discover.py:70,78 — _profile_block(profile_data) le lit par son nom projeté.',
  },
  offer_domains: { areas: ['audit'], reason: DEFAULT_REASON },
  recruits_for_clients: {
    areas: ['audit', 'priorisation'],
    reason:
      DEFAULT_REASON +
      ' #2040.17 — apps/api/src/modules/accounts/signal-relevance.ts (`decisiveSignalKinds`) : « recrute pour ses clients »' +
      ' fait remonter les signaux de nature `recrutement` dans la Veille' +
      ' (apps/api/src/modules/accounts/accounts.service.ts, `listAccountSignals`).',
  },
  decision_maker_personas: {
    areas: ['audit', 'contacts', 'priorisation', 'scoring', 'reverse_market'],
    reason:
      DEFAULT_REASON +
      ' bellum_contacts.py, bellum_plan.py, bellum_strategy.py — cités par le docblock TEMPS2_ANSWER_KEYS (analysis.ts). ' +
      "bellum_signals.py:25-28 — p.get('personas').",
  },
  avg_sales_cycle: {
    areas: ['audit', 'priorisation', 'scoring'],
    reason:
      DEFAULT_REASON + ' bellum_plan.py, bellum_strategy.py — cités par le docblock TEMPS2_ANSWER_KEYS (analysis.ts).',
  },
  avg_tjm: {
    areas: ['audit', 'contacts', 'priorisation'],
    reason:
      DEFAULT_REASON + ' bellum_contacts.py, bellum_plan.py — cités par le docblock TEMPS2_ANSWER_KEYS (analysis.ts).',
  },
  client_references: {
    areas: ['audit', 'contacts', 'priorisation', 'scoring'],
    reason:
      DEFAULT_REASON +
      ' bellum_contacts.py, bellum_plan.py, bellum_strategy.py — cités par le docblock TEMPS2_ANSWER_KEYS (analysis.ts).',
  },
  no_go_sectors: {
    areas: ['audit', 'scoring', 'decouvrir'],
    reason:
      DEFAULT_REASON +
      ' bellum_strategy.py — cité par le docblock TEMPS2_ANSWER_KEYS (analysis.ts).' +
      ' #2040.15 — apps/api/src/modules/accounts/similar-scoring.ts (`isNoGoCandidate`, appelé par `rankSimilarCandidates`) :' +
      " un secteur refusé n'entre plus dans « comptes similaires à explorer »" +
      ' (apps/api/src/modules/accounts/accounts.service.ts, `listSimilarCompaniesToExplore`).',
  },
  user_role: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1035 — p.get("sellerRole").',
  },
  role_tenure: { areas: ['audit'], reason: DEFAULT_REASON },
  industry_tenure: { areas: ['audit'], reason: DEFAULT_REASON },
  individual_goal: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1036 — p.get("sellerGoal").',
  },
  monthly_target: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1037 — p.get("monthlyTarget").',
  },
  company_age: { areas: ['audit'], reason: DEFAULT_REASON },
  company_size: { areas: ['audit'], reason: DEFAULT_REASON },
  consultants_on_mission: { areas: ['audit'], reason: DEFAULT_REASON },
  consultants_in_pipe: { areas: ['audit'], reason: DEFAULT_REASON },
  team_overlap: { areas: ['audit'], reason: DEFAULT_REASON },
  ramp_up_capacity: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1086 — p.get("rampUpCapacity").',
  },
  avg_deal_size: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1084 — p.get("dealSize").',
  },
  target_margin: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1085 — p.get("targetMargin").',
  },
  portfolio_size: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1038 — p.get("portfolioSize").',
  },
  accounts_relationship_status: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1039 — p.get("accountsRelationshipStatus").',
  },
  weekly_calls: { areas: ['audit'], reason: DEFAULT_REASON },
  weekly_emails: { areas: ['audit'], reason: DEFAULT_REASON },
  weekly_linkedin: { areas: ['audit'], reason: DEFAULT_REASON },
  proactivity_level: { areas: ['audit'], reason: DEFAULT_REASON },
  public_sector_practice: { areas: ['audit'], reason: DEFAULT_REASON },
  regulated_sector_readiness: { areas: ['audit'], reason: DEFAULT_REASON },
  partner_relationship: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2067.2 — décision Louis du 18/09/2026, puis arbitrage du 20/09/2026.
  // Ces deux clés ont DEUX lecteurs depuis le 20/09, et c'est pour ça que la
  // raison ci-dessous a changé : l'audit commercial les lit dans le navigateur
  // (charge active), ET le profiler les rend désormais dans son prompt —
  // elles ancrent la cible `kpiTargets.partnersPerMonth`. Avant le 20/09 la
  // raison disait « grep = 0 : aucun modèle ne la lit » ; le laisser écrit
  // ferait croire à un silence qui n'existe plus.
  partners_regular_count: {
    areas: ['audit'],
    reason:
      'DEUX lecteurs. (1) packages/contracts/src/schemas/commercial-audit-active-load.ts — buildAuditActiveLoad (#2067.2) : le nombre de partenaires réguliers à travailler, rendu par AuditActiveLoad.tsx sur /settings/profile/audit. (2) apps/ia/app/prompts/bellum_profiler.py — section « Terrains particuliers » depuis le 20/09/2026 : c’est l’ANCRAGE de kpi_targets.partners_per_month (apps/ia/app/models/profile_context.py), sans lequel la cible partenaires s’omet. Déclarée dans OnboardingAnswers (apps/ia/app/routers/profiler.py) — sans ça pydantic l’ignorait en silence.',
  },
  partners_occasional_count: {
    areas: ['audit'],
    reason:
      'DEUX lecteurs. (1) packages/contracts/src/schemas/commercial-audit-active-load.ts — buildAuditActiveLoad (#2067.2) : les partenaires ponctuels, CITÉS hors de la charge active. (2) apps/ia/app/prompts/bellum_profiler.py — section « Terrains particuliers » depuis le 20/09/2026, à côté des réguliers : le modèle voit la base ENTIÈRE, mais la cible partenaires s’ancre sur les RÉGULIERS seuls — jamais la somme des deux.',
  },
  go_to_market_channels: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1055 — p.get("goToMarketChannels").',
  },
  sales_routine: {
    areas: ['audit'],
    reason:
      DEFAULT_REASON +
      ' Aucune autre aire ne la lit à ce jour (grep `apps/ia/app/prompts/`, `apps/api/src/modules/`, 16/09/2026) : ' +
      "la ROUTINE de suivi (`routines`) reste hors périmètre — un futur lot la branche, celui-ci ne l'invente pas.",
  },
  sales_blockers: {
    areas: ['audit', 'laura'],
    reason: DEFAULT_REASON + ' bellum_advisor.py:1058 — p.get("salesBlockers").',
  },
  tooling: { areas: ['audit'], reason: DEFAULT_REASON },
  shared_data_scope: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2058.2 / #2058.10 (20/09/2026) — ajoutées après le balayage du 16/09 :
  // `DEFAULT_REASON` ne peut pas être recopié tel quel (il affirme un
  // « 114/114 » qui n'a pas eu lieu pour ces deux clés). Vérifié PAR CE LOT :
  // section « Préférences de sollicitation et de réponse » de
  // `apps/ia/app/prompts/bellum_profiler.py`, prouvée par
  // `apps/ia/tests/test_profiler_prompt_extended_answers.py` (`_CHAMPS_NEUFS`).
  contact_windows: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — section « Préférences de sollicitation et de réponse » ; prouvé par apps/ia/tests/test_profiler_prompt_extended_answers.py (20/09/2026).',
  },
  detail_level: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — section « Préférences de sollicitation et de réponse » ; prouvé par apps/ia/tests/test_profiler_prompt_extended_answers.py (20/09/2026).',
  },
  esn_maturity_situation: { areas: ['audit'], reason: DEFAULT_REASON },
  active_clients_band: { areas: ['audit'], reason: DEFAULT_REASON },
  revenue_recurrence: { areas: ['audit'], reason: DEFAULT_REASON },
  client_concentration_risk: { areas: ['audit'], reason: DEFAULT_REASON },
  company_growth_goal: { areas: ['audit'], reason: DEFAULT_REASON },
  consultants_managed_by_user_band: { areas: ['audit'], reason: DEFAULT_REASON },
  available_consultants_band: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2035.1 / #2035.2 (18/09/2026) — ajoutées après le balayage du 16/09,
  // mesurées une par une comme `role_functions_practiced` ci-dessus.
  consultant_size_group_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:205 — _COMPLEMENT_SECTIONS, « Maturité et effectif réel » ; ' +
      'ajoutée le 18/09/2026 (grep = 1).',
  },
  consultant_size_business_unit_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:206 — _COMPLEMENT_SECTIONS, « Maturité et effectif réel » ; ' +
      'ajoutée le 18/09/2026 (grep = 1).',
  },
  entry_channels_used: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_measured: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_last_starts: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_time_split: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_period: { areas: ['audit'], reason: DEFAULT_REASON },
  activity_measures_tracked: { areas: ['audit'], reason: DEFAULT_REASON },
  activity_reference_period: { areas: ['audit'], reason: DEFAULT_REASON },
  weekly_sales_time_declared: {
    areas: ['audit'],
    reason:
      DEFAULT_REASON +
      ' Aucune autre aire ne la lit à ce jour (grep 16/09/2026) : `pilotage` reste hors périmètre — un futur lot la branche.',
  },
  weekly_sales_time_protected: { areas: ['audit'], reason: DEFAULT_REASON },
  weekly_sales_time_residual: { areas: ['audit'], reason: DEFAULT_REASON },
  weekly_sales_time_slots: { areas: ['audit'], reason: DEFAULT_REASON },
  competing_workloads: { areas: ['audit'], reason: DEFAULT_REASON },
  workload_variability: { areas: ['audit'], reason: DEFAULT_REASON },
  protected_slot_capacity: { areas: ['audit'], reason: DEFAULT_REASON },
  dossier_continuity_practices: {
    areas: ['audit'],
    reason:
      DEFAULT_REASON +
      ' #2051.16 est BRANCHÉE depuis le 16/09/2026 : l’audit rapproche chaque rupture déclarée de ' +
      'l’habitude du catalogue qui la tiendrait (`AUDIT_PRACTICE_BY_CONTINUITY_BREAK`, ' +
      '`commercial-audit-signals.ts`), rendue par `AuditDeclaredSignals.tsx`. Il PROPOSE : aucune routine ' +
      'ne se crée toute seule, et une rupture qu’aucune habitude ne tient ressort nommée plutôt que comblée.',
  },
  dossier_continuity_breaks: {
    areas: ['audit'],
    reason:
      DEFAULT_REASON +
      ' #2051.16 est BRANCHÉE depuis le 16/09/2026 : l’audit rapproche chaque rupture déclarée de ' +
      'l’habitude du catalogue qui la tiendrait (`AUDIT_PRACTICE_BY_CONTINUITY_BREAK`, ' +
      '`commercial-audit-signals.ts`), rendue par `AuditDeclaredSignals.tsx`. Il PROPOSE : aucune routine ' +
      'ne se crée toute seule, et une rupture qu’aucune habitude ne tient ressort nommée plutôt que comblée.',
  },
  tooling_crm: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_ats: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_erp: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_mailbox: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_calendar: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_drive: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_spreadsheet: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_enrichment: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_sourcing_platform: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_bi: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_personal_notes: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_reference: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_reference_data: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_reference_freshness: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_reference_confidence: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_reference_export: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_duplicates: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_pain: { areas: ['audit'], reason: DEFAULT_REASON },
  tooling_internal_names: { areas: ['audit'], reason: DEFAULT_REASON },
  sales_freins: { areas: ['audit'], reason: DEFAULT_REASON },
  frein_attempted: { areas: ['audit'], reason: DEFAULT_REASON },
  frein_stopped: { areas: ['audit'], reason: DEFAULT_REASON },
  frein_stopped_reason: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_size: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_structure: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_maturity: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_territory: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_accessibility: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_max_sales_cycle: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_min_deal_size: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_referencement_constraints: { areas: ['audit'], reason: DEFAULT_REASON },
  ideal_client_current_state: { areas: ['audit'], reason: DEFAULT_REASON },
  real_response_level: { areas: ['audit'], reason: DEFAULT_REASON },
  budget_validator: { areas: ['audit'], reason: DEFAULT_REASON },
  access_orienteur: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_dependency: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_prerequisites: { areas: ['audit'], reason: DEFAULT_REASON },
  entry_channels_saturation: { areas: ['audit'], reason: DEFAULT_REASON },
  service_types: { areas: ['audit'], reason: DEFAULT_REASON },
  service_types_proven: { areas: ['audit'], reason: DEFAULT_REASON },
  service_types_desired: { areas: ['audit'], reason: DEFAULT_REASON },
  reference_sectors: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2041.1 — mesurée UNE PAR UNE le 16/09/2026, comme l'exige le commentaire
  // d'`AUCUN_CONSOMMATEUR_VERIFIE` : `grep -c "priority_sectors"
  // apps/ia/app/prompts/bellum_profiler.py` rend 0. Elle a bien un lecteur —
  // mais côté ÉCRAN, pas côté prompt, et cette table ne parle que des
  // consommateurs PRODUIT. Le nommer ici sans l'avoir vu dans le prompt
  // ferait exactement le « déjà là » faux que le dépôt corrige depuis six
  // chantiers.
  priority_sectors: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS, section « Offre — types de prestation et secteurs de référence » ; transportée par ia.client.ts et déclarée dans profiler.py (OnboardingAnswers). Mesuré le 16/09/2026 pour CETTE clé, pas hérité du balayage 114/114. Lue aussi côté écran : prioritySectorCount → too_many_priority_sectors → page de relecture.',
  },
  case_study_results: { areas: ['audit'], reason: DEFAULT_REASON },
  client_testimonials: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2961 (#2302.28) — même traitement que ses deux voisines ci-dessus :
  // consommé par le résolveur de territoire (`resolve_account_territory`),
  // pas par un prompt de génération de messages.
  reference_accounts: { areas: ['audit'], reason: DEFAULT_REASON },
  // #2039.6 (épopée #2880, feat/nuit-14-25-09, tranché sans Louis).
  expertise_no_concrete_proof: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/nuit-14-25-09 (#2039.6, épopée #2880)',
      'Projetée en `profile_data.expertiseWithoutConcreteProof` (analysis.ts) et posée par le questionnaire (`credibilite-preuves.ts`, i18n FR+EN) — mais aucun prompt ni aucun écran ne la relit. Le croisement relationnel complet (item par expertise avec ses propres métadonnées, #2039.9, .12, .13) reste hors de ce lot ; #2039.2 (même question à une dimension que .6) est livré ci-dessous.',
    ),
  },
  // #2039.2 (épopée #2880, feat/soir-s10-26-09, tranché sans Louis).
  expertise_client_reference: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/soir-s10-26-09 (#2039.2, épopée #2880)',
      'Projetée en `profile_data.expertiseWithClientReference` (analysis.ts) et posée par le questionnaire (`credibilite-preuves.ts`, i18n FR+EN) — mais aucun prompt ni aucun écran ne la relit encore, même règle additive que sa voisine `expertise_no_concrete_proof`.',
    ),
  },
  // #2039.3 (épopée #2880, vague G lot g10, tranché sans Louis).
  expertise_personal_experience: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'vague G lot g10 (#2039.3, épopée #2880)',
      'Projetée en `profile_data.expertiseWithPersonalExperience` (analysis.ts) et posée par le questionnaire (`credibilite-preuves.ts`, i18n FR+EN) — mais aucun prompt ni aucun écran ne la relit encore, même règle additive que ses voisines.',
    ),
  },
  // #2039.4 (épopée #2880, vague G lot g10, tranché sans Louis).
  expertise_partner: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'vague G lot g10 (#2039.4, épopée #2880)',
      'Projetée en `profile_data.expertiseWithPartner` (analysis.ts) et posée par le questionnaire (`credibilite-preuves.ts`, i18n FR+EN) — mais aucun prompt ni aucun écran ne la relit encore, même règle additive que ses voisines.',
    ),
  },
  // #2039.5 (épopée #2880, vague G lot g10, tranché sans Louis).
  expertise_talent_pool: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'vague G lot g10 (#2039.5, épopée #2880)',
      'Projetée en `profile_data.expertiseWithTalentPool` (analysis.ts) et posée par le questionnaire (`credibilite-preuves.ts`, i18n FR+EN) — mais aucun prompt ni aucun écran ne la relit encore, même règle additive que ses voisines.',
    ),
  },
  staffing_modes: {
    areas: ['audit', 'priorisation'],
    reason:
      DEFAULT_REASON +
      ' #2040.17 — apps/api/src/modules/accounts/signal-relevance.ts (`KINDS_BY_STAFFING_MODE`) : chaque mode désigne les' +
      ' natures de signal décisives, que la Veille fait remonter' +
      ' (apps/api/src/modules/accounts/accounts.service.ts, `listAccountSignals`).',
  },
  profile_validation_methods: { areas: ['audit'], reason: DEFAULT_REASON },
  contractual_constraints: { areas: ['audit'], reason: DEFAULT_REASON },

  // #2056 / #2057 (feat/questionnaire-appels-doffres-et-contenu) — le bloc
  // appels d'offres et le bloc contenu. Les quinze clés sont bien projetées
  // en `profile_data` (analysis.ts), mais la mesure rend 0 pour CHACUNE dans
  // `apps/ia/app/prompts/bellum_profiler.py` : le prompt d'audit ne les rend
  // pas encore. Le questionnaire les POSE, rien ne les LIT.
  rfp_platforms_used: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_referencing_status: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_lot_allocation: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_response_templates: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_volume: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_volume_period: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_outcomes: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_go_no_go_process: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  rfp_document_readiness: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2056)',
      'Projetée en `profile_data.rfp*` (analysis.ts) et posée par le questionnaire (i18n onboarding FR/EN) — mais aucun prompt ni aucun écran ne la relit.',
    ),
  },
  content_active_profile: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },
  content_audience_size: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },
  content_visible_expertise: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },
  content_reactions: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },
  content_conversations_generated: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },
  content_funnel_stages_reached: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-appels-doffres-et-contenu (#2057)',
      "Projetée en `profile_data.content*` (analysis.ts) — et `contentRecommendation`, dérivée de ce bloc, n'a elle non plus aucun lecteur hors de son propre fichier.",
    ),
  },

  // #2032.10 / #2036.9 (feat/le-questionnaire-ne-deduit-pas) — mesurées une
  // par une : celles-ci SONT rendues au modèle, contrairement au bloc AO et
  // contenu ci-dessus. La branche a câblé les deux côtés.
  role_functions_practiced: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:148 — _COMPLEMENT_SECTIONS, « Fonctions réellement exercées sur le parcours » ; ' +
      'mesuré à l’intégration de la vague 12 (grep = 1).',
  },
  growth_target_zones: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:165 — _COMPLEMENT_SECTIONS, « ambition territoriale déclarée (souhaitée, pas une zone active) » ; ' +
      'mesuré à l’intégration de la vague 12 (grep = 1). Jamais lue comme une capacité (GA-338, #2036.10).',
  },

  // #2015.7 (feat/questionnaire-filiation-owner-economie-16-09) — la
  // filiation déclarée. `grep -c company_group_structure apps/ia/app/prompts/`
  // rend 0 : aucun prompt ne la lit encore.
  company_group_structure: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-filiation-owner-economie-16-09 (#2015.7)',
      'Projetée en `profile_data.companyGroupStructure` (analysis.ts), donc sérialisée par `bellum_rfp.py` (`build_analysis_user_prompt`) — mais aucun prompt d’audit ni aucun écran ne la relit encore.',
    ),
  },
  // #2056.11 (feat/questionnaire-filiation-owner-economie-16-09) — l'économie
  // du dossier. `grep -c rfp_deal_value apps/ia/app/prompts/` rend 0.
  rfp_deal_value: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-filiation-owner-economie-16-09 (#2056.11)',
      'Projetée en `profile_data.rfpDealValue` (analysis.ts) et lue par `RfpService.actionabilityOf` (apps/api/src/modules/rfp/rfp.service.ts) pour l’axe « economie » de `assessRfpActionability` — mais aucun prompt IA ni aucun écran ne la relit.',
    ),
  },
  // #2057.10 (feat/questionnaire-filiation-owner-economie-16-09) — l'owner.
  // `grep -c rfp_owner_assignment apps/ia/app/prompts/` rend 0.
  rfp_owner_assignment: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-filiation-owner-economie-16-09 (#2057.10)',
      'Projetée en `profile_data.rfpOwnerAssignment` (analysis.ts) et lue par `RfpService.actionabilityOf` (apps/api/src/modules/rfp/rfp.service.ts) pour l’axe « responsable » de `assessRfpActionability` — mais aucun prompt IA ni aucun écran ne la relit.',
    ),
  },

  // #2053.3 (feat/accueil-cout-intercontrat-et-encaissement-18-09) — le coût
  // d'intercontrat. `grep -c intercontrat_cost apps/ia/app/prompts/` rend 0.
  intercontrat_cost: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/accueil-cout-intercontrat-et-encaissement-18-09 (#2053.3)',
      'Projetée en `profile_data.intercontratCost` (analysis.ts), donc sérialisée par `bellum_rfp.py` (`build_analysis_user_prompt`, qui sérialise TOUT `profile_data`) — mais aucun prompt nommé ni aucun écran ne la relit encore.',
    ),
  },
  // #2053.4 (feat/accueil-cout-intercontrat-et-encaissement-18-09) — la
  // visibilité déclarée sur le délai d'encaissement, puis le délai lui-même.
  // `grep -c payment_delay apps/ia/app/prompts/` rend 0.
  payment_delay_visibility: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/accueil-cout-intercontrat-et-encaissement-18-09 (#2053.4)',
      'Projetée en `profile_data.paymentDelayVisibility` (analysis.ts), donc sérialisée par `bellum_rfp.py` — mais aucun prompt nommé ni aucun écran ne la relit encore.',
    ),
  },
  payment_delay_band: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/accueil-cout-intercontrat-et-encaissement-18-09 (#2053.4)',
      "Projetée en `profile_data.paymentDelayBand` (analysis.ts), donc sérialisée par `bellum_rfp.py` — mais aucun prompt nommé ni aucun écran ne la relit encore. Posée uniquement quand `payment_delay_visibility` dit qu'elle est suivie (#2053.8, jamais une fausse précision).",
    ),
  },

  // #2052 (feat/questionnaire-les-objectifs) — les objectifs commerciaux NOMMÉS.
  esn_objectives: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/questionnaire-les-objectifs (#2052)',
      'Elle est écrite (esn-profile.entity.ts), relue (esn-answers.mapper.ts) et projetée en `profile_data.objectives` (analysis.ts) — mais `grep -rn objectives apps/ia/app/prompts/` ne rend RIEN : aucun prompt ne la lit encore.',
    ),
  },

  // #2059 (main, PR #2364) — attribution marketing. MESURÉE une par une à
  // l'absorption de `main` dans la vague 12 : grep = 0 dans le profiler, et
  // c'est VOULU — la question dit elle-même qu'elle n'entre ni dans le profil,
  // ni dans le score, ni dans les recommandations, et deux gardes le tiennent
  // (`heard-about-bellum-attribution.guard.test.ts`,
  // `question-keys-reach-the-model.test.ts` la nomme dans
  // `NEVER_REACHES_MODEL_BY_DOCTRINE`). `areas: []` n'est donc pas un aveu de
  // dette ici : c'est la doctrine écrite.
  heard_about_bellum: {
    areas: [],
    reason:
      'INTERDIT au prompt et à toute notation, PAR DOCTRINE — #2059.9/.10 : attribution marketing, jamais une réponse de profil. ' +
      'Mesuré à l’absorption de `main` dans la vague 12 : absente de apps/ia/app/prompts/bellum_profiler.py (grep = 0), ' +
      'et `heard-about-bellum-attribution.guard.test.ts` fait rougir la CI si `esnAnswersToProfileData` la lit.',
  },

  // #2046 (main, PR #2364) — le vivier de consultants DÉCLARÉ à l'onboarding.
  // Les quatorze clés sont rendues par `_COMPLEMENT_SECTIONS` du profiler
  // (lignes 329-342), mesurées une par une (grep = 1 chacune), jamais
  // `DEFAULT_REASON` : cette phrase-là affirme un balayage « 114/114 » qui n'a
  // pas eu lieu pour elles.
  talent_pool_identified_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:329 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_identified_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_qualified_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:330 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_qualified_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_available_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:331 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_available_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_availability_recency_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:332 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_availability_recency_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_avg_tjm_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:333 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_avg_tjm_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_mobility_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:334 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_mobility_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_consent_status: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:335 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_consent_status" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_other_processes_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:336 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_other_processes_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_engagement_reality_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:337 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_engagement_reality_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_revalidation_frequency: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:338 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_revalidation_frequency" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_state_interested_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:339 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_state_interested_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_state_available_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:340 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_state_available_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_state_secured_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:341 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_state_secured_band" = 1). Vivier déclaré (#2046).',
  },
  talent_pool_state_presentable_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:342 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "talent_pool_state_presentable_band" = 1). Vivier déclaré (#2046).',
  },

  // #2047 (main, PR #2364) — la base de clients DÉCLARÉE à l'onboarding,
  // même mesure (lignes 351-361 du profiler, grep = 1 chacune).
  client_base_missions_ongoing_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:351 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_missions_ongoing_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_missions_completed_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:352 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_missions_completed_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_renewals_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:353 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_renewals_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_satisfaction_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:354 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_satisfaction_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_referrals_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:355 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_referrals_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_rex_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:356 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_rex_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_case_studies_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:357 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_case_studies_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_cross_sell_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:358 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_cross_sell_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_deadlines_band: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:359 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_deadlines_band" = 1). Base de clients déclarée (#2047).',
  },
  client_base_followup_regularity: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:360 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_followup_regularity" = 1). Base de clients déclarée (#2047).',
  },
  client_base_followup_owner: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py:361 — _COMPLEMENT_SECTIONS ; ' +
      'mesuré à l’absorption de `main` dans la vague 12 (grep -c "client_base_followup_owner" = 1). Base de clients déclarée (#2047).',
  },

  // #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est implantée (siège +
  // bureaux). Lue par `_COMPLEMENT_SECTIONS` du profiler (bellum_profiler.py)
  // ET par la couche `company` du profil à trois couches
  // (`layered-profile.ts`, `composeCompany` → `locations`).
  company_locations: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Implantation") ; ' +
      'packages/contracts/src/schemas/layered-profile.ts — composeCompany() → company.locations.',
  },

  // #2088.12/.13 (DÉCISION Louis 18/09, point 16) — les deux premiers vrais
  // NOMBRES. Lus par `_COMPLEMENT_SECTIONS` du profiler comme leurs voisins
  // ("L'entreprise et sa capacité" pour l'effectif, "Économie des affaires"
  // pour le chiffre d'affaires) — rendus SEULEMENT si répondus, jamais à `0`.
  consultant_count: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("L\'entreprise et sa capacité").',
  },
  annual_revenue_amount: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Économie des affaires").',
  },
  annual_revenue_period: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Économie des affaires").',
  },
  // #2060 — la question ouverte qui FERME le parcours. Lue par le prompt du
  // profiler (bellum_profiler.py — _COMPLEMENT_SECTIONS, « Ce qui n'a pas
  // été couvert par le questionnaire »), verbatim, jamais découpée en
  // plusieurs faits (#2060.10 — garde
  // `uncovered-activity-note-stays-opaque.spec.ts`, apps/api/src/architecture).
  uncovered_activity_note: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Ce qui n\'a pas été couvert par le questionnaire").',
  },
  // #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
  // DÉCLARÉ. Absentes de `bellum_profiler.py` (grep = 0) : aucune n'atteint
  // `audit`. Les quatre échelles de responsabilité (#2033.5-.8) atteignent en
  // revanche `laura` — `bellum_advisor.py:1280` appelle
  // `laura_authority_scope.build_authority_scope_block(p)`, dont la sortie
  // est composée dans le prompt système (`bellum_advisor.py:1462`) ; preuve
  // bout en bout dans `apps/ia/tests/test_advisor_seller_profile.py`
  // (`test_a_declined_authority_reaches_the_prompt_and_says_so`). Les trois
  // autres (#2033.2-.4) n'ont, à ce jour, AUCUN consommateur vérifié — la
  // collecte est le périmètre de ce lot (D3), leur lecture par un prompt ne
  // l'est pas encore.
  decisions_alone: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/perimetre-autorite-cadre-ce-que-laura-propose-18-09',
      'Collectée (#2033.2) ; aucun prompt ne la lit encore — catalogue ouvert, pas de clé stable à gater dessus.',
    ),
  },
  decisions_to_validate: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/perimetre-autorite-cadre-ce-que-laura-propose-18-09',
      'Collectée (#2033.3) ; même raison que `decisions_alone`.',
    ),
  },
  people_managed: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/perimetre-autorite-cadre-ce-que-laura-propose-18-09',
      'Collectée (#2033.4) ; aucun prompt ne la lit encore.',
    ),
  },
  recruitment_accounts_authority: {
    areas: ['laura'],
    reason:
      "apps/ia/app/prompts/bellum_advisor.py:1280 — build_authority_scope_block(p), qui lit p.get('recruitmentAccountsAuthority') " +
      '(mappé par seller_context.py::esn_row_to_profile_data et esnAnswersToProfileData, analysis.ts). ' +
      'grep = 0 sur bellum_profiler.py — absente de `audit`.',
  },
  staffing_authority: {
    areas: ['laura'],
    reason:
      "apps/ia/app/prompts/bellum_advisor.py:1280 — build_authority_scope_block(p), qui lit p.get('staffingAuthority'). " +
      'grep = 0 sur bellum_profiler.py — absente de `audit`.',
  },
  margin_billing_authority: {
    areas: ['laura'],
    reason:
      "apps/ia/app/prompts/bellum_advisor.py:1280 — build_authority_scope_block(p), qui lit p.get('marginBillingAuthority'). " +
      'grep = 0 sur bellum_profiler.py — absente de `audit`.',
  },
  tools_access: {
    areas: [],
    reason: AUCUN_CONSOMMATEUR_VERIFIE(
      'feat/perimetre-autorite-cadre-ce-que-laura-propose-18-09',
      "Collectée (#2033.8, 1/2 — informationnelle) ; jamais lue pour gater : c'est `invite_authority` qui gate.",
    ),
  },
  invite_authority: {
    areas: ['laura'],
    reason:
      "apps/ia/app/prompts/bellum_advisor.py:1280 — build_authority_scope_block(p), qui lit p.get('inviteAuthority'). " +
      'grep = 0 sur bellum_profiler.py — absente de `audit`.',
  },
  // #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi », lues par
  // `_COMPLEMENT_SECTIONS` ("Qui fait quoi — l'équipe élargie"), rendues
  // seulement si répondues. Satisfait aussi #2037.14/#2037.16 : l'audit peut
  // nommer une responsabilité non attribuée, un doublon ou une dépendance à
  // une seule personne à partir de ces faits déclaratifs.
  associates_count: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  recruiters_team_size: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  delivery_team_size: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  marketing_team_size: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  ops_team_size: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  team_coordination_mode: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Qui fait quoi — l\'équipe élargie").',
  },
  // #2640.2 — le site de l'entreprise, lu par `_COMPLEMENT_SECTIONS`
  // ("L'entreprise et sa capacité") comme `consultant_count` juste au-dessus —
  // rendu seulement si répondu, jamais dérivé du nom.
  esn_website: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("L\'entreprise et sa capacité").',
  },
  // #2045.1/.2/.4/.6/.7 (lot B, 22/09/2026) — le réseau personnel déclaré
  // pour quatre portes de `canaux.ts` plus les relations chaudes
  // transversales, lu par `_COMPLEMENT_SECTIONS` ("Réseau personnel
  // déclaré — #2045"), rendu seulement si répondu.
  former_clients_count_band: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Réseau personnel déclaré — #2045").',
  },
  former_colleagues_count_band: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Réseau personnel déclaré — #2045").',
  },
  partners_count_band: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Réseau personnel déclaré — #2045").',
  },
  referrers_count_band: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Réseau personnel déclaré — #2045").',
  },
  warm_relations_count_band: {
    areas: ['audit'],
    reason: 'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Réseau personnel déclaré — #2045").',
  },
  // #2036.2 (#2847) — le remote accepté et les déplacements, distincts de
  // `geo_zones`. Colonne additive, migration 1796321380100. Lue par
  // `apps/ia/app/prompts/bellum_profiler.py` (`_COMPLEMENT_SECTIONS`,
  // « Remote et déplacements déclarés »), même mécanisme que
  // `growth_target_zones` juste au-dessus.
  remote_and_travel_scope: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Remote et déplacements déclarés — #2036.2").',
  },
  // #2036.8 (#2847) — la posture territoriale déclarée (capacité avérée /
  // relations / intention). Colonne additive, migration 1796321504100. Lue
  // par `apps/ia/app/prompts/bellum_profiler.py` (`_COMPLEMENT_SECTIONS`,
  // « Posture territoriale déclarée — #2036.8 »), même mécanisme que
  // `remote_and_travel_scope` juste au-dessus.
  zone_capability_status: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py — _COMPLEMENT_SECTIONS ("Posture territoriale déclarée — #2036.8").',
  },
  // #3923.a — transportée jusqu'au web (lot M04, 09/10/2026). #3923 (lot P01,
  // décision Louis 09/10) — POSÉE au complément Temps 2 et éditable dans
  // « Mon profil » (`PlacedRolesSection`) : une colonne, deux écrans.
  placed_roles: {
    areas: ['decouvrir'],
    reason:
      'apps/web/src/features/discover/view/Discover.tsx (`relevanceProfile.placedRoles`) → CandidateRow → ' +
      '`whyNowSignals({ profile })` → `signalRelevance` (signal-relevance.ts, verdict `hiring`) : une offre hors ' +
      'métier passe après les autres dans « Pourquoi maintenant », avec sa raison. Profiler : grep = 0 dans apps/ia/app/prompts (mesuré 09/10, aucun prompt ne la lit).',
  },
  // #4270.1 (18/10) — le profil d'espace « forfait / conseil » : le profiler, la navigation, la fiche besoin.
  workspace_profile: {
    areas: ['audit'],
    reason:
      'apps/ia/app/prompts/bellum_profiler.py (`_COMPLEMENT_SECTIONS`, « Offre — complément ») : lue par le profiler. ' +
      'Et par `workspaceProfileOf` (workspace-profile.ts) : la barre latérale et les onglets ' +
      '(`orderNavForWorkspaceProfile`) mettent le staffing au second plan, la fiche besoin lit périmètre / sponsor / ' +
      'budget en tête (`needFramingOf`).',
  },
  // Théo O onboarding-couverture (22/10/2026) — les 26 clés neuves de la V23 (« Précisions de cadrage »). Chacune est
  // lue par le profiler : `_COMPLEMENT_SECTIONS` (apps/ia/app/prompts/bellum_profiler.py, section « Précisions de
  // cadrage (V23) »), rendue seulement si répondue — une absence n'arrive jamais au modèle comme une valeur.
  account_access: { areas: ['audit'], reason: V23_PROFILER_REASON },
  target_nature: { areas: ['audit'], reason: V23_PROFILER_REASON },
  target_size: { areas: ['audit'], reason: V23_PROFILER_REASON },
  horizon: { areas: ['audit'], reason: V23_PROFILER_REASON },
  success_target: { areas: ['audit'], reason: V23_PROFILER_REASON },
  language_capabilities: { areas: ['audit'], reason: V23_PROFILER_REASON },
  offer_pitch: { areas: ['audit'], reason: V23_PROFILER_REASON },
  priority_expertise: { areas: ['audit'], reason: V23_PROFILER_REASON },
  skill_technos: { areas: ['audit'], reason: V23_PROFILER_REASON },
  activity_nature: { areas: ['audit'], reason: V23_PROFILER_REASON },
  data_sources: { areas: ['audit'], reason: V23_PROFILER_REASON },
  tools: { areas: ['audit'], reason: V23_PROFILER_REASON },
  workflow_pain: { areas: ['audit'], reason: V23_PROFILER_REASON },
  delivery_frictions: { areas: ['audit'], reason: V23_PROFILER_REASON },
  autonomy: { areas: ['audit'], reason: V23_PROFILER_REASON },
  context_policy: { areas: ['audit'], reason: V23_PROFILER_REASON },
  commercial_limits: { areas: ['audit'], reason: V23_PROFILER_REASON },
  currency: { areas: ['audit'], reason: V23_PROFILER_REASON },
  first_name: { areas: ['audit'], reason: V23_PROFILER_REASON },
  scope_level: { areas: ['audit'], reason: V23_PROFILER_REASON },
  scope_unit: { areas: ['audit'], reason: V23_PROFILER_REASON },
  bench_status: { areas: ['audit'], reason: V23_PROFILER_REASON },
  recruiting_priorities: { areas: ['audit'], reason: V23_PROFILER_REASON },
  country_scope: { areas: ['audit'], reason: V23_PROFILER_REASON },
  geography_detail: { areas: ['audit'], reason: V23_PROFILER_REASON },
  no_go: { areas: ['audit'], reason: V23_PROFILER_REASON },
}

/** Vrai si l'aire existe dans la liste fermée — utilisé par la garde pour
 *  détecter une aire inventée dans une entrée. */
export function isKnownConsumerArea(area: string): area is ProductConsumerArea {
  return (PRODUCT_CONSUMER_AREAS as readonly string[]).includes(area)
}
