import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { EsnObjective, OfferPortfolio } from '@bellum/contracts'

/**
 * Versioned snapshot of the BellumAI questionnaire describing an ESN and its
 * go-to-market. Each save creates a new row; the previous row is flipped to
 * `is_current = false`. A partial unique index on `(user_id) WHERE is_current`
 * guarantees at most one current row per user (defined in the migration).
 */
@Entity({ name: 'esn_profiles' })
@Index(['user_id', 'version'], { unique: true })
export class EsnProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('integer')
  version: number

  @Column('boolean', { default: true })
  is_current: boolean

  /**
   * Workspace this profile is attached to, when it is (or was) the team's
   * canonical company profile. NULL for plain per-user profiles (legacy rows
   * and member overlays). FK `ON DELETE SET NULL` — see migration 1785910000000.
   */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /**
   * Marks THE canonical company profile of `workspace_id` — the shared source
   * of the company fields (name, size, offers, sectors, geo…) every member's
   * resolved profile is based on. At most one current canonical row per
   * workspace (partial unique index `esn_profiles_workspace_canonical_idx`).
   * Members keep their own row as a light personal overlay (see
   * `ESN_PERSONAL_ANSWER_KEYS` in @bellum/contracts).
   */
  @Column('boolean', { default: false })
  is_workspace_canonical: boolean

  @Column('text', { nullable: true })
  esn_name: string | null

  @Column('text', { nullable: true })
  consultant_size: string | null

  /** #2088.12 (DÉCISION Louis 18/09, point 16) — additive à `consultant_size`
   *  (tranche, juste au-dessus) : celle-ci n'est ni retirée ni renommée, un
   *  profil qui a répondu en tranche garde cette réponse. Migration
   *  1795716559575, `CHECK (>= 0)`. */
  @Column('integer', { nullable: true })
  consultant_count: number | null

  @Column('text', { nullable: true })
  positioning: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  expertise_areas: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  target_sectors: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  target_company_types: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  geo_zones: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  placed_roles: string[]

  /** Métiers placés DÉDUITS du contexte (11/10/2026, `inferPlacedRoles`) — jamais
   *  mêlés au déclaré ci-dessus. Migration 1796438214637. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  inferred_placed_roles: unknown

  /** Quand la déduction a tourné ; `null` = jamais (cible du rattrapage de nuit). */
  @Column('timestamptz', { nullable: true })
  inferred_placed_roles_at: Date | null

  /** Les métiers déduits que l'humain a RETIRÉS — aucun recalcul ne les ramène. */
  @Column('text', { array: true, default: () => "'{}'" })
  dismissed_inferred_roles: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  decision_maker_personas: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  outreach_channels: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  known_competitors: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  support_preferences: string[]

  @Column('text', { nullable: true })
  sales_team_size: string | null

  @Column('text', { nullable: true })
  staffing_model: string | null

  @Column('text', { nullable: true })
  main_sales_pain: string | null

  /** Domaine d'offre (PDF6 §1) — enum contracts `OFFER_DOMAINS`; NULL = défaut
   *  `esn_it` (prompts IA byte-identiques). Migration 1785960000000. */
  @Column('text', { nullable: true })
  offer_domain: string | null

  /** Portefeuille de domaines (DATAFORGE V10, D-DF2) — codes de la taxonomie
   *  des 66 (`CONSULTING_DOMAINS`). Vide = comportement historique, piloté par
   *  `offer_domain`. Migration 1790001573428. */
  @Column('text', { array: true, default: () => "'{}'" })
  offer_domains: string[]

  /**
   * Le portefeuille d'offre STRUCTURÉ (addendum Stelya §5) — type de société,
   * secteurs d'application, politique de site, géographie, familles
   * d'interlocuteurs, lexique, portée de réutilisation des retours.
   *
   * NULL = aucun portefeuille enregistré, l'état de tous les espaces existants :
   * le produit lit alors le chemin historique et rend des prompts
   * byte-identiques. Sa présence est l'interrupteur. Ne recopie JAMAIS les
   * domaines, qui vivent dans `offer_domains`. Migration 1790010284617.
   */
  @Column('jsonb', { nullable: true })
  offer_portfolio: OfferPortfolio | null

  /**
   * L'ESN place-t-elle aussi des profils EN CDI chez ses clients ? (#1124)
   *
   * `yes` / `no` / `null` (pas de réponse). Sa conséquence est unique et
   * écrite : les offres d'emploi d'un compte cessent d'être filtrées aux rôles
   * IT — pour un placeur, toute ouverture de poste est une piste. Migration
   * `1790127493618`. `null` = comportement d'avant, à l'octet près.
   */
  @Column('text', { nullable: true })
  recruits_for_clients: string | null

  @Column('text', { nullable: true })
  available_consultants_band: string | null

  /** Temps 2 — cycle de vente moyen (→ `salesCycle` des prompts plan/stratégie). */
  @Column('text', { nullable: true })
  avg_sales_cycle: string | null

  /** Temps 2 — TJM moyen, SANS symbole monétaire : les prompts rendent
   *  « TJM moyen : {avgTJM} EUR ». Migration 1787961204338. */
  @Column('text', { nullable: true })
  avg_tjm: string | null

  /** Temps 2 — références clients citables (→ `references` des prompts). */
  @Column('text', { array: true, default: () => "'{}'" })
  client_references: string[]

  /** Temps 2 — secteurs refusés (→ `noGoSectors` de `bellum_strategy`). */
  @Column('text', { array: true, default: () => "'{}'" })
  no_go_sectors: string[]

  @Column('text', { nullable: true })
  target_accounts_maturity: string | null

  @Column('text', { nullable: true })
  social_proof_level: string | null

  /* ---------------------------------------------------------------------- */
  /*  Profil progressif — les 30 questions de la restitution V2 (§21-30).    */
  /*  Migration 1784819567318. Toutes nullables : le questionnaire ne bloque */
  /*  jamais et chaque question se passe.                                    */
  /* ---------------------------------------------------------------------- */

  @Column('text', { nullable: true })
  user_role: string | null

  @Column('text', { nullable: true })
  role_tenure: string | null

  @Column('text', { nullable: true })
  industry_tenure: string | null

  @Column('text', { nullable: true })
  individual_goal: string | null

  @Column('text', { nullable: true })
  monthly_target: string | null

  /**
   * #2052 (lot L19) — les objectifs commerciaux NOMMÉS, en remplacement du
   * champ unique `monthly_target` ci-dessus (conservé, add-only). Migration
   * `1794204271853-EsnObjectifsNommes`. `'[]'::jsonb` = aucun objectif
   * déclaré, jamais un objectif à zéro.
   */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  esn_objectives: EsnObjective[]

  @Column('text', { nullable: true })
  company_age: string | null

  @Column('text', { nullable: true })
  company_size: string | null

  @Column('text', { nullable: true })
  consultants_on_mission: string | null

  @Column('text', { nullable: true })
  consultants_in_pipe: string | null

  @Column('text', { nullable: true })
  team_overlap: string | null

  @Column('text', { nullable: true })
  ramp_up_capacity: string | null

  @Column('text', { nullable: true })
  avg_deal_size: string | null

  // #2053.3 — le coût d'intercontrat, DISTINCT de `available_consultants_band`
  // plus bas (un effectif, jamais un coût). Migration 1795698408511.
  @Column('text', { nullable: true })
  intercontrat_cost: string | null

  @Column('text', { nullable: true })
  target_margin: string | null

  @Column('text', { nullable: true })
  portfolio_size: string | null

  @Column('text', { nullable: true })
  accounts_relationship_status: string | null

  @Column('text', { nullable: true })
  weekly_calls: string | null

  @Column('text', { nullable: true })
  weekly_emails: string | null

  @Column('text', { nullable: true })
  weekly_linkedin: string | null

  @Column('text', { nullable: true })
  proactivity_level: string | null

  @Column('text', { nullable: true })
  public_sector_practice: string | null

  @Column('text', { nullable: true })
  regulated_sector_readiness: string | null

  @Column('text', { nullable: true })
  partner_relationship: string | null

  // #2067.2 — AVEC COMBIEN de partenaires, réguliers puis ponctuels (décision
  // Louis du 18/09/2026). Migration 1789764251903.
  @Column('text', { nullable: true })
  partners_regular_count: string | null

  @Column('text', { nullable: true })
  partners_occasional_count: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  go_to_market_channels: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  sales_routine: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  sales_blockers: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  tooling: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  shared_data_scope: string[]

  // #2058.2 / #2058.10 — les moments acceptés pour solliciter la personne, et
  // le niveau de détail attendu de ses réponses. Migration 1789893296516.
  @Column('text', { array: true, default: () => "'{}'" })
  contact_windows: string[]

  @Column('text', { nullable: true })
  detail_level: string | null

  // #2032.10 — les fonctions réellement exercées, suivi de `user_role`.
  @Column('text', { array: true, default: () => "'{}'" })
  role_functions_practiced: string[]

  // #2036.9 — l'ambition territoriale déclarée, distincte de `geo_zones`
  // (jamais fusionnées — #2036.10, garde GA-338).
  @Column('text', { array: true, default: () => "'{}'" })
  growth_target_zones: string[]

  // #2036.2 (#2847) — le remote accepté et les déplacements, un axe distinct
  // de `geo_zones` (même principe que `growth_target_zones` ci-dessus).
  // Migration 1796321380100.
  @Column('text', { array: true, default: () => "'{}'" })
  remote_and_travel_scope: string[]

  // #2036.8 (#2847) — la posture territoriale déclarée (capacité avérée /
  // relations / intention), v1 tranché sans Louis (lot `feat/reste-r4-26-09`).
  // Migration 1796321504100.
  @Column('text', { array: true, default: () => "'{}'" })
  zone_capability_status: string[]

  // #2015.7 — la filiation déclarée (groupe / filiale / indépendante) ;
  // migration 1795300384517.
  @Column('text', { nullable: true })
  company_group_structure: string | null

  // #2053.4 — la visibilité déclarée sur le délai d'encaissement (le suit-il,
  // et où), puis le délai lui-même. Migration 1795698408511.
  @Column('text', { nullable: true })
  payment_delay_visibility: string | null

  @Column('text', { nullable: true })
  payment_delay_band: string | null

  /**
   * Appels d'offres (#2056) et contenu (#2057) — migration 1794300000001.
   * Toutes NULLABLE / tableaux vides par défaut : le questionnaire ne bloque
   * jamais, une question passée reste exactement ce qu'elle était.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  rfp_platforms_used: string[]

  @Column('text', { nullable: true })
  rfp_referencing_status: string | null

  @Column('text', { nullable: true })
  rfp_lot_allocation: string | null

  @Column('text', { nullable: true })
  rfp_response_templates: string | null

  @Column('text', { nullable: true })
  rfp_volume: string | null

  @Column('text', { nullable: true })
  rfp_volume_period: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  rfp_outcomes: string[]

  @Column('text', { nullable: true })
  rfp_go_no_go_process: string | null

  @Column('text', { nullable: true })
  rfp_document_readiness: string | null

  // #2056.11 — l'économie du dossier ; #2057.10 — l'owner. Migration
  // 1795300384517.
  @Column('text', { nullable: true })
  rfp_deal_value: string | null

  @Column('text', { nullable: true })
  rfp_owner_assignment: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  content_active_profile: string[]

  @Column('text', { nullable: true })
  content_audience_size: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  content_visible_expertise: string[]

  @Column('text', { nullable: true })
  content_reactions: string | null

  @Column('text', { nullable: true })
  content_conversations_generated: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  content_funnel_stages_reached: string[]

  /**
   * Maturité, effectif réel — lot L15 (#2034, #2035). Migration 1794010000000.
   * Toutes NULLABLE : le questionnaire ne bloque jamais, une question passée
   * reste NULL, jamais devinée à `0` ou à une valeur de remplissage.
   */
  @Column('text', { nullable: true })
  esn_maturity_situation: string | null

  @Column('text', { nullable: true })
  active_clients_band: string | null

  @Column('text', { nullable: true })
  revenue_recurrence: string | null

  @Column('text', { nullable: true })
  client_concentration_risk: string | null

  @Column('text', { nullable: true })
  company_growth_goal: string | null

  @Column('text', { nullable: true })
  consultants_managed_by_user_band: string | null

  /** #2035.1 — l'effectif du GROUPE qui porte cette activité, distinct de
   *  `consultant_size` (cette activité seule). Migration
   *  `EffectifGroupBand`. `null` = non renseigné, jamais 0. */
  @Column('text', { nullable: true })
  consultant_size_group_band: string | null

  /** #2035.2 — l'effectif de LA BU/agence de cette personne, un libellé
   *  déclaratif (décision Louis 15/09), pas une partition. Migration
   *  `EffectifBusinessUnitBand`. `null` = non renseigné, jamais 0. */
  @Column('text', { nullable: true })
  consultant_size_business_unit_band: string | null

  /**
   * Canaux d'entrée — lot L19 (#2048). Migration 1794020000000.
   *
   * ⚠️ Un tableau VIDE veut dire « pas de réponse », jamais « aucun canal » :
   * la lecture vit dans `channelAuditBuckets` (contracts), dont les quatre
   * seaux s'additionnent jusqu'au catalogue. « Non mesuré » n'est pas « 0 ».
   */
  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_used: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_measured: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_last_starts: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_time_split: string[]

  /**
   * #2048.13 — pour quels canaux la PÉRIODE des chiffres est connue.
   * Migration 1794110000000. Additive, comme les quatre colonnes ci-dessus.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_period: string[]

  /**
   * Unités comparables — lot L19 (#2049). Migration 1794020000000.
   *
   * ⚠️ `activity_reference_period` est NULLABLE à dessein : sans période
   * explicite, un chiffre est un ordre de grandeur et aucun taux ne se calcule
   * dessus (#2049.13/#2049.14).
   */
  @Column('text', { array: true, default: () => "'{}'" })
  activity_measures_tracked: string[]

  @Column('text', { nullable: true })
  activity_reference_period: string | null

  /**
   * Capacité réelle + continuité des dossiers — lot L19 (#2050, #2051).
   * Migration 1794023117482.
   *
   * ⚠️ TROIS colonnes pour le temps, jamais une (#2050.11/.12/.13) : le temps
   * ANNONCÉ, le temps réellement PROTÉGÉ et le temps RÉSIDUEL sont trois faits
   * distincts, et le résiduel n'est pas dérivé — soustraire deux bandes dont
   * l'une est absente rendrait un chiffre que personne n'a déclaré.
   *
   * Les choix simples sont NULLABLE (question passée = NULL, jamais devinée) ;
   * les listes suivent les cinq du profil progressif (`text[]`, défaut `{}`) —
   * une liste vide est l'absence de sélection, et le catalogue porte pour le
   * constat de vide une option que la personne coche elle-même.
   */
  @Column('text', { nullable: true })
  weekly_sales_time_declared: string | null

  @Column('text', { nullable: true })
  weekly_sales_time_protected: string | null

  @Column('text', { nullable: true })
  weekly_sales_time_residual: string | null

  @Column('text', { nullable: true })
  workload_variability: string | null

  @Column('text', { nullable: true })
  protected_slot_capacity: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  weekly_sales_time_slots: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  competing_workloads: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  dossier_continuity_practices: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  dossier_continuity_breaks: string[]

  /**
   * Cartographie de la chaîne d'outillage — #2054, migration 1794024402918.
   * Onze maillons (chacun répondant « utilisé par qui ») puis les sept attributs
   * de la source de référence. Toutes NULLABLE : une question passée reste NULL,
   * et « nous n'avons pas cet outil » est une valeur DÉCLARÉE, pas une absence.
   */
  @Column('text', { nullable: true })
  tooling_crm: string | null

  @Column('text', { nullable: true })
  tooling_ats: string | null

  @Column('text', { nullable: true })
  tooling_erp: string | null

  @Column('text', { nullable: true })
  tooling_mailbox: string | null

  @Column('text', { nullable: true })
  tooling_calendar: string | null

  @Column('text', { nullable: true })
  tooling_drive: string | null

  @Column('text', { nullable: true })
  tooling_spreadsheet: string | null

  @Column('text', { nullable: true })
  tooling_enrichment: string | null

  @Column('text', { nullable: true })
  tooling_sourcing_platform: string | null

  @Column('text', { nullable: true })
  tooling_bi: string | null

  @Column('text', { nullable: true })
  tooling_personal_notes: string | null

  @Column('text', { nullable: true })
  tooling_reference: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  tooling_reference_data: string[]

  @Column('text', { nullable: true })
  tooling_reference_freshness: string | null

  @Column('text', { nullable: true })
  tooling_reference_confidence: string | null

  @Column('text', { nullable: true })
  tooling_reference_export: string | null

  @Column('text', { nullable: true })
  tooling_duplicates: string | null

  @Column('text', { nullable: true })
  tooling_pain: string | null

  /** #4971.1 — les noms des outils MAISON (migration 1796610000200). `null` =
   *  question passée ; un nom saisi n'est JAMAIS une connexion (#4971.2). */
  @Column('text', { array: true, nullable: true })
  tooling_internal_names: string[] | null

  /**
   * Freins commerciaux et les trois relances — #2055, migration 1794024403057.
   * Colonnes PERSONNELLES (`ESN_PERSONAL_ANSWER_KEYS`) : le frein d'un Business
   * Manager n'est pas celui de son directeur.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  sales_freins: string[]

  @Column('text', { nullable: true })
  frein_attempted: string | null

  @Column('text', { nullable: true })
  frein_stopped: string | null

  @Column('text', { nullable: true })
  frein_stopped_reason: string | null

  /**
   * Client idéal, interlocuteurs, chemins d'accès — lot L17 (#2042, #2043,
   * #2044). Migration 1794011234567. Les quatre colonnes de canaux d'entrée
   * (`entry_channels_used` / `_measured` / `_last_starts` / `_time_split`)
   * sont celles du lot L19 (#2048), déclarées juste au-dessus : ce bloc-ci
   * n'ajoute que la dépendance, les prérequis et la saturation.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_size: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_structure: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_maturity: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_territory: string[]

  @Column('text', { nullable: true })
  ideal_client_accessibility: string | null

  @Column('text', { nullable: true })
  ideal_client_max_sales_cycle: string | null

  @Column('text', { nullable: true })
  ideal_client_min_deal_size: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_referencement_constraints: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  ideal_client_current_state: string[]

  @Column('text', { nullable: true })
  real_response_level: string | null

  @Column('text', { nullable: true })
  budget_validator: string | null

  @Column('text', { nullable: true })
  access_orienteur: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_dependency: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_prerequisites: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  entry_channels_saturation: string[]

  /**
   * Lot 26 (#2038, #2039, #2040, #2041) — offre en types de prestation,
   * secteurs référencés, crédibilité et modes de réponse au besoin. Toutes
   * ADDITIVES : `text[]`, vide par défaut, jamais dans `TEMPS1_REQUIRED_KEYS`.
   * Migration `1794010756001-OffrePrestationsCredibilite.ts`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  service_types: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  service_types_proven: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  service_types_desired: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  reference_sectors: string[]

  /**
   * #2041.1 — les secteurs que l'ESN déclare PRIORITAIRES, parmi ceux qu'elle
   * vise. Migration `1795100629471-PrioritySectors`. AJOUT SEULEMENT :
   * `target_sectors`, `reference_sectors` et `no_go_sectors` gardent leur sens
   * — les cinq niveaux sont la LECTURE des quatre ensemble
   * (`sectorEngagementLevels`, `@bellum/contracts`), jamais une cinquième
   * colonne. Tableau vide = question non répondue, jamais « aucune priorité ».
   */
  @Column('text', { array: true, default: () => "'{}'" })
  priority_sectors: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  case_study_results: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  client_testimonials: string[]

  /**
   * #2961 (#2302.28, épopée Commercial Territory Resolver) — les comptes de
   * référence NOMMÉS, structurés (un nom d'entreprise par entrée), distincts
   * de `case_study_results` (texte libre, « Mission X reconduite… ») : le
   * résolveur de territoire (`territory_resolver.py`) ne peut restituer une
   * référence comparable sans un NOM extractible sans invention — un texte
   * libre ne l'est pas (doctrine « jamais deviné », confirmé par les audits
   * du 26-27/09/2026 sur #2302.28). Migration `1796340600000`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  reference_accounts: string[]

  /**
   * #2039.6 (épopée #2880, tranché sans Louis) — expertises déclarées SANS
   * encore de preuve concrète. Migration `1796321384417`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  expertise_no_concrete_proof: string[]

  /**
   * #2039.2 (épopée #2880, tranché sans Louis) — expertises déclarées qui
   * reposent sur une référence client. Migration `1796322010437`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  expertise_client_reference: string[]

  /**
   * #2039.3 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur l'expérience personnelle. Migration `1796322780320`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  expertise_personal_experience: string[]

  /**
   * #2039.4 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur un partenaire. Migration `1796322780330`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  expertise_partner: string[]

  /**
   * #2039.5 (épopée #2880, vague G lot g10) — expertises déclarées qui
   * reposent sur un vivier disponible. Migration `1796322781937`.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  expertise_talent_pool: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  staffing_modes: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  profile_validation_methods: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  contractual_constraints: string[]

  /**
   * #2005.4 (DÉCISION Louis 17/09, lot CP2) — où l'ESN est IMPLANTÉE (siège +
   * bureaux), distinct de `geo_zones` qui dit où elle PROSPECTE. Migration
   * `1795610000000-CompanyLocations`. Clé d'ENTREPRISE.
   */
  @Column('text', { array: true, default: () => "'{}'" })
  company_locations: string[]

  /**
   * #2088.12/.13 (DÉCISION Louis 18/09, point 16) — le chiffre d'affaires
   * annuel, en euros, et la période qu'il couvre (#2088.13 : un montant sans
   * période ne veut rien dire — dernier exercice clos, ou en cours estimé).
   * Question entièrement NOUVELLE, aucune tranche n'existait avant. Migration
   * 1795716559575, `CHECK (>= 0)` sur le montant.
   */
  @Column('integer', { nullable: true })
  annual_revenue_amount: number | null

  @Column('text', { nullable: true })
  annual_revenue_period: string | null

  /**
   * #2006.2 → .11 / #2006.22 — l'ENVELOPPE par réponse (question, source,
   * confiance, date, auteur, statut, version du questionnaire, motif de
   * branchement, consommateurs produit — voir `AnswerMetaMap`,
   * `@bellum/contracts`), à côté des colonnes plates ci-dessus qui ne portent
   * QUE la valeur. Colonne ADDITIVE (migration
   * `1795000000001-OnboardingAnswerMeta.ts`), `NOT NULL DEFAULT '{}'::jsonb` :
   * une ligne écrite avant ce lot n'a d'entrée pour AUCUNE clé, et
   * `mapRowToAnswerMeta` + `resolveAnswerStatus` (`answer-meta.mapper.ts`)
   * lisent cette absence comme `proposed`, jamais `confirmed` — la migration
   * ne réécrit rien, elle change la LECTURE.
   */
  @Column('jsonb', { default: () => "'{}'" })
  answer_meta: Record<string, unknown>

  /**
   * #2035.8 — QUAND chaque bande d'effectif a été répondue par un humain
   * (clé d'`EsnAnswers` → ISO). Colonne ADDITIVE (migration
   * `1795702848586-EffectifObservedAt.ts`), `NOT NULL DEFAULT '{}'::jsonb` :
   * une ligne écrite avant ce lot n'a d'entrée pour AUCUNE clé, ce qui se lit
   * `never_observed` (`readEffectifFreshness`, `@bellum/contracts`), jamais
   * une fausse fraîcheur.
   */
  @Column('jsonb', { default: () => "'{}'" })
  effectif_observed_at: Record<string, string>

  /**
   * #2007.11 — les CLÉS de questions volontairement PASSÉES par l'utilisateur
   * (`ProfileQuestionnaireDialog.tsx`, bouton « passer »), à ne jamais
   * confondre avec `answer_meta` : celui-ci suppose une VALEUR par entrée, une
   * question passée n'en a précisément aucune. Colonne ADDITIVE (migration
   * `1796000667115-EsnProfileSkippedQuestionKeys.ts`),
   * `NOT NULL DEFAULT '[]'::jsonb` : une ligne écrite avant ce lot n'a passé
   * AUCUNE question au sens de ce champ — état réel, jamais une valeur
   * fabriquée. Répondre plus tard à une clé RETIRE son entrée ici
   * (`EsnProfileService`, « une correction humaine gagne toujours »).
   */
  @Column('jsonb', { default: () => "'[]'" })
  skipped_question_keys: string[]

  /**
   * Vivier de consultants DÉCLARÉ à l'onboarding — #2046. Migration
   * `1794210000000-VivierEtBaseClients.ts`. Voir `answers-vivier.ts`
   * (`@bellum/contracts`) pour la raison de chaque colonne : un snapshot
   * agrégé, distinct des fiches de `consultants` (`ConsultantEntity`).
   */
  @Column('text', { nullable: true })
  talent_pool_identified_band: string | null

  @Column('text', { nullable: true })
  talent_pool_qualified_band: string | null

  @Column('text', { nullable: true })
  talent_pool_available_band: string | null

  @Column('text', { nullable: true })
  talent_pool_availability_recency_band: string | null

  @Column('text', { nullable: true })
  talent_pool_avg_tjm_band: string | null

  @Column('text', { nullable: true })
  talent_pool_mobility_band: string | null

  @Column('text', { nullable: true })
  talent_pool_consent_status: string | null

  @Column('text', { nullable: true })
  talent_pool_other_processes_band: string | null

  @Column('text', { nullable: true })
  talent_pool_engagement_reality_band: string | null

  @Column('text', { nullable: true })
  talent_pool_revalidation_frequency: string | null

  @Column('text', { nullable: true })
  talent_pool_state_interested_band: string | null

  @Column('text', { nullable: true })
  talent_pool_state_available_band: string | null

  @Column('text', { nullable: true })
  talent_pool_state_secured_band: string | null

  /** #2046.14 — un CV n'est pas une candidature prête. */
  @Column('text', { nullable: true })
  talent_pool_state_presentable_band: string | null

  /**
   * Base de clients DÉCLARÉE à l'onboarding — #2047. Même migration. Voir
   * `answers-base-clients.ts` pour la raison de chaque colonne, et pourquoi
   * #2047.1 n'en a pas (`active_clients_band` ci-dessus la porte déjà).
   */
  @Column('text', { nullable: true })
  client_base_missions_ongoing_band: string | null

  @Column('text', { nullable: true })
  client_base_missions_completed_band: string | null

  @Column('text', { nullable: true })
  client_base_renewals_band: string | null

  @Column('text', { nullable: true })
  client_base_satisfaction_band: string | null

  @Column('text', { nullable: true })
  client_base_referrals_band: string | null

  @Column('text', { nullable: true })
  client_base_rex_band: string | null

  @Column('text', { nullable: true })
  client_base_case_studies_band: string | null

  @Column('text', { nullable: true })
  client_base_cross_sell_band: string | null

  @Column('text', { nullable: true })
  client_base_deadlines_band: string | null

  @Column('text', { nullable: true })
  client_base_followup_regularity: string | null

  @Column('text', { nullable: true })
  client_base_followup_owner: string | null

  /**
   * Attribution marketing — #2059 (lot L19), migration
   * `1794200200000-EsnProfileHeardAboutBellum.ts`. Colonne PERSONNELLE
   * (`ESN_PERSONAL_ANSWER_KEYS`) : comment CETTE personne a connu {{brand}}
   * n'est pas comment son associé l'a connu.
   *
   * 🔴 Ne JAMAIS lire cette colonne dans un chemin de notation ou un prompt —
   * doctrine #2059.9/.10, gardée par
   * `packages/contracts/src/schemas/heard-about-bellum-attribution.guard.test.ts`.
   */
  @Column('text', { nullable: true })
  heard_about_bellum: string | null

  /**
   * #2060 — la question ouverte qui FERME le parcours : « Y a-t-il quelque
   * chose d'important sur ton activité que mes questions n'ont pas couvert ? ».
   * Migration `1795712398814-EsnProfileUncoveredActivityNote.ts`.
   *
   * #2060.10 — reste une chaîne VERBATIM, jamais découpée en plusieurs faits
   * (garde `apps/api/src/architecture/uncovered-activity-note-stays-opaque.spec.ts`).
   */
  @Column('text', { nullable: true })
  uncovered_activity_note: string | null

  /**
   * #2033.2-.8 (D3, décision Louis 18/09/2026) — le périmètre d'autorité
   * DÉCLARÉ. Migration `1795712440422-AuthorityScope.ts`. Colonnes
   * PERSONNELLES (`ESN_PERSONAL_ANSWER_KEYS`) : le périmètre d'un Business
   * Manager n'est pas celui de son associé.
   *
   * 🔴 N'entrent NULLE PART dans les droits — `workspace-permission.guard.ts`
   * reste la SEULE autorité sur ce qui est AUTORISÉ (GA-26). Elles cadrent
   * seulement ce que Laura PROPOSE (`authority-scope.ts`,
   * `laura_authority_scope.py`).
   */
  @Column('text', { array: true, default: () => "'{}'" })
  decisions_alone: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  decisions_to_validate: string[]

  @Column('text', { array: true, default: () => "'{}'" })
  people_managed: string[]

  @Column('text', { nullable: true })
  recruitment_accounts_authority: string | null

  @Column('text', { nullable: true })
  staffing_authority: string | null

  @Column('text', { nullable: true })
  margin_billing_authority: string | null

  @Column('text', { array: true, default: () => "'{}'" })
  tools_access: string[]

  @Column('text', { nullable: true })
  invite_authority: string | null

  /**
   * #2037.1/.3/.4/.5/.6/.11 (lot EE, 18/09/2026) — « qui fait quoi » au-delà
   * du commercial (`sales_team_size`, plus haut). Migration
   * `1795720000000-QuiFaitQuoiEquipeElargie.ts`. Colonnes ENTREPRISE (pas
   * `ESN_PERSONAL_ANSWER_KEYS`) : le nombre de recruteurs de l'ESN n'est pas
   * une opinion personnelle, comme `sales_team_size` déjà plus haut.
   */
  @Column('text', { nullable: true })
  associates_count: string | null

  @Column('text', { nullable: true })
  recruiters_team_size: string | null

  @Column('text', { nullable: true })
  delivery_team_size: string | null

  @Column('text', { nullable: true })
  marketing_team_size: string | null

  @Column('text', { nullable: true })
  ops_team_size: string | null

  @Column('text', { nullable: true })
  team_coordination_mode: string | null

  /**
   * #2640.2 — le site de l'entreprise, devenu une réponse comme les autres :
   * source affichée (`PrefillBadge`, `pick_website` — SIREN → domaine d'e-mail
   * → recherche par nom) et corrigeable, la même arbitration `applyFieldUpdates`
   * (`provenance.ts`) que tout autre champ (GA-26). Migration
   * `1795996123871-EsnProfileWebsite.ts`.
   */
  @Column('text', { nullable: true })
  esn_website: string | null

  /**
   * Réseau personnel DÉCLARÉ à l'onboarding — #2045.1/.2/.4/.7 (lot B,
   * 22/09/2026). Migration `1795997843617-ReseauPersonnelDeclare.ts`. Voir
   * `answers-reseau.ts` (`@bellum/contracts`) : quatre des quinze portes
   * d'entrée de `canaux.ts` reposent sur un réseau personnel plutôt qu'une
   * prospection active, sans jamais dire sa TAILLE — ces bandes le disent.
   */
  @Column('text', { nullable: true })
  former_clients_count_band: string | null

  @Column('text', { nullable: true })
  former_colleagues_count_band: string | null

  @Column('text', { nullable: true })
  partners_count_band: string | null

  @Column('text', { nullable: true })
  referrers_count_band: string | null

  /** #4270.1 (18/10) — le profil d'espace (`forfait_conseil`) ; `null` = aucun
   *  choix = comportement d'avant. Migration `1796560286663-EsnWorkspaceProfile`. */
  @Column('text', { nullable: true })
  workspace_profile: string | null

  // Théo O onboarding-couverture (22/10/2026) — les 26 clés neuves de la V23. Migration `1796575094807-OnboardingV23Answers`.
  @Column('text', { array: true, default: () => "'{}'" })
  target_nature: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  target_size: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  language_capabilities: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  priority_expertise: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  skill_technos: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  activity_nature: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  data_sources: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  tools: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  delivery_frictions: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  recruiting_priorities: string[]
  @Column('text', { array: true, default: () => "'{}'" })
  country_scope: string[]
  @Column('text', { nullable: true })
  account_access: string | null
  @Column('text', { nullable: true })
  horizon: string | null
  @Column('text', { nullable: true })
  success_target: string | null
  @Column('text', { nullable: true })
  offer_pitch: string | null
  @Column('text', { nullable: true })
  workflow_pain: string | null
  @Column('text', { nullable: true })
  autonomy: string | null
  @Column('text', { nullable: true })
  context_policy: string | null
  @Column('text', { nullable: true })
  commercial_limits: string | null
  @Column('text', { nullable: true })
  currency: string | null
  @Column('text', { nullable: true })
  first_name: string | null
  @Column('text', { nullable: true })
  scope_level: string | null
  @Column('text', { nullable: true })
  scope_unit: string | null
  @Column('text', { nullable: true })
  bench_status: string | null
  @Column('text', { nullable: true })
  geography_detail: string | null
  @Column('text', { nullable: true })
  no_go: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
