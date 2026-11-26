import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-12 — une contrainte `CHECK` COUVRE son énumération TypeScript.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU ENTRE GA-08 ET GA-11
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt gardait déjà les deux moitiés du problème, séparément :
 *  · **GA-08** gèle les taxonomies TypeScript — aucune valeur ne disparaît,
 *    l'ordre ne bouge pas, les ajouts vont en fin ;
 *  · **GA-11** empêche une contrainte `CHECK` de RÉTRÉCIR d'une migration à
 *    l'autre.
 *
 * Aucune des deux ne comparait le TypeScript au SQL. On pouvait donc ajouter
 * proprement une valeur à une énumération, la faire passer par GA-08, et
 * l'écrire dans une colonne dont la contrainte ne la connaît pas.
 *
 * Ce n'est pas une hypothèse. C'est arrivé DEUX fois :
 *  · le 21/07, `account_vocabulary.kind` — des dossiers COMPLETS marqués
 *    « erreur », parce que la persistance violait le `CHECK` en fin de course ;
 *  · le 22/08, trouvé par cette garde : `accounts.status = 'prospect'` était
 *    écrit par « Ajouter au portefeuille » alors qu'AUCUNE déclaration de
 *    `accounts_status_check` ne l'a jamais autorisé. La contrainte rejetait,
 *    l'exception était avalée dans un `failure()`, et l'utilisateur lisait
 *    « Impossible d'ajouter ce compte au portefeuille ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA GARDE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour chaque contrainte listée ci-dessous, la DERNIÈRE déclaration en base
 * doit contenir toutes les valeurs de son énumération TypeScript. L'inverse
 * n'est PAS vérifié : une contrainte plus large que le TypeScript est sans
 * danger (des lignes historiques portent souvent une valeur qu'on n'écrit plus).
 *
 * La table est EXHAUSTIVE : toute contrainte trouvée dans les migrations doit y
 * figurer, soit avec son énumération, soit déclarée sans contrepartie ET avec
 * la raison. Une contrainte neuve fait donc échouer la CI jusqu'à ce que
 * quelqu'un ait répondu à la question.
 */

const MIGRATIONS = join(__dirname, '..', 'migrations')
const SCHEMAS = join(__dirname, '..', '..', '..', '..', 'packages', 'contracts', 'src', 'schemas')

/**
 * `CONSTRAINT <nom> CHECK (<colonne> IN ('a', 'b'))`, avec ou sans `ADD`.
 *
 * ⚠️ Le `ADD ` était obligatoire dans la première version de cette lecture, si
 * bien que toute contrainte déclarée EN LIGNE dans un `CREATE TABLE` était
 * invisible — `interventions_state_check` par exemple. Une garde qui ne voit
 * qu'une moitié des contraintes passe au vert sur l'autre.
 */
/**
 * ⚠️ La forme `IS NULL OR <col> IN (…)` a été ajoutée le 22/08/2026.
 *
 * Une colonne d'énumération NULLABLE s'écrit ainsi, et la garde ne la voyait
 * pas — elle exigeait que la contrainte commence par le nom de la colonne. Une
 * contrainte invisible passe au vert pour toujours, ce qui est le défaut que
 * cette garde existe précisément pour corriger : sa première version ne lisait
 * que `ADD CONSTRAINT`, soit 27 contraintes sur 83, et **une garde qui ne voit
 * qu'un tiers de son sujet passe au vert sur les deux autres**.
 */
/**
 * ⚠️ Élargi le 30/08/2026 aux TROIS formes que GA-177
 * (`check-constraints-stay-named.spec.ts`) avait NOMMÉES sans les traiter —
 * son commentaire disait explicitement « élargir GA-12 pour lire ces
 * formes-là est un chantier séparé » :
 *
 *  · le nom entre GUILLEMETS — `CONSTRAINT "workspaces_billing_currency_check"`
 *    — porte bien le mot-clé `CONSTRAINT` (ce n'est pas une contrainte EN
 *    LIGNE, GA-177 la voit déjà comme nommée), mais l'ancien `[a-z0-9_]+`
 *    n'acceptait pas le guillemet. Le guillemet n'est pas gardé dans le nom
 *    final retenu par `sqlConstraints()` : c'est de l'échappement SQL, pas une
 *    part du nom.
 *  · le nom INTERPOLÉ — `CONSTRAINT ${table}_role_check`, dans `RbacRoles`
 *    (1785760000000) et `MemberPermissions` (1789516204873) — ne désigne pas
 *    UNE contrainte mais une FAMILLE, appliquée à chaque table d'une boucle
 *    `for (const table of …)`. Voir `resolveInterpolatedTables` plus bas pour
 *    QUAND elle se développe en noms concrets, et
 *    `UNRESOLVABLE_INTERPOLATED_FAMILIES` pour le cas où elle ne le peut pas.
 *  · `= ANY (ARRAY[…])` au lieu de `IN (…)` — le même sens SQL, une forme
 *    différente. `contacts_decision_role_check` s'écrit ainsi depuis
 *    `1782700000000-AddProcurementDecisionRole.ts` ; avant cet élargissement,
 *    elle était invisible à GA-12 (aucun `IN (` à trouver), ET la migration
 *    antérieure qui la nommait (`1781000000000-AddDeckDecisionRoles.ts`)
 *    interpole sa propre liste de valeurs (`IN (${list})`), donc ne
 *    contribuait aucune valeur non plus — la contrainte n'apparaissait tout
 *    simplement PAS dans `sql`, sur aucune des deux formes.
 */
const ADD_CHECK =
  /(?:ADD\s+)?CONSTRAINT\s+(?<name>"[a-z0-9_]+"|\$\{[A-Za-z0-9_]+\}[a-z0-9_]*|[a-z0-9_]+)\s+CHECK\s*\(\s*(?:[a-z0-9_."]+\s+IS\s+NULL\s+OR\s+)?[a-z0-9_."]+\s+(?:IN\s*\((?<inList>[^)]*)\)|=\s*ANY\s*\(\s*ARRAY\s*\[(?<anyList>[^\]]*)\]\s*\))/gi

/**
 * La correspondance contrainte SQL → énumération TypeScript.
 *
 * `null` veut dire « aucune contrepartie en TypeScript », et la raison est
 * écrite à côté — c'est ce qui distingue un choix d'un oubli.
 */
const MAPPING: Record<string, string | null> = {
  // #4782 — le fondement d'une fusion compte-CRM ↔ compte-analyse (migration `1796584123457`) : `siren` | `name`.
  // `null` : union littérale `basis: 'siren' | 'name'` du type `CrmFusionPair` (`account-crm-fusion.ts`), lue par le seul
  // module de fusion ; aucune énumération TypeScript nommée ni contrat partagé n'existe.
  account_crm_fusions_basis_check: null,
  // Lot 775 — parcours observés anonymisés (migration `1796640000000-MarketPersonPaths`). `null` : unions littérales
  // de `MarketPersonPathEntity` (`workStatus`, `datePrecision`), lues par le seul module mémoire marché ; aucune
  // énumération TypeScript nommée ni contrat partagé n'existe.
  market_person_paths_status_check: null,
  market_person_paths_precision_check: null,
  // Lot 783 — le dossier d'origine d'un jeu du pack marché v2.1 (migration `1796900104000-MarketV2Rows`). `null` :
  // les valeurs viennent du schéma du pack (`market-v2-schema.json`, champ `folder`), lu par le seul importeur ;
  // aucune énumération TypeScript nommée ni contrat partagé n'existe.
  market_v2_datasets_folder_check: null,
  // Lot 793 — la sorte de clé du référentiel pivot (`siren` | `domain` | `name`, migration `1796900170000`). `null` :
  // le type `CommonKeyKind` est local au résolveur et au script opérateur (`common/common-account-links.ts`), aucun
  // contrat partagé ne l'expose ; la contrainte est posée ICI, avant le code qui écrit (GA-11/GA-12).
  common_account_links_key_kind_check: null,
  // #4781 — la provenance d'un angle personnel (migration `1796584260871`) : `human` seulement, une valeur. `null` :
  // aucune énumération TypeScript n'existe, l'angle d'un commercial n'a qu'une source ; la contrainte est posée ICI,
  // avant le code qui écrirait une autre valeur (GA-11/GA-12).
  user_angles_source_check: null,
  // #4546, plusieurs boîtes mail par commercial (migration `20261025100000`) — `personal` pour une boîte
  // connectée depuis le 25/10/2026, `inherited_shared` pour celles d'avant, qui gardent leur portée.
  // `null` : le type vit en union littérale sur les deux entités
  // (`google-connection.entity.ts:80`, `microsoft-connection.entity.ts:81`), aucune énumération
  // TypeScript nommée ni contrat partagé n'existe — deux valeurs, lues par le seul module des boîtes mail.
  google_connections_scope_type_check: null,
  microsoft_connections_scope_type_check: null,
  // import-contexte (migration `1796570184640`) — les quatre destinations enregistrées au bilan d'un import.
  context_pack_imports_destination_check: 'CONTEXT_PACK_RECORDED_DESTINATIONS',
  // `null` : deux valeurs (`done` | `failed`), `z.enum` en ligne dans `contextPackRecordRequestSchema` — aucune
  // énumération TypeScript nommée n'existe pour le bilan d'un import.
  // Théo D team-business.N2 (22/10) — l'état d'une cible proposée à un membre (migration `1796575106329`).
  objective_proposals_status_check: 'OBJECTIVE_PROPOSAL_STATUSES',
  context_pack_imports_status_check: null,
  // #4573 — l'état de l'ORIGINAL d'un import de l'assistant (migration `1796583917461`).
  context_pack_imports_original_status_check: 'CONTEXT_PACK_ORIGINAL_STATUSES',
  // Étape de séquence (migration `1796570155559`) — `email` | `call_script`. `null` : littéral interne du module
  // `sequence-templates` (service + migration), aucune énumération TypeScript ni contrat partagé n'existe encore.
  sequence_template_steps_kind_check: null,
  // L3 Pilotage › Staffing (14/10/2026) — le motif d'une absence de consultant (migration `1796537418263`).
  consultant_absences_kind_check: 'CONSULTANT_ABSENCE_KINDS',
  // #4158.30 — contenu partagé avec l'équipe / personnel (migration `1796530275187`).
  message_library_entries_visibility_check: 'CONTENT_VISIBILITIES',
  sequence_templates_visibility_check: 'CONTENT_VISIBILITIES',
  // #3282 / #3263.30 (lot RAC, 10/10) — le niveau d'entrée au comité, liste fermée (migration `1796438000011`).
  accounts_committee_entry_level_check: 'COMMITTEE_ENTRY_LEVELS',
  // #3586 — le journal de synchro du Drive interne (migration `1796431247953`). `null` : ces deux listes
  // fermées (`indexed|ignored|error|archived`, `ok|error`) vivent dans le module interne
  // `internal-knowledge` (`internal-knowledge.types.ts`) et ne traversent JAMAIS vers le web ni vers
  // `@bellum/contracts` — plomberie d'opérateur, un seul lecteur (le panneau du back-office).
  // Retours sur les candidats de Découvrir — migration `1796437800003`. `null` : une seule valeur
  // (`wrong_company`), littéral interne au module `discover-feedback` (SQL + test), aucune énumération
  // TypeScript ni contrat partagé n'existe encore.
  discover_candidate_feedback_verdict_check: null,
  // #4406 (intégration PR n°3) — `pending` | `connected` seulement : `disconnected` = AUCUNE ligne (la déconnexion supprime)
  // et `unreachable` est un état MESURÉ à la lecture (Beeper Desktop fermé), jamais écrit. `beeperConnectionStateSchema`
  // est donc plus LARGE que la contrainte, volontairement.
  beeper_connections_status_check: null,
  // SCOPES-I — les écarts de portées OAuth (migration `1796560471923`). `null` : `SCOPE_GAP_PROVIDERS` vit dans
  // `modules/connector-scope-gaps/connector-scope-registry.ts` (interne à l'API, jamais exposé à `@bellum/contracts`) ;
  // la contrainte SQL est volontairement plus LARGE (salesforce, attio) que la liste TS — un fournisseur s'ouvre en code.
  connector_scope_gaps_provider_check: null,
  // #3916.b (lot M03) — les annonces de registre public lues en continu (migration `1796437900301`).
  // `null` : la liste (`REGISTRY_ANNOUNCEMENT_KINDS`) vit dans `schemas/analysis/public-data.ts`, un
  // sous-répertoire que cette garde ne parcourt pas ; mêmes valeurs (neuf depuis `headcount_change`,
  // migration `1796461938273`, lot S7 14/10), relues à la main le 14/10/2026.
  public_registry_announcements_kind_check: null,
  // `null` : deux sources (`bodacc|sirene`), un `z.enum` inline du contrat (`registryAnnouncementSchema`),
  // aucune liste exportée à comparer.
  public_registry_announcements_source_check: null,
  // #3916 (lot M03) — l'origine d'un relevé Sirene (migration `1796437900302`). `null` : union littérale
  // interne à l'entité (`public-registry.entity.ts`), jamais dans le contrat.
  sirene_snapshots_source_check: null,
  internal_knowledge_files_status_check: null,
  internal_knowledge_sync_state_status_check: null,
  // #3236.2 (b, tranche) — le statut d'un approfondissement persistant (migration
  // `1796437700001`). `null` : type literal interne à l'API (`ChatDeepenJobStatus`,
  // `chat-deepen-job.entity.ts`), lu par un seul écran via le DTO du contrôleur —
  // pas encore un contrat partagé `@bellum/contracts`.
  chat_deepen_jobs_status_check: null,
  // #3437/#3438/#3440 (lot X71) — l'étape d'une séquence de la bibliothèque (migration `1796426537419`).
  message_library_entries_step_check: 'MESSAGE_LIBRARY_STEPS',
  // #3755 — le type d'un critère de la grille de qualification (migration `1796435218742`).
  qualification_criteria_kind_check: 'QUALIFICATION_CRITERION_KINDS',
  // Marchés locaux (L1) — le périmètre d'une zone (migration `1796433901253`, D4 : Suisse ouverte).
  market_zones_scope_check: 'MARKET_SCOPES',
  // Marchés locaux (L1) — l'origine du brief d'une zone : `seed` (semis démo) ou `generated` (L3).
  // Valeur interne au stockage, typée sur l'entité seulement, jamais dans le contrat.
  market_zones_brief_origin_check: null,
  // #3405 (lot X59) — la chaleur déclarée d'un lien (migration `1796425310417`).
  introduction_authorizations_warmth_check: 'RELATIONAL_WARMTHS',
  // #2957 — la session d'import d'appel d'offres (migration `1796413352817`).
  rfp_import_sessions_status_check: 'RFP_IMPORT_SESSION_STATUSES',
  // #2366 — le modèle canonique de l'outreach (migration `1795999204817`) :
  // chaque contrainte est la copie de la machine de `outreach-canonical.ts`.
  outreach_messages_channel_check: 'OUTREACH_MESSAGE_CHANNELS',
  // #3695/#3696 (lot K12) — le canal d'une version de brouillon (migration `1796436714681`).
  message_draft_versions_channel_check: 'MESSAGE_DRAFT_CHANNELS',
  engagement_drafts_channel_check: 'ENGAGEMENT_DRAFT_CHANNELS',
  outreach_messages_intent_check: 'OUTREACH_INTENTS',
  outreach_messages_source_check: 'OUTREACH_SURFACES',
  outreach_messages_status_check: 'OUTREACH_MESSAGE_STATUSES',
  // #4016 L5 — la portée d'un mandat d'envoi et celle sous laquelle un message l'attend
  // (migration `1796440003417`), copie de `DELEGATION_SCOPES` (`outreach-delegation.ts`).
  outreach_delegations_scope_check: 'DELEGATION_SCOPES',
  // Lot L-D1 (#4167, migration `1796540127394`) — les automatisations : copies de `AUTOMATION_*`
  // (`automation-rules.ts`) et des huit modèles de séquence (`OUTREACH_PLAYBOOK_KEYS`).
  automation_rules_signal_check: 'AUTOMATION_SIGNALS',
  automation_rules_action_kind_check: 'AUTOMATION_ACTION_KINDS',
  automation_rules_playbook_key_check: 'OUTREACH_PLAYBOOK_KEYS',
  automation_rules_prepared_action_check: 'AUTOMATION_PREPARED_ACTIONS',
  automation_rule_firings_outcome_check: 'AUTOMATION_OUTCOMES',
  // Théo C automations-editeur (migration `1796574823417`) — le journal des essais.
  automation_rule_trials_signal_check: 'AUTOMATION_SIGNALS',
  automation_rule_trials_target_check: 'AUTOMATION_TRIAL_TARGETS',
  automation_rule_trials_outcome_check: 'AUTOMATION_TRIAL_OUTCOMES',
  outreach_messages_mandate_scope_check: 'DELEGATION_SCOPES',
  outreach_message_versions_kind_check: 'OUTREACH_MESSAGE_VERSION_KINDS',
  outreach_call_tasks_source_check: 'OUTREACH_SURFACES',
  outreach_call_tasks_status_check: 'OUTREACH_CALL_TASK_STATUSES',
  outreach_transitions_subject_kind_check: 'OUTREACH_TRANSITION_SUBJECTS',
  outreach_transitions_actor_kind_check: 'OUTREACH_ACTOR_KINDS',
  outreach_transitions_result_check: 'OUTREACH_TRANSITION_RESULTS',
  // #2909 (#2378.2, migration `1796321999085-OutreachStepEngagementSignal.ts`)
  // — le déclencheur par ouverture/clic, rapporté par le commercial (jamais un
  // pixel ni un lien réécrit — aucune preuve d'envoi, GA-26 réutilise
  // `outreach-sequence.ts`).
  outreach_sequence_steps_engagement_signal_check: 'OUTREACH_ENGAGEMENT_SIGNALS',
  // Lot L-B (#4165, migration `1796489437261`) — les natures d'étape (LinkedIn et appel ajoutés) et l'unité des délais.
  outreach_sequence_steps_kind_check: 'outreachStepKindSchema',
  outreach_sequences_delay_unit_check: 'OUTREACH_DELAY_UNITS',
  // #2369.9/.10/.13 (épopée #2768, migrations `1796001519677` +
  // `1796001544070`) — le socle de la mémoire de style. Le canal réutilise
  // EXACTEMENT l'enum de l'outreach (GA-26, `message-style.ts`), jamais une copie.
  message_style_templates_channel_check: 'OUTREACH_MESSAGE_CHANNELS',
  message_style_templates_status_check: 'MESSAGE_STYLE_TEMPLATE_STATUSES',
  // #3417 (retour bêta 30/09, migration `1796409451317`) — la bibliothèque
  // versionnée des scripts et messages approuvés. Le canal réutilise
  // EXACTEMENT l'enum de l'outreach (GA-26), jamais une copie.
  outreach_approved_templates_channel_check: 'OUTREACH_MESSAGE_CHANNELS',
  outreach_approved_templates_scenario_check: 'APPROVED_TEMPLATE_SCENARIO_IDS',
  outreach_approved_templates_status_check: 'APPROVED_TEMPLATE_STATUSES',
  // #2369.6 (LOT j1 26/09, migration `1796321481500`) — la portée réutilise
  // EXACTEMENT l'enum de `memory-item.ts` (GA-26), jamais une copie.
  message_style_templates_scope_check: 'memoryItemScopeSchema',
  message_style_rule_proposals_signal_check: 'MESSAGE_STYLE_LEARNING_SIGNALS',
  message_style_rule_proposals_status_check: 'MESSAGE_STYLE_RULE_PROPOSAL_STATUSES',
  // #2385.1/#2385.5 (épopée #2877, migration `1796405091234`) — le snapshot de
  // règle apprise gagne le même geste de décision que `message_style_rule_
  // proposals` ci-dessus : `proposed` en naissant, `adopted`/`rejected` par un
  // geste humain explicite seul.
  message_learning_rule_proposal_snapshots_status_check: 'MESSAGE_LEARNING_RULE_SNAPSHOT_STATUSES',
  // #2369.2/.3 (LOT SOIR 26/09, migration `1796322001347`) — l'import pour
  // apprentissage : sa nature (sept valeurs) et sa source admise (quinze).
  message_style_imports_import_kind_check: 'MESSAGE_STYLE_IMPORT_KINDS',
  message_style_imports_source_type_check: 'MESSAGE_STYLE_SOURCE_TYPES',
  // Épopée #2947 (lot E07, 04/10, migration `1796430140701`) — variables d'un
  // message : confiance et usage externe permis.
  outreach_message_variables_confidence_check: 'OUTREACH_VARIABLE_CONFIDENCES',
  outreach_message_variables_external_use_check: 'OUTREACH_VARIABLE_EXTERNAL_USES',
  // Épopée #3289 (lot E14, 04/10, migration `1796427014010`) — jour des relances
  // de cadence : les cinq jours ouvrés de l'envoi.
  workspace_commercial_load_settings_cadence_weekday_check: 'SEND_TIMING_WEEKDAYS',
  // #2411.11 (reste, épopée #2881, migration `1796321507560`) — nommée pour
  // rester visible à GA-12 (voir GA-177) ; réutilise EXACTEMENT l'énumération
  // de `missionRiskSchema` (`mission.ts`), jamais une copie.
  mission_risk_resolutions_risk_check: 'missionRiskSchema',
  // #2403.12 (migration `1796349700419-TelephonyCallState.ts`) — nommée pour
  // rester visible à GA-12 (voir GA-177) ; réutilise EXACTEMENT l'énumération
  // de `callInProgressStateSchema` (`telephony.ts`), jamais une copie.
  telephony_call_states_state_check: 'callInProgressStateSchema',
  // #2770.63/.64/.65 (migration `1796412731846-FocusPlanBlockOutcomes.ts`) —
  // nommée pour rester visible à GA-12 (voir GA-177) ; les trois états
  // déclarés de la mesure post-bloc (`focus-plan.ts`).
  focus_plan_block_outcomes_outcome_check: 'FOCUS_PLAN_BLOCK_OUTCOMES',
  // #2120.61 / .64 / .68 — L'ISSUE D'UNE TENTATIVE D'ENRICHISSEMENT, et la
  // confiance des deux champs qu'elle remplit (migration `1795712351210`).
  // `ambiguous` et `newer_data_exists` ne sont pas des nuances de « rien
  // trouvé » : le premier dit qu'on a REFUSÉ d'écrire pour ne pas fusionner
  // deux personnes réelles, le second qu'une correction humaine protège la
  // valeur. Si la contrainte les ignorait, l'écriture lèverait une violation
  // avalée par le try/catch du pipeline — le commercial verrait « échec
  // d'enrichissement » sans jamais savoir que c'est une PROTECTION qui a joué.
  // #2777 — les deux natures d'un apprentissage retenu (objection / engagement),
  // écrites dans `account_memory` par la sortie `learnings` de la cascade
  // compte rendu.
  account_memory_kind_check: 'ACCOUNT_MEMORY_KINDS',
  contact_crm_exports_provider_check: 'CONTACT_CRM_EXPORT_PROVIDERS',
  // #4188 (migration `1796541495729-AccountCrmExports.ts`) — les comptes envoyés vers un CRM.
  account_crm_exports_provider_check: 'ACCOUNT_CRM_EXPORT_PROVIDERS',
  account_crm_exports_action_check: 'CONTACT_CRM_EXPORT_ACTIONS',
  contact_crm_exports_action_check: 'CONTACT_CRM_EXPORT_ACTIONS',
  contacts_last_enrichment_result_check: 'CONTACT_ENRICHMENT_RESULTS',
  // Théo B c1 — la DISPONIBILITÉ annoncée par la source, par champ : available | unknown | not_found.
  contacts_email_availability_check: 'CONTACT_AVAILABILITIES',
  contacts_phone_availability_check: 'CONTACT_AVAILABILITIES',
  // La confiance est une échelle NOMMÉE, jamais un pourcentage (aucune
  // PROBABILITÉ ne s'affiche). `null` = non mesurée, jamais « low » par défaut
  // (GA-18/19) — c'est pourquoi la contrainte admet NULL en plus des trois.
  contacts_email_confidence_check: 'CONTACT_FIELD_CONFIDENCE_LEVELS',
  contacts_phone_confidence_check: 'CONTACT_FIELD_CONFIDENCE_LEVELS',
  // #4178.1 — la nature d'un numéro et qui l'a posée.
  contacts_phone_nature_check: 'PHONE_NATURES',
  contacts_phone_nature_source_check: 'PHONE_NATURE_SOURCES',
  // #2155.17 / .19 / .20 — « Mes cibles » : priorité, statut de travail, provenance.
  target_list_items_priority_check: 'TARGET_PRIORITIES',
  target_list_items_work_status_check: 'TARGET_WORK_STATUSES',
  target_list_items_provenance_check: 'TARGET_PROVENANCES',
  // #3753 — la lettre du tier de l'ESN (A/B/C), importée telle quelle.
  target_list_items_tier_label_check: 'TARGET_TIER_LABELS',
  // #3756 — la lettre du tier portée par un modèle de séquence : la MÊME énumération A/B/C.
  sequence_templates_tier_label_check: 'TARGET_TIER_LABELS',
  // #2156.11 / .12 / .34 à .40 — le modèle d'une cible : statut, visibilité, source
  //   de la LISTE. La visibilité est une autorisation : une valeur qu'elle
  //   ignorerait rendrait une liste privée lisible — ou l'inverse, invisible à
  //   son auteur.
  target_lists_status_check: 'TARGET_LIST_STATUSES',
  target_lists_visibility_check: 'TARGET_LIST_VISIBILITIES',
  target_lists_source_check: 'TARGET_LIST_SOURCES',
  // #2293.3 / .6 — le lot d'analyses multi-comptes : source de la liste d'entrée
  //   et les huit états d'un sous-job.
  analysis_batches_source_check: 'ANALYSIS_BATCH_SOURCES',
  analysis_batch_items_state_check: 'ANALYSIS_BATCH_ITEM_STATES',
  // #3014 — l'amorçage de la première synchronisation : les trois états d'un
  //   run (`integration_sync_runs`, migration `1796321337841`).
  integration_sync_runs_status_check: 'SYNC_RUN_STATUSES',
  // #2284.67-.69 — la correction d'identité : « c'est bien celle-ci » / « ce n'est pas celle-ci ».
  entity_resolution_corrections_decision_check: 'ENTITY_RESOLUTION_CORRECTION_DECISIONS',
  // #2159.35 — la correction de rapprochement de contact : « c'est bien la même personne » / « ce n'est pas elle ».
  contact_resolution_corrections_decision_check: 'CONTACT_RESOLUTION_CORRECTION_DECISIONS',
  // LA MÉMOIRE COLLECTIVE (01/09/2026) — les quatre natures de croisement.
  workspace_bridge_contacts_kind_check: 'MEMORY_CROSSING_KINDS',
  access_facts_kind_check: 'ACCESS_FACT_KINDS',
  impersonation_audit_reason_code_check: 'IMPERSONATION_REASON_CODES',
  backoffice_access_events_event_check: 'BACKOFFICE_ACCESS_EVENTS',
  // LE JOURNAL D'AUDIT UNIQUE (#1666). La catégorie n'est pas une étiquette :
  // elle DÉCIDE de la rétention (24 mois / 36 mois / permanent). Une valeur que
  // la contrainte ignorerait tomberait dans aucune fenêtre, et vivrait pour
  // toujours sans que personne l'ait décidé.
  backoffice_audit_events_category_check: 'BACKOFFICE_AUDIT_CATEGORIES',
  backoffice_audit_events_outcome_check: 'BACKOFFICE_AUDIT_OUTCOMES',
  /** #2438.3 — l'audit serveur de chaque appel d'outil de chat, ÉCRIT PAR
   *  L'IA (`apps/ia/app/services/tool_call_audit.py`), même patron que
   *  `rag_documents` (`1767225600000-Init.ts`) : le schéma appartient à
   *  l'API (GA-11/GA-12), mais aucune énumération TypeScript ne consomme
   *  `done`/`error` côté API — rien à mapper sans en inventer une. */
  ai_tool_call_audit_log_status_check: null,
  /** Lot ED — l'échantillon de coût d'un tour de /chat (`chat_turn_cost_samples`,
   *  migration `1796405100123-ChatTurnCostSamples`) : `tier` (`fast` / `deep`)
   *  n'est typé que par une union en ligne dans `ChatTurnCostSampleEntity`,
   *  aucune énumération TypeScript exportée — rien à mapper sans en inventer une. */
  chat_turn_cost_samples_tier_check: null,
  /** #2439.15 — l'audit de chaque export RGPD (`privacy_export_audit_log`,
   *  migration `1796321386200-PrivacyExportAuditLog`) : `kind` (`full` /
   *  `object`) vit dans la colonne comme un `text`, exactement comme
   *  `ai_tool_call_audit_log_status_check` ci-dessus — rien à mapper sans en
   *  inventer une. */
  privacy_export_audit_log_kind_check: null,
  /** #2445.12 — le journal des TRANSITIONS de connecteur
   *  (`connector_capability_incidents`, migration
   *  `1796344355019-ConnectorCapabilityIncidents`) : `transition` est un
   *  vocabulaire interne à deux valeurs (`degraded`/`recovered`), écrit et lu
   *  par le même service (`ConnectorProbeService`), jamais consommé par un
   *  contrat `@bellum/contracts` — rien à mapper sans en inventer une. */
  connector_capability_incidents_transition_check: null,
  /** #2445.12 (épopée #2766, lot SRC5 28/09 soir) — le journal append-only
   *  des actions/communications d'un incident (`connector_capability_incident_logs`,
   *  migration `1796349930000-ConnectorCapabilityIncidentLogs`) : `kind` est un
   *  vocabulaire interne à deux valeurs, écrit et lu par le même service
   *  (`ConnectorIncidentOpsService`), jamais consommé par un contrat
   *  `@bellum/contracts` — même raison que `connector_capability_incidents_transition_check` juste au-dessus. */
  connector_capability_incident_logs_kind_check: null,
  /** #219.8 (LAU-FINAL-219, #3231, migration `1796376150639-ContactDeclaredPersonCompanyRelation`) :
   *  les treize valeurs de la relation personne–entreprise DÉCLARÉE vivent dans
   *  l'énumération Python `PersonCompanyRelation`
   *  (`apps/ia/app/services/person_company_relation.py`), qui la lit ; côté API
   *  la colonne est un `string | null` (`contact.entity.ts`) qu'aucune
   *  énumération TypeScript ne consomme — rien à mapper sans en inventer une. */
  contacts_declared_person_company_relation_check: null,
  /** #219.6 (#3231, lot X50, migration `1796424417731-AccountDeclaredInternalClientMode`) :
   *  la déclaration « client interne » du compte — même vocabulaire que Python. */
  accounts_declared_internal_client_mode_check: 'INTERNAL_CLIENT_MODES',
  // #2076.9-.12 — le vocabulaire NEUF de justesse d'une première analyse
  // (juste/partiel/faux/manquant), AJOUTÉ EN FIN (GA-08) à celui d'utilité
  // déjà présent (utile/inutile/faux/obsolete), même colonne (GA-26).
  account_feedback_verdict_check: 'ACCOUNT_FEEDBACK_VERDICTS',
  account_feedback_reuse_scope_check: 'FEEDBACK_REUSE_SCOPES',
  submission_feedback_reuse_scope_check: 'FEEDBACK_REUSE_SCOPES',
  beta_feedback_reuse_scope_check: 'FEEDBACK_REUSE_SCOPES',
  // #2335.5 — même vocabulaire de verdict que `submission_feedback`
  // (`unknown`/`below`/`meets`/`above`), sur la table SÉPARÉE du retour
  // consultant : un seul langage, jamais un second à côté de celui qui existe.
  submission_consultant_feedback_verdicts_check: 'FEEDBACK_VERDICTS',
  // #2335.1 — les seize sous-statuts ADDITIFS d'un positionnement, chacun
  // retombant sur une étape existante (`SUBSTATUS_TO_STAGE`) — pas un
  // remplacement de `SubmissionStage` (douze appelants en production).
  submissions_substatus_check: 'SUBMISSION_SUBSTATUSES',
  // #1953.11 / #1953.22 — la nature d'une branche de conversation (réessai, autre
  // angle, demande modifiée). Elle voyage du navigateur vers la colonne
  // `chat_messages.branch_kind` : la contrainte et l'énumération TypeScript ne
  // peuvent pas diverger sans qu'une des deux écrive une valeur que l'autre refuse.
  chat_messages_branch_kind_check: 'CHAT_BRANCH_KINDS',
  // #1919 — les retours d'une personne sur les réponses de Laura.
  chat_reply_feedback_verdict_check: 'REPLY_FEEDBACK_VERDICTS',
  chat_reply_feedback_reason_check: 'REPLY_FEEDBACK_REASONS',
  chat_reply_feedback_correction_scope_check: 'REPLY_FEEDBACK_CORRECTION_SCOPES',
  chat_reply_feedback_reuse_scope_check: 'FEEDBACK_REUSE_SCOPES',
  playbook_sends_state_check: 'PLAYBOOK_SEND_STATES',
  access_fact_questions_moment_check: 'ACCESS_QUESTION_MOMENTS',
  opportunities_access_mode_check: 'ACCESS_MODES',
  org_graph_corrections_object_type_check: 'ORG_CORRECTION_OBJECT_TYPES',
  org_graph_corrections_field_check: 'ORG_CORRECTION_FIELDS',
  // #2126.36 / .37 / .39 — motif, portée, visibilité d'une correction.
  org_graph_corrections_motive_check: 'ORG_CORRECTION_MOTIVES',
  org_graph_corrections_scope_check: 'ORG_CORRECTION_SCOPES',
  org_graph_corrections_visibility_check: 'ORG_CORRECTION_VISIBILITIES',
  org_enrichment_jobs_mode_check: 'ORG_ENRICHMENT_TARGET_MODES',
  org_enrichment_jobs_status_check: 'ORG_ENRICHMENT_JOB_STATUSES',
  access_facts_provenance_check: 'EVIDENCE_FIELD_SOURCES',
  account_entities_kind_check: 'ACCOUNT_ENTITY_KINDS',
  account_entities_rank1_check: 'RANK1_INCUMBENT_VALUES',
  /** QUI a confirmé l'identité légale d'une entité du client (31/08/2026).
   *  Liste volontairement COURTE — « le modèle l'a proposé » n'y est pas, et
   *  l'y ajouter exigerait d'élargir la contrainte AVANT le code. */
  account_entities_identity_source_check: 'ACCOUNT_ENTITY_IDENTITY_SOURCES',
  /** #2172.42-.49 — les sept motifs d'écartement d'une piste à qualifier. */
  qualification_lead_decisions_reason_check: 'LEAD_DISMISS_REASONS',
  /** Deux valeurs écrites EN LIGNE (`z.enum(['dismissed', 'snoozed'])` du corps
   *  de décision) : écarter et mettre en veille ne forment pas une taxonomie
   *  qui voyage, elles nomment les deux gestes de CETTE table. */
  qualification_lead_decisions_decision_check: null,
  /** #4114.4 — deux gestes de CETTE table (« ce sont les mêmes » / « pas les mêmes »),
   *  écrits en ligne (`DuplicateDecision` du service) : pas une taxonomie qui voyage. */
  contact_duplicate_decisions_decision_check: null,
  // ⚠️ `qualification_lead_decisions_scope_check` (`scope = 'workspace'`) et
  //    `…_shape_check` (un motif pour un écartement, une échéance pour une
  //    veille) ne figurent PAS ici : elles ne portent aucune liste `IN (…)`,
  //    donc l'extracteur ne les voit pas — les déclarer les rendrait périmées.
  account_partners_certainty_check: 'ESN_PRESENCE_CERTAINTIES',
  account_partners_rank_check: 'PARTNER_RANKS',
  account_partners_relationship_check: 'PARTNER_RELATIONSHIPS',
  action_dispatch_attempts_status_check: 'actionDispatchStatusSchema',
  esn_directory_resolution_status_check: 'ESN_RESOLUTION_STATUSES',
  partner_relations_stage_check: 'PARTNER_STAGES',
  esn_directory_relation_to_parent_check: 'ESN_PARENT_RELATIONS',
  esn_directory_hierarchy_confidence_check: 'ESN_HIERARCHY_CONFIDENCES',
  esn_directory_domain_status_check: 'ESN_DOMAIN_STATUSES',
  esn_directory_risk_flag_check: 'ESN_RISK_FLAGS',
  esn_directory_open_to_subcontracting_check: 'ESN_SUBCONTRACTING_OPENNESS',
  esn_directory_subcontracting_confidence_check: 'ESN_SUBCONTRACTING_CONFIDENCES',
  esn_directory_public_exposure_check: 'ESN_PUBLIC_EXPOSURES',
  rag_documents_origin_check: 'RAG_ORIGINS',
  // #1954.7 — un document joint au chat sert au FIL par défaut, jamais à
  // l'espace entier sans choix explicite (migration
  // 1792800004817-RagDocumentConversationScope).
  rag_documents_scope_check: 'RAG_DOCUMENT_SCOPES',
  // #2861 (#2437.2, migration `1796322770000-RagDocumentLanguage.ts`) — le
  // niveau SOURCE, même catalogue que `contacts.locale` / `contacts_locale_check`
  // (GA-26, `marketLocaleValues`).
  rag_documents_language_check: 'marketLocaleValues',
  // #3669.2 (migration `1796433906070`) — le statut de traitement par document.
  rag_documents_processing_status_check: 'RAG_PROCESSING_STATUSES',
  contacts_email_send_state_check: 'CONTACT_SEND_STATES',
  contacts_email_send_channel_check: 'CONTACT_SEND_CHANNELS',
  accounts_origin_check: 'ACCOUNT_ORIGINS',
  accounts_bet_horizon_check: 'BET_HORIZONS',
  accounts_bet_size_check: 'BET_SIZES',
  accounts_bet_access_check: 'BET_ACCESSES',
  accounts_sprint_check: 'SPRINT_LEVELS',
  accounts_priority_gate_check: 'PRIORITY_GATES',
  accounts_status_check: 'analysisStatusSchema',
  /** #2165.24 — rôle d'un compte dans son groupe (lot groupes et filiales).
   *  Deux valeurs écrites EN LIGNE (`groupRole: z.enum(['groupe', 'filiale'])`
   *  de `discover.ts`) : elles nomment la place d'un compte dans SON groupe et
   *  ne voyagent pas ailleurs. Le « any » du rail web est un filtre, jamais une
   *  valeur stockée. */
  accounts_group_role_check: null,
  action_plan_items_execution_status_check: 'actionExecutionStatusSchema',
  // #2395.4 — le canal (téléphone/e-mail/LinkedIn/réunion) déjà écrit par le
  // plan de Laura, désormais posé à l'écriture (migration
  // `1796001457744-ActionPlanItemChannel`, vague 32).
  action_plan_items_channel_check: 'PLAN_ACTION_CHANNELS',
  // #2123.1-.10 — l'objet canonique visé par une action du plan.
  action_plan_items_target_kind_check: 'ACTION_TARGET_KINDS',
  // #2123.29-.30 — la provenance d'une action réutilise le vocabulaire de
  // `provenance.ts` (GA-26) ; la confiance a le sien, et NULL y veut dire
  // « non mesurée », jamais « faible ».
  action_plan_items_source_check: 'EVIDENCE_FIELD_SOURCES',
  action_plan_items_confidence_check: 'ACTION_CONFIDENCE_LEVELS',
  activities_call_outcome_check: 'CALL_OUTCOMES',
  activities_channel_check: 'REMINDER_CHANNELS',
  activities_link_reason_check: 'ACTIVITY_LINK_REASONS',
  activities_verdict_check: 'ACTIVITY_VERDICTS',
  activities_direction_check: 'ACTIVITY_DIRECTIONS',
  activities_kind_check: 'ACTIVITY_KINDS',
  activities_source_check: 'ACTIVITY_SOURCES',
  admin_docs_connections_provider_check: 'adminDocsProviderSchema',
  chain_runs_state_check: 'CHAIN_RUN_STATES',
  consultant_documents_kind_check: 'TALENT_DOCUMENT_KINDS',
  // #3935 (lot P03, 09/10) — la précision d'une date d'expérience lue dans un
  // CV (`year` / `month`) ; NULL = date lue telle qu'elle est stockée.
  consultant_experiences_date_debut_precision_check: 'EXPERIENCE_DATE_PRECISIONS',
  consultant_experiences_date_fin_precision_check: 'EXPERIENCE_DATE_PRECISIONS',
  consultant_skills_level_check: 'SKILL_LEVELS',
  consultant_skills_source_check: 'SKILL_SOURCES',
  // #2328.6 — `validated_level` reprend EXACTEMENT le domaine de `level`
  // (migration 1796321376451-ConsultantSkillEvidence) : même énumération,
  // NULL en plus pour « jamais validé ».
  consultant_skills_validated_level_check: 'SKILL_LEVELS',
  consultants_availability_check: 'CONSULTANT_AVAILABILITIES',
  consultants_contract_check: 'CONSULTANT_CONTRACTS',
  consultants_engagement_check: 'ENGAGEMENT_KINDS',
  consultants_kind_check: 'TALENT_KINDS',
  consultants_remote_check: 'REMOTE_PREFERENCES',
  consultants_travel_check: 'TRAVEL_ACCEPTANCES',
  consultants_review_status_check: 'TALENT_REVIEW_STATUSES',
  contacts_source_check: 'contactSourceSchema',
  // Trouvée par l'élargissement du 30/08/2026 — la dernière déclaration
  // (1782700000000-AddProcurementDecisionRole.ts) s'écrit `= ANY (ARRAY[…])`,
  // pas `IN (…)`.
  contacts_decision_role_check: 'decisionRoleSchema',
  // #2861 (#2437.2, migration `1796321999830-ContactLocale.ts`) — le niveau
  // DESTINATAIRE, même catalogue que `workspace.defaultLocale` (GA-26,
  // `marketLocaleSchema` = `z.enum(marketLocaleValues)` : la garde lit la
  // valeur `as const`, pas l'alias `z.enum`).
  contacts_locale_check: 'marketLocaleValues',
  custom_field_defs_entity_check: 'CUSTOM_FIELD_ENTITIES',
  custom_field_defs_type_check: 'CUSTOM_FIELD_TYPES',
  cv_versions_anonymisation_check: 'ANONYMISATION_RULES',
  cv_versions_kind_check: 'CV_VERSION_KINDS',
  decision_gate_crossings_decision_check: 'GATE_DECISIONS',
  decision_gate_crossings_gate_check: 'DECISION_GATES',
  decision_gate_crossings_subject_check: 'GATE_SUBJECTS',
  duplicate_pairs_decision_check: 'DUPLICATE_DECISIONS',
  // #4016 L6 — le pipe « détecté, à revoir » (migration `1796440171265`).
  pipeline_detections_kind_check: 'PIPELINE_DETECTION_KINDS',
  pipeline_detections_status_check: 'PIPELINE_DETECTION_STATUSES',
  duplicate_pairs_entity_check: 'SYNC_ENTITY_TYPES',
  field_provenance_source_check: 'FLOW_PROVENANCES',
  import_sessions_state_check: 'IMPORT_SESSION_STATES',
  import_sessions_resume_outcome_check: 'DISPATCH_FAILURE_OUTCOMES',
  interventions_kind_check: 'INTERVENTION_KINDS',
  interventions_state_check: 'INTERVENTION_STATES',
  interventions_subject_check: 'INTERVENTION_SUBJECTS',
  interviews_mode_check: 'INTERVIEW_MODES',
  mission_terms_cadence_check: 'BILLING_CADENCES',
  // ORION V12 (31/08/2026) — successeur de DATAFORGE V10. Neuf valeurs
  // mesurées sur les 1 195 lignes de 10_COMPTES_MASTER.csv.
  dataforge_account_statuses_statut_code_check: 'ORION_ACCOUNT_STATUT_CODES',
  dataforge_data_anomalies_severite_check: 'ORION_ANOMALY_SEVERITIES',
  // #4281.1 (19/10/2026) — besoins historiques DataForge structurés.
  dataforge_needs_status_check: 'DATAFORGE_NEED_STATUSES',
  dataforge_needs_source_file_check: 'DATAFORGE_NEED_SOURCE_FILES',
  // Le vocabulaire DÉJÀ en place pour « une correction humaine gagne toujours »
  // (`decideFieldWrite`) — même mapping que `access_facts_provenance_check`.
  // #4016 L4 (11/10/2026) — `EVIDENCE_FIELD_SOURCES` : la finance, les retours
  // de mission, les faits d'accès et les actions du plan n'acceptent JAMAIS la
  // provenance `inferred` (une estimation) ; seules `field_provenance` et
  // `record_field_audit` l'acceptent (migration `1796440200813`).
  mission_expenses_source_check: 'EVIDENCE_FIELD_SOURCES',
  supplier_invoices_source_check: 'EVIDENCE_FIELD_SOURCES',
  // #2412 — le double pouls de satisfaction (client/consultant). Même
  // mapping que `mission_expenses_source_check` juste au-dessus pour la
  // source ; `rail` a son propre vocabulaire, JAMAIS un troisième rail
  // « global » qui fusionnerait les deux (`mission-feedback.ts`).
  mission_feedback_rail_check: 'MISSION_FEEDBACK_RAILS',
  mission_feedback_source_check: 'EVIDENCE_FIELD_SOURCES',
  // #2408.16 (L15, migration `1796610003098`) — le niveau déclaré d'une entrée.
  mission_feedback_level_check: 'MISSION_SATISFACTION_LEVELS',
  // Le cycle de vie de la facture ENTRANTE d'un sous-traitant — distinct de
  // `invoice_readiness` (la facturation CLIENT), qui ne partage pas cet enum.
  supplier_invoices_status_check: 'SUPPLIER_INVOICE_STATUSES',
  // #2196.31 — la nature d'une exception de relevé (« non applicable »).
  mission_timesheet_exceptions_kind_check: 'TIMESHEET_EXCEPTION_KINDS',
  /** #2419.1 — la source d'un paiement : `manual` seul, écrit en dur par
   *  `InvoicePaymentsService` (une seule valeur, aucune énumération TS à
   *  suivre). Une seconde source élargira la contrainte AVANT son code. */
  invoice_payments_source_check: null,
  // #2417.3/.4/.5 — la source d'une déclaration de facturation (decisions §8).
  mission_milestones_source_check: 'BILLING_DECLARATION_SOURCES',
  mission_billing_declarations_source_check: 'BILLING_DECLARATION_SOURCES',
  /** #2407.4 — le mode de travail d'une affectation : `z.enum` inline des deux
   *  schémas d'affectation (`staffing.ts`), aucune constante exportée à suivre. */
  mission_assignments_remote_mode_check: null,
  // #2407.6 — le statut d'une affectation (decisions §9).
  mission_assignments_status_check: 'ASSIGNMENT_STATUSES',
  // #2423 — les seize types d'événement d'un avenant de mission.
  mission_amendments_event_type_check: 'MISSION_AMENDMENT_EVENT_TYPES',
  // #2423 — les cinq statuts d'un avenant (proposé/accepté/actif/rejeté/annulé).
  mission_amendments_status_check: 'MISSION_AMENDMENT_STATUSES',
  // #2423.7 — les quatre causes de pause distinguées explicitement, colonne
  // NULLABLE (aucune pause hors d'un avenant `pause_start`).
  mission_amendments_pause_cause_check: 'MISSION_PAUSE_CAUSES',
  // #2422.4 (épopée #2869) — le contrat juridique typé : neuf types, trois
  // statuts déclarés. `source` et `paiement` RÉUTILISENT les taxonomies déjà
  // élargies de `staffing.ts` (GA-26 : un réglage vit à un seul endroit).
  legal_contracts_type_check: 'LEGAL_CONTRACT_TYPES',
  legal_contracts_status_check: 'LEGAL_CONTRACT_STATUSES',
  legal_contracts_source_check: 'MISSION_CHANNELS',
  legal_contracts_payment_terms_basis_check: 'PAYMENT_TERMS_BASES',
  /** #2407.5/.6 — le sujet et le sens d'une transition journalisée : deux
   *  valeurs chacun, écrites en dur par `journalStatusTransition`. */
  mission_status_transitions_subject_check: null,
  mission_status_transitions_direction_check: null,
  // #2338 / #2409 — les prérequis de démarrage DÉCLARÉS (geste humain).
  mission_start_checks_item_key_check: 'MISSION_START_DECLARED_KEYS',
  // Épopée #2880 (lot V33, migration `1796350700361`) — le croisement
  // expertise ↔ fondement/preuve : chaque CHECK copie une énumération de
  // `expertise-grounding.ts` (GA-26).
  expertise_groundings_kind_check: 'EXPERTISE_GROUNDING_KINDS',
  expertise_groundings_state_check: 'EXPERTISE_GROUNDING_STATES',
  expertise_groundings_state_source_check: 'EXPERTISE_GROUNDING_STATE_SOURCES',
  expertise_groundings_source_type_check: 'EXPERTISE_GROUNDING_SOURCE_TYPES',
  expertise_groundings_confidentiality_check: 'EXPERTISE_REFERENCE_CONFIDENTIALITIES',
  // #2414 (LAU-FINAL-128) / épopée #2986 — motif typé, checklist de sortie,
  // mission interrompue (migration `1796321339461`).
  missions_end_reason_check: 'MISSION_END_REASONS',
  // #3547 (lot X35, 02/10) — le forfait encadré : le mode de réalisation et le rôle tenu.
  missions_delivery_mode_check: 'DELIVERY_MODES',
  project_needs_delivery_mode_check: 'DELIVERY_MODES',
  missions_supervision_role_check: 'SUPERVISION_ROLES',
  project_needs_supervision_role_check: 'SUPERVISION_ROLES',
  // #4270.1 (18/10) — le profil d'espace « forfait / conseil » (migration `1796560286663`).
  esn_profiles_workspace_profile_check: 'WORKSPACE_PROFILES',
  mission_end_checks_item_key_check: 'MISSION_END_CHECK_KEYS',
  mission_interruptions_responsibility_check: 'MISSION_INTERRUPTION_RESPONSIBILITIES',
  mission_interruptions_risk_check: 'MISSION_INTERRUPTION_RISKS',
  // #3269 (BEL-SC-240) — les six jalons de delivery déclarés qu'aucun objet
  // canonique existant ne couvre (migration `1796373791268`).
  mission_delivery_milestones_item_key_check: 'DECLARED_MISSION_DELIVERY_MILESTONE_KINDS',
  // La CESSION de créance (31/08/2026). Deux énumérations distinctes : un
  // CONTRAT d'affacturage vit ou s'arrête, une CESSION suit un cycle qui va de
  // « préparée » à « réglée » — et les fondre en une seule ferait qu'un contrat
  // suspendu et une créance reprise porteraient le même mot.
  factoring_contracts_status_check: 'FACTORING_CONTRACT_STATES',
  receivable_assignments_status_check: 'RECEIVABLE_ASSIGNMENT_STATES',
  // LES NOTES DE FRAIS (31/08/2026). Les états d'un DOSSIER de frais ne
  // partagent aucun enum avec `supplier_invoices` : celle-là dit « devons-nous
  // payer une SOCIÉTÉ », celle-ci « remboursons-nous une PERSONNE ».
  //
  // ⚠️ La liste est passée de TROIS à QUATRE le 31/08/2026 : `draft` a été
  // ajouté EN FIN quand le chemin de dépôt a existé pour l'écrire
  // (`1791005000001-ExpenseReportDraftStatus`, qui élargit le `CHECK` AVANT le
  // code). C'est exactement le geste que cette garde existe pour rendre
  // obligatoire — la valeur en TypeScript et la contrainte en base ne peuvent
  // plus diverger sans que la CI le dise.
  expense_reports_status_check: 'EXPENSE_REPORT_STATUSES',
  // La MÊME liste de douze catégories tient les deux tables : une ligne de
  // frais et le plafond qui la juge doivent parler le même vocabulaire, sinon
  // un plafond ne s'appliquerait à rien sans que rien ne le dise.
  expense_report_lines_category_check: 'EXPENSE_CATEGORIES',
  expense_policy_caps_category_check: 'EXPENSE_CATEGORIES',
  expense_policies_basis_check: 'EXPENSE_REIMBURSEMENT_BASES',
  // Le paiement SORTANT vers le consultant (31/08/2026). Son cycle est le
  // TROISIÈME de la famille et ne partage aucune valeur avec les deux autres :
  // `invoice_readiness` répond à « sommes-nous prêts à ÉMETTRE »,
  // `supplier_invoices` à « devons-nous PAYER cette facture », et celui-ci à
  // « où en est le paiement qu'on doit ». Trois questions, trois enums.
  outgoing_payments_status_check: 'OUTGOING_PAYMENT_STATUSES',
  outgoing_payments_source_check: 'EVIDENCE_FIELD_SOURCES',
  notification_preferences_email_language_check: 'EMAIL_LANGUAGES',
  opportunities_outcome_check: 'PROJECT_OUTCOMES',
  // L2 Pipe (14/10/2026) — la catégorie déclarée, et les champs du journal des changements.
  opportunities_forecast_category_check: 'FORECAST_CATEGORIES',
  opportunity_field_changes_field_check: 'OPPORTUNITY_JOURNALED_FIELDS',
  project_needs_provenance_check: 'NEED_PROVENANCES',
  project_needs_source_check: 'NEED_SOURCES',
  project_needs_urgency_check: 'NEED_URGENCIES',
  // L'assistant de création en quatre étapes (08-creer-un-besoin.png,
  // migration `1790975000001-NeedOriginChannelCertifications.ts`).
  project_needs_origin_check: 'NEED_ORIGINS',
  project_needs_channel_check: 'NEED_CHANNELS',
  // #2939 (#2174.34) — LES ACHATS. Migration
  // `20260927183242-NeedDecisionProcessAndProcurement.ts`.
  project_needs_procurement_involvement_check: 'NEED_PROCUREMENT_INVOLVEMENTS',
  // #2173.29 — RÉUTILISE (GA-26) l'énumération du télétravail consultant/
  // mission plutôt que d'en poser une nouvelle pour la même idée.
  project_needs_remote_check: 'REMOTE_PREFERENCES',
  // #2191.17 — repris du besoin (`project_needs_remote_check` juste au-dessus),
  // même énumération, même raison : pas une cinquième pour la même idée.
  missions_remote_preference_check: 'REMOTE_PREFERENCES',
  // Les documents et les étapes de la fiche besoin (02-fiche-besoin.png,
  // migrations `1790974000001-NeedDocuments.ts` et `1790974000002-NeedSteps.ts`).
  need_documents_kind_check: 'NEED_DOCUMENT_KINDS',
  need_documents_status_check: 'NEED_DOCUMENT_STATUSES',
  // #2171.24 (épopée #2951) — l'équivalent, côté OPPORTUNITÉ, de
  // `need_documents` juste au-dessus (migration `1796321404173-ProjectDocuments`).
  project_documents_kind_check: 'PROJECT_DOCUMENT_KINDS',
  project_documents_status_check: 'PROJECT_DOCUMENT_STATUSES',
  // #2193.51 (épopée #2953) — l'équivalent, côté MISSION, de `project_documents`
  // juste au-dessus (migration `1796366184213-MissionDocuments`).
  mission_documents_kind_check: 'MISSION_DOCUMENT_KINDS',
  mission_documents_status_check: 'MISSION_DOCUMENT_STATUSES',
  storage_objects_domain_check: 'STORAGE_DOMAINS',
  need_steps_status_check: 'NEED_STEP_STATUSES',
  // #2838 — le catalogue de la bibliothèque d'assets outreach (migration
  // `1796001543063-OutreachAssets`) : la nature de l'asset et ses droits d'usage.
  outreach_assets_category_check: 'OUTREACH_ASSET_CATEGORIES',
  outreach_assets_usage_rights_check: 'OUTREACH_ASSET_USAGE_RIGHTS',
  // #3427 — la bibliothèque versionnée d'exemples commerciaux (migration
  // `1796409491877-MessageLibraryEntries`) : canal, scénario et persona
  // reprennent EXACTEMENT le registre partagé `outreach-scenarios.ts` (GA-26),
  // statut et mode viennent de `message-library.ts`.
  message_library_entries_channel_check: 'OUTREACH_CHANNELS',
  message_library_entries_scenario_check: 'OUTREACH_SCENARIO_IDS',
  message_library_entries_persona_check: 'OUTREACH_PERSONAS',
  message_library_entries_status_check: 'MESSAGE_LIBRARY_STATUSES',
  message_library_entries_mode_check: 'MESSAGE_LIBRARY_MODES',
  // Journal des traces (migration `1796419034517-MessageLibraryTraces`) :
  // `kind` et `decision` ne sont typés que par des unions en ligne dans
  // `MessageLibraryTraceEntity`, aucune énumération TypeScript exportée — rien à
  // mapper sans en inventer une (même cas que `chat_turn_cost_samples_tier_check`).
  message_library_traces_decision_check: null,
  message_library_traces_kind_check: null,
  // #2171.22 — PROJECT_STEP_STATUSES (project-step.ts) est un ALIAS de
  // NEED_STEP_STATUSES (garde GA-26 : un réglage vit à un seul endroit), donc
  // il ne matche pas le motif `export const X = [...] as const` que ce fichier
  // scanne — c'est bien le même tableau littéral qui est vérifié ici.
  project_steps_status_check: 'NEED_STEP_STATUSES',
  // Les conditions de règlement du panneau de planification
  // (07-planification-missions.png, migration `1790981000002`) : « à 45 jours »
  // ne veut pas dire la même chose selon qu'on compte depuis la date de facture
  // ou depuis la fin du mois — d'où une BASE, et non un simple nombre de jours.
  chk_mission_commercial_terms_payment_terms_basis: 'PAYMENT_TERMS_BASES',
  // #2420 — la source du coût du moteur de marge (migration `1795340000001`).
  chk_mission_commercial_terms_cost_source: 'MISSION_COST_SOURCES',
  signal_history_importance_check: 'signalImportanceSchema',
  submissions_reason_check: 'SUBMISSION_OUTCOME_REASONS',
  laura_interventions_format_check: 'INTERVENTION_FORMATS',
  laura_interventions_reaction_check: 'INTERVENTION_REACTIONS',
  interviews_outcome_check: 'INTERVIEW_OUTCOMES',
  invoice_readiness_state_check: 'INVOICE_READINESS_STATES',
  linkedin_interactions_kind_check: 'linkedinInteractionKindSchema',
  linkedin_send_log_status_check: 'linkedinSendStatusSchema',
  // #2288.2 — les deux issues d'une vérification à la demande. Pas d'« échec » :
  // un temps dépassé rend « inconnu » et arrête la reprise.
  market_verification_receipts_outcome_check: 'MARKET_VERIFICATION_OUTCOMES',
  mail_send_batches_mode_check: 'mailBatchModeSchema',
  // #2104.6/.7/.8 (migration `1795997455604-MailThreadMarks`) — la décision
  // manuelle sur un fil (traité / non pertinent). `MailThreadMarkState`
  // (`mail-priority.ts`) est un type PRIVÉ, jamais exporté (il ne sert qu'au
  // calcul de priorité dans son propre fichier) : deux valeurs écrites EN
  // LIGNE, pas une taxonomie qui voyage.
  //
  // Théo B M1.N1 (22/10/2026) — l'exemption datée est LEVÉE : la marque voyage vraiment du code vers la base
  // (`archived` s'écrit), elle a donc un schéma partagé nommé.
  mail_thread_marks_state_check: 'mailThreadMarkSchema',
  // Théo M2 — envoi programmé — les cinq statuts (migration `1796574800003`), contrainte posée avant le code.
  scheduled_message_sends_status_check: 'SCHEDULED_SEND_STATUSES',
  // Théo D settings-outils.N1 — le cadre d'un accès futur (migration `1796575036047`), contraintes posées avant le code.
  mcp_access_intents_status_check: 'MCP_ACCESS_INTENT_STATUSES',
  mcp_access_intents_perimeter_check: 'MCP_ACCESS_INTENT_PERIMETERS',
  // Théo C talents-recrutement — les cinq étapes de recrutement (migration `1796575013276`), contrainte posée avant le code.
  talent_recruitment_events_stage_check: 'RECRUITMENT_STAGES',
  memory_pinned_facts_kind_check: 'memoryItemKindSchema',
  memory_pinned_facts_origin_check: 'memoryItemOriginSchema',
  // #1918.1 — la portée « moi uniquement » (migration `1792800070000`).
  memory_pinned_facts_scope_check: 'memoryItemScopeSchema',
  // #1916.23 — les gestes journalisés sur un élément (migration `1792800150613`).
  memory_fact_events_event_check: 'MEMORY_ITEM_EVENTS',
  // #1916.24 — où la réponse a été produite (migration `1792800170859`).
  chat_reply_memory_uses_surface_check: 'MEMORY_SURFACES',
  mission_terms_channel_check: 'MISSION_CHANNELS',
  mission_timesheets_status_check: 'TIMESHEET_STATUSES',
  missions_contract_kind_check: 'CONTRACT_KINDS',
  // #2195.22 à .29 — OÙ EN EST LA RECONDUCTION, saisi par un humain (migration
  //   `1795100000001`). À ne pas confondre avec `missions_status_check` juste
  //   en dessous : celui-là est le statut de la MISSION, celui-ci celui de sa
  //   reconduction. Les deux vivent sur la même ligne et ne se recouvrent pas.
  missions_renewal_status_check: 'RENEWAL_STATUSES',
  missions_status_check: 'missionStatusSchema',
  notifications_origin_check: 'MESSAGE_ORIGINS',
  // #2404.3 — les quatre niveaux nommés (Information/Action/Urgent/Critique),
  // dérivés du `priority` déjà calculé. `null` est admis en plus des quatre :
  // une ligne écrite avant cette colonne, ou sans priorité mesurée, n'a pas de
  // niveau à inventer (GA-18/GA-19).
  chk_notifications_level: 'NOTIFICATION_LEVELS',
  opportunities_stage_check: 'PROJECT_STAGES',
  pipeline_stage_labels_stage_check: 'PIPELINE_STAGES',
  // Le SLA d'étape réglé par un espace (01/09/2026, PDF 3 §3.5). MÊME
  // énumération que le renommage juste au-dessus, et c'est voulu : les deux
  // règlent la même étape du même pipe. La contrainte liste les CINQ stades,
  // `won` compris, alors que le code n'écrira jamais `won` (`effectiveStageSla`
  // refuse une durée cible sur une affaire gagnée) — une contrainte plus LARGE
  // que ce qu'on écrit est sans danger, une contrainte plus étroite que
  // l'énumération est exactement ce que cette garde existe pour empêcher.
  deal_stage_sla_stage_check: 'PIPELINE_STAGES',
  playbook_subscriptions_key_check: 'PLAYBOOK_KEYS',
  profiles_profile_context_status_check: 'profileContextStatusValues',
  // #2073.8 — le choix PERSISTÉ, distinct du champ CALCULÉ par le profileur
  // (migration `1795300741628-ProfileChosenEntryStrategy.ts`).
  profiles_chosen_entry_strategy_check: 'entryStrategyValues',
  project_contacts_role_check: 'PROJECT_CONTACT_ROLES',
  // #2327 — les décisions humaines sur une paire de fiches talent
  // (`1795330000001-TalentIdentityResolution.ts`). `merge` n'y est PAS :
  // `c37_fusion_doublons` tient.
  talent_identity_decisions_action_check: 'TALENT_DUPLICATE_ACTIONS',
  talent_identity_decisions_reason_check: 'TALENT_DUPLICATE_REASONS',
  talent_identity_decisions_state_check: 'TALENT_IDENTITY_STATES',
  project_needs_contract_check: 'CONTRACT_KINDS',
  project_needs_staffable_check: 'STAFFABLE_VERDICTS',
  // #2323.18 — la porte PRÉSENTER (migration `1796321264606-NeedPresenterGateFields.ts`),
  // même famille que `staffable` : `unknown` est une RÉPONSE, pas un défaut.
  project_needs_profile_type_agreement_check: 'PROFILE_TYPE_AGREEMENTS',
  project_needs_status_check: 'PROJECT_NEED_STATUSES',
  // #2952 (#2305.13/.14/.15/.16/.18, migration `1796321998392-NeedConvergenceState.ts`)
  // — la contrainte porte bien les quatre valeurs de `convergenceStateSchema`
  // (`projet_plausible`/`projet_confirme`/`besoin_detecte`/`besoin_exprime`),
  // mais ce fichier vit sous `schemas/analysis/convergence.ts` : `typescriptEnums()`
  // ne lit que le premier niveau de `packages/contracts/src/schemas/` (`readdirSync`
  // sans récursion), donc l'énumération n'y est jamais trouvée. `null` documenté,
  // pas un oubli : élargir la lecture à un sous-dossier est un chantier séparé.
  project_needs_convergence_state_check: null,
  proofs_scope_check: 'PROOF_SCOPES',
  proofs_source_check: 'PROOF_SOURCES',
  proofs_strength_check: 'PROOF_STRENGTHS',
  record_field_audit_source_check: 'FLOW_PROVENANCES',
  // #4016.L13 — la source qui CONTREDIT un fait confirmé à la main (migration `1796560184635`).
  field_contradictions_source_check: 'FIELD_CONTRADICTION_SOURCES',
  // #4158.57 — rapatriement de l'espace personnel (migration `1796560255919`).
  workspace_merge_requests_status_check: 'WORKSPACE_MERGE_STATUSES',
  workspace_merge_items_outcome_check: 'WORKSPACE_MERGE_ITEM_OUTCOMES',
  workspace_merge_items_table_check: 'WORKSPACE_MERGE_TABLES',
  // #4267 — pourquoi un suivi de compte n'est plus actif (migration `1796560290696`).
  account_follows_archived_reason_check: 'ACCOUNT_FOLLOW_ARCHIVE_REASONS',
  // Théo A signaux (R22-ECRAN-a6) — l'état personnel d'un signal et la veille par compte (migration `1796575001843`).
  signal_user_states_state_check: 'SIGNAL_USER_STATES',
  signal_watches_cadence_check: 'SIGNAL_WATCH_CADENCE_KEYS',
  signal_watches_channel_check: 'SIGNAL_WATCH_CHANNELS',
  signal_watches_state_check: 'SIGNAL_WATCH_STATES',
  routine_subscriptions_channel_check: 'routineChannelSchema',
  // #2151.14 / #2151.25 — les sept genres d'événement de Découvrir. La
  // contrainte s'élargit AVANT le code qui écrit un huitième (GA-11).
  discover_alert_events_kind_check: 'DISCOVER_ALERT_EVENT_KINDS',
  /** #2151.25 — les surfaces de DÉLIVRANCE (`today`/`notification`/`outbound`).
   *  `null` parce que la liste n'est pas un littéral : elle est DÉRIVÉE de
   *  `DISCOVER_ALERT_SURFACES` par SOUSTRACTION de `laura`, et c'est tout le
   *  point — Laura LIT les événements, elle n'en délivre aucun, et une surface
   *  ajoutée demain se retrouve du côté qu'il faudra regarder. La comparer à un
   *  littéral exigerait d'en recopier un, donc de rouvrir la divergence que la
   *  dérivation ferme. L'exhaustivité est tenue ailleurs, par le contrat lui-même
   *  (`discover-alert-events.test.ts` : aucune décision ne rend `laura`). */
  discover_alert_events_surface_check: null,
  saved_views_scope_check: 'SAVED_VIEW_SCOPES',
  // #2151.5 — ce qu'une recherche enregistrée ramène.
  saved_views_result_type_check: 'SAVED_VIEW_RESULT_TYPES',
  saved_views_alert_frequency_check: 'SAVED_VIEW_ALERT_FREQUENCIES',
  saved_views_alert_channel_check: 'SAVED_VIEW_ALERT_CHANNELS',
  shortlists_status_check: 'SHORTLIST_STATUSES',
  commercial_transitions_subject_type_check: 'COMMERCIAL_TRANSITION_SUBJECT_TYPES',
  // #2967 (lot V39, migration `1796351088561`) — qui a produit la transition :
  // un geste, une proposition de Laura validée, ou une correction humaine.
  commercial_transitions_source_check: 'COMMERCIAL_TRANSITION_SOURCES',
  stock_snapshots_metric_key_check: 'STOCK_METRIC_KEYS',
  territory_snapshots_source_check: 'TERRITORY_SNAPSHOT_SOURCES',
  submission_feedback_verdicts_check: 'FEEDBACK_VERDICTS',
  submissions_stage_check: 'SUBMISSION_STAGES',
  // #2177.24 — le canal du destinataire d'un positionnement (migration
  // `1796001510863-SubmissionRecipientDetails.ts`) reprend telles quelles les
  // quatre valeurs déjà canoniques du plan de Laura (`PLAN_ACTION_CHANNELS`,
  // `action_plan_items_channel_check`) : un cinquième canal ici serait un
  // mensonge de canal une fois relu comme une des quatre valeurs en production.
  submissions_channel_check: 'PLAN_ACTION_CHANNELS',
  contact_stops_reason_check: 'CONTACT_STOP_REASONS',
  // #4158.22 — deux valeurs structurelles (la cible est un contact OU un domaine),
  // tenues avec `workspace_dnc_target_check` ; ce n'est pas une énumération métier
  // qui voyage du code vers la base.
  workspace_dnc_kind_check: null,
  // #4189.7 (Louis 15/10/2026) — les CRM dont un webhook entrant est accepté : la liste vit côté API
  // (`CRM_WEBHOOK_PROVIDERS`, crm-webhooks.service.ts) et sa parité avec la contrainte est tenue par
  // `1796546300000-CrmWebhookEvents.spec.ts`.
  crm_webhook_events_provider_check: null,
  // #3989.9 (Louis 15/10/2026) — le motif de perte, liste fermée commune (migration `1796546200000`).
  opportunities_loss_reason_code_check: 'LOSS_REASON_CODES',
  sync_links_entity_check: 'SYNC_ENTITY_TYPES',
  // #4189 (migration `1796541540046-CrmFournisseursZoho.ts`) — le curseur de la synchro incrémentale.
  crm_sync_cursors_entity_check: 'SYNC_ENTITY_TYPES',
  sync_links_provider_check: 'SYNC_PROVIDERS',
  sync_record_events_action_check: 'SYNC_RECORD_ACTIONS',
  // #2105.7 — la source d'une tâche (migration
  // `1796001512041-TaskSourceAndExpectedResult.ts`) : les deux seuls appelants
  // connus, le composeur manuel et la conversion d'un lead.
  tasks_source_check: 'TASK_SOURCES',
  tasks_priority_check: 'TASK_PRIORITIES',
  tasks_status_check: 'TASK_STATUSES',
  // #2395.4/#2395.9 (épopée #2901, migration `1796321999071-TaskChannel.ts`)
  // — `canonicalActionFromTask` lisait déjà `task.channel`, sans colonne pour
  // le porter. GA-26 réutilise EXACTEMENT `action_plan_items.channel`, jamais
  // une copie.
  tasks_channel_check: 'PLAN_ACTION_CHANNELS',
  user_favorites_entity_type_check: 'FAVORITE_ENTITY_TYPES',
  // #2004 — la machine d'état canonique de l'onboarding (migration
  // 1793583494449-OnboardingStatusStates, qui NOMME la contrainte jusque-là
  // en ligne pour entrer sous cette garde).
  user_onboarding_state_status_check: 'onboardingStatusSchema',
  // #2004.12 — le journal de transitions (1794001962137-UserOnboardingTransitions),
  // table neuve : les deux colonnes naissent avec une contrainte qui couvre déjà
  // les douze valeurs de la même énumération.
  user_onboarding_transitions_from_status_check: 'onboardingStatusSchema',
  user_onboarding_transitions_to_status_check: 'onboardingStatusSchema',
  // Théo O onboarding-relecture.N1 — table neuve (1796575047412-FramingDecisions) : les deux contraintes
  // naissent déjà larges, écrites en clair comme les constantes de `framing.ts`.
  framing_decisions_decision_check: 'FRAMING_DECISIONS',
  framing_decisions_strategy_key_check: 'FRAMING_ORIENTATION_IDS',
  telephony_connections_provider_check: 'telephonyProviderSchema',
  workspace_member_permissions_check: 'workspacePermissionValues',
  // Trouvées par l'élargissement du 30/08/2026 — le nom en base est
  // `${table}_role_check`, une FAMILLE interpolée sur deux tables
  // (`workspace_members`, `workspace_invitations`) dans deux migrations
  // (RbacRoles puis MemberPermissions, qui l'a widened en dernier). Les deux
  // développées ci-dessous partagent la même énumération TypeScript — voir
  // `resolveInterpolatedTables`.
  workspace_members_role_check: 'workspaceRoleValues',
  workspace_invitations_role_check: 'workspaceRoleValues',
  workspaces_anonymisation_check: 'ANONYMISATION_RULES',
  workspaces_portfolio_visibility_check: 'PORTFOLIO_VISIBILITIES',
  // #2451.9 — le mode de contexte par défaut de l'espace (Laura).
  workspaces_default_context_mode_check: 'LAURA_CONTEXT_MODES',
  // #2922 — le mode de contexte CHOISI pour un lot multi-comptes (migration
  // `1796321264604-AnalysisBatchContextMode`), nullable : `NULL` n'est pas dans
  // l'énumération TypeScript, la garde ne compare que les valeurs déclarées.
  analysis_batches_context_mode_check: 'LAURA_CONTEXT_MODES',
  // #2005.3 — la couche BU / agence (migration 1793710000000-BusinessUnits,
  // partie AVANT le code qui écrit ces valeurs, GA-11 / GA-12).
  business_units_kind_check: 'businessUnitKindValues',
  business_units_status_check: 'businessUnitStatusValues',
  business_unit_members_membership_check: 'businessUnitMembershipValues',
  business_unit_access_requests_status_check: 'businessUnitAccessRequestStatusValues',
  workspace_members_business_unit_access_check: 'businessUnitAccessValues',
  // #2016 — la demande d'accès d'un non-membre à un espace existant.
  workspace_join_requests_status_check: 'workspaceJoinRequestStatusValues',
  // #2018.7 — signaler une information d'entreprise fausse, sans l'écraser.
  esn_profile_correction_requests_status_check: 'esnProfileCorrectionRequestStatusValues',
  // #2081.14 — les règles d'espace (migration 1789808789203-WorkspaceRules).
  workspace_rules_business_unit_accounts_visibility_check: 'businessUnitAccountsVisibilityValues',
  workspace_rules_export_policy_check: 'workspaceExportPolicyValues',

  /* ---------------------------------------------------------------------- */
  /*  Sans contrepartie NOMMÉE — la limite de la garde, écrite               */
  /* ---------------------------------------------------------------------- */
  /**
   * Les entrées ci-dessous ont bien une énumération en TypeScript, mais écrite
   * EN LIGNE : un `z.enum([...])` imbriqué dans un objet, ou une union de
   * littéraux (`'a' | 'b'`). La garde ne peut comparer que ce qui porte un nom
   * et vit dans un tableau.
   *
   * Ce n'est pas une dispense : c'est le geste à faire le jour où l'une d'elles
   * gagne une valeur. Extraire le tableau (`export const X = [...] as const`)
   * suffit à la faire entrer sous la garde — c'est ce qui a été fait pour
   * `INTERVENTION_SUBJECTS`.
   */
  // #1617.4 — la décision humaine sur un rapprochement de mémoire marché.
  market_company_resolution_override_decision_check: 'MARKET_RESOLUTION_DECISIONS',
  // #1911.1 — qui a écrit le titre d'un fil : Laura ou la personne.
  chat_thread_titles_title_source_check: 'CHAT_THREAD_TITLE_SOURCES',
  // #2875 (#2402.9) — le registre unique des déclencheurs commerciaux, une
  // liste fermée élargie à chaque émetteur migré (voir canonical-trigger.ts).
  canonical_trigger_events_kind_check: 'canonicalTriggerKindValues',
  // #3915.1 — le statut du TriggerEvent persisté (NULL = ligne antérieure).
  canonical_trigger_events_status_check: 'TRIGGER_STATUSES',
  // #3918.a (lot M01) — la clé qui a rattaché un deal CRM à un compte, jamais le nom.
  crm_deal_facts_account_link_basis_check: 'CRM_DEAL_ACCOUNT_LINK_BASES',
  // #2877 (#2385.4) — la nature d'un signal qualité DÉCLARÉ sur un message.
  outreach_message_quality_flags_kind_check: 'OUTREACH_QUALITY_FLAG_KINDS',
  // #1949.23 — pourquoi Laura n'a pas su router une demande (trace anonyme).
  laura_unrouted_intents_category_check: 'UNROUTED_INTENT_CATEGORIES',
  /** #1949.23 — `fr` / `en` sur une colonne NULLABLE : la langue d'interface
   *  voyage déjà comme littéraux (`languageOf`, `interfaceLanguage` du DTO de
   *  chat), aucune énumération partagée ne la porte. */
  laura_unrouted_intents_language_check: null,
  account_partners_source_check: null,
  ats_connections_auth_mode_check: null,
  ats_write_requests_kind_check: null,
  ats_write_requests_state_check: null,
  impersonation_audit_action_check: null,
  /** Deux valeurs écrites EN LIGNE (`z.enum(['person', 'company'])` et l'union
   *  `ManualBillingBilledToKind`) : qui reçoit la facture ne voyage dans aucun
   *  contrat client. Même limite que les entrées voisines. */
  manual_billing_terms_billed_to_kind_check: null,
  /** Le statut de paiement a DÉMÉNAGÉ sur la facture (02/09/2026) — la
   *  contrainte des conditions ne survit que dans le `down()` de la migration
   *  qui l'a retirée. Deux valeurs en ligne, comme celle qui la remplace. */
  manual_billing_terms_payment_status_check: null,
  manual_billing_terms_period_check: null,
  /** `unpaid` / `paid` sur une facture émise : deux valeurs en ligne
   *  (`z.enum([...])` du DTO, union `ManualInvoicePaymentStatus`). */
  manual_billing_invoices_payment_status_check: null,
  match_runs_direction_check: null,
  need_proposals_status_check: null,
  outbound_write_requests_origin_check: null,
  outbound_write_requests_state_check: null,
  skill_alias_status_check: null,
  /** Deux valeurs d'infrastructure de facturation (`stripe` / `manual`) qui ne
   *  voyagent dans aucun contrat : rien côté client n'a à connaître le mode de
   *  règlement d'un abonnement. */
  subscriptions_billing_mode_check: null,
  /** Trouvée par l'élargissement du 30/08/2026 (nom entre guillemets) — la
   *  même limite que les entrées ci-dessus : les cinq devises n'existent
   *  qu'EN LIGNE, `currency: z.enum(['eur', 'usd', 'gbp', 'chf', 'cad'])` sur
   *  le champ `currency` de `credits.ts`, jamais extraites en `export const`.
   *  Le geste le jour où la liste bouge : extraire le tableau, pas modifier
   *  cette entrée. */
  workspaces_billing_currency_check: null,
  /** LA VERITE TERRAIN DE LA MEMOIRE MARCHE (#1622). Les six verdicts et les
   *  trois certitudes voyagent tous les deux dans le contrat partage : la
   *  contrainte SQL et l'enumeration TypeScript ne peuvent pas diverger sans
   *  qu'une des deux ecrive une valeur que l'autre refuse. */
  chk_market_memory_ground_truth_label: 'MARKET_MEMORY_GROUND_TRUTH_LABELS',
  chk_market_memory_ground_truth_certainty: 'OBSERVED_CERTAINTIES',
  /** #1960.13 — la nature d'une bannière, `incident` compris. Elle est ARRIVÉE
   *  sous cette garde en s'élargissant : la contrainte d'origine était ANONYME
   *  (`CHECK (…)` en ligne dans `BannersTable1786100000000`), donc invisible à
   *  `ADD_CHECK` ; `BannerIncidentKind1795100000000` la repose avec un nom
   *  EXPLICITE. C'est le geste qui compte ici — une contrainte nommée est une
   *  contrainte qu'on peut garder. */
  chk_banners_kind: 'bannerKindValues',
  // #2565 — L'ÉCRITURE D'UNE FACTURE CHEZ L'OUTIL CONNECTÉ. L'état n'est pas une
  // étiquette : « facturé » ne s'écrit que sur PREUVE du connecteur, et `unknown`
  // est ce qui ARRÊTE la reprise après un timeout. Une valeur que la contrainte
  // ignorerait ferait échouer l'écriture d'un état légitime — ou, pire, laisserait
  // passer un « facturé » que personne n'a prouvé.
  invoice_connector_write_requests_state_check: 'INVOICE_CONNECTOR_WRITE_STATES',
  // #2418.2 — les TROIS états du DOCUMENT chez le client, à côté des quatre
  // d'encaissement et sans se mêler à eux. La contrainte doit couvrir toute
  // l'énumération : un état légitime refusé par PostgreSQL se lirait à l'écran
  // comme « on ne sait pas », c'est-à-dire comme le contraire de ce qu'il dit.
  invoice_connector_write_requests_document_state_check: 'INVOICE_DOCUMENT_STATES',
  // ⚠️ La contrainte SŒUR de la précédente,
  // `invoice_connector_write_requests_document_evidence_check`, n'est
  // DÉLIBÉRÉMENT pas listée ici : elle ne porte aucune valeur littérale (elle
  // exige que l'état, sa référence chez l'outil et la date du constat soient
  // présents tous les trois ou absents tous les trois), donc `sqlConstraints()`
  // ne la collecte pas — l'inscrire la ferait passer pour une entrée PÉRIMÉE.
  // Ce n'est pas un oubli : GA-12 couvre les énumérations, et celle-là est une
  // règle de cohérence. C'est GA-377 qui la tient.
  // #2396.1/.2/.5 — l'issue et le mode de complétion d'une action du plan
  // (migration `ActionPlanItemOutcome`), les deux énumérées EN LIGNE
  // (`ACTION_PLAN_OUTCOMES`/`ACTION_COMPLETION_MODES`, `action-plan-items.ts`).
  action_plan_items_outcome_check: 'ACTION_PLAN_OUTCOMES',
  action_plan_items_completion_mode_check: 'ACTION_COMPLETION_MODES',
  // #2333.2/.5/.8/.9/.11 — statut d'une version de CV et politique de
  // validation d'un espace (migration `CvVersionValidation`), énumérées EN
  // LIGNE (`CV_VERSION_STATUSES`/`CV_VALIDATION_POLICIES`, `cv-version.ts`).
  cv_versions_status_check: 'CV_VERSION_STATUSES',
  workspaces_cv_validation_policy_check: 'CV_VALIDATION_POLICIES',
  // #2455.1/.7 — intégration vague 19 (23/09/2026) : les contextes de travail
  // enregistrés (migration `WorkContexts`), quatre statuts et trois
  // visibilités, énumérés EN LIGNE (`workContextStatusSchema` /
  // `workContextVisibilitySchema`, `work-context.ts`).
  work_contexts_status_check: 'workContextStatusSchema',
  work_contexts_visibility_check: 'workContextVisibilitySchema',
  // #2424.6 — CE QUE la preuve montre (migration `ProofContentType`), huit
  // valeurs nommées sans Louis faute de la liste exacte du document source
  // (doctrine §3c), énumérées `PROOF_CONTENT_TYPES` (`proof.ts`). Colonne
  // NULLABLE : `null` = pas encore classée.
  proofs_content_type_check: 'PROOF_CONTENT_TYPES',
  // #2126.47-.60 (épopée #2787) — les sept outcomes commerciaux (migration
  // `CommercialOutcomes`), énumérés `COMMERCIAL_OUTCOME_TYPES`
  // (`commercial-outcome.ts`).
  commercial_outcomes_type_check: 'COMMERCIAL_OUTCOME_TYPES',
  /** #2442.14 (épopée #2879) — le premier compteur de sécurité
   *  (`security_events`, migration `SecurityEvents`) : `kind` vit dans la
   *  colonne comme un `text` (`SecurityEventEntity.kind: string`), même
   *  patron que `ai_tool_call_audit_log_status_check` ci-dessus — rien à
   *  mapper sans en inventer une, une seule valeur aujourd'hui
   *  (`authorization_denied`), posée pour grandir par un CHECK qu'une
   *  prochaine migration élargira (GA-08). */
  security_events_kind_check: null,
  // #2326.12 (épopée #2794, migration `1796322044000`) — l'orchestrateur async
  // d'import de CV en masse : la source des octets, et l'état d'un job.
  // #4051 (migration `1796560184000`) — la trace « Importé le … depuis … » d'une fiche.
  record_import_marks_entity_type_check: 'RECORD_IMPORT_ENTITY_TYPES',
  record_import_marks_source_kind_check: 'RECORD_IMPORT_SOURCE_KINDS',
  cv_batch_import_jobs_kind_check: 'CV_BATCH_IMPORT_JOB_KINDS',
  cv_batch_import_jobs_status_check: 'CV_BATCH_IMPORT_JOB_STATUSES',
  // #1952.3 (épopée #2844, lot SRC5 28/09 soir) — le matching massif réutilise
  // EXACTEMENT le vocabulaire de statut de `cv_batch_import_jobs` (GA-26,
  // même patron BullMQ + Socket.IO), jamais une copie.
  bulk_matching_jobs_status_check: 'CV_BATCH_IMPORT_JOB_STATUSES',
  // #2916 / #2399.2 (c93, migration `1796438100000`) — le sort du matching
  // AUTOMATIQUE d'un besoin entrant (`need-auto-match.ts`).
  need_auto_matches_status_check: 'NEED_AUTO_MATCH_STATUSES',
  // #1952.6 (épopée #2844, lot SRC5 28/09 soir) — même vocabulaire de statut,
  // même raison ; `kind` est neuf à ce lot (une seule nature aujourd'hui).
  bulk_export_jobs_status_check: 'CV_BATCH_IMPORT_JOB_STATUSES',
  bulk_export_jobs_kind_check: 'BULK_EXPORT_JOB_KINDS',
  // #1952.7 (épopée #2844, lot SRC5 28/09 soir) — même vocabulaire de statut, même raison.
  multi_source_search_jobs_status_check: 'CV_BATCH_IMPORT_JOB_STATUSES',
  // #1952.5 (épopée #2844, lot SRC5 28/09 soir) — même vocabulaire de statut, même raison.
  bulk_cv_rewrite_jobs_status_check: 'CV_BATCH_IMPORT_JOB_STATUSES',
  // Import universel (Louis 27/09/2026, migration `1796322824816`) — le type
  // déclaré au registre, le format lu, l'état du job, et le sort d'une ligne.
  universal_import_jobs_type_check: 'UNIVERSAL_IMPORT_TYPES',
  universal_import_jobs_format_check: 'UNIVERSAL_IMPORT_FORMATS',
  universal_import_jobs_status_check: 'UNIVERSAL_IMPORT_STATUSES',
  universal_import_jobs_scope_check: 'UNIVERSAL_IMPORT_SCOPES',
  universal_import_issues_kind_check: 'UNIVERSAL_IMPORT_ISSUE_KINDS',
  // #2398.7 (épopée #2843, migration `1796322045000`) — les six statuts
  // d'une routine (`enabled` reste en MIROIR, `status` devient la vérité),
  // énumérés `routineStatusSchema` (`routines.ts`).
  routine_subscriptions_status_check: 'routineStatusSchema',
  // #2843.13 — l'autonomie réglée par l'utilisateur (migration `1796900100000`) : énumérée `routineAutonomySchema`.
  routine_preferences_autonomy_check: 'routineAutonomySchema',
  // #2075.12 / #2075.13 (épopée #2774, migration `CommercialAuditFeedback`) —
  // commenter une conclusion, refuser une recommandation : deux genres,
  // énumérés `commercialAuditFeedbackKindSchema` (`commercial-audit-feedback.ts`),
  // nommée dès l'écriture (GA-177).
  commercial_audit_feedback_kind_check: 'commercialAuditFeedbackKindSchema',
  /** #2309.16/.19 (migration `ContactIntakeExclusions1796322868500`) — la
   *  raison pour laquelle un candidat n'est jamais devenu une fiche
   *  (`ContactIntakeExclusionEntity.reason`) vit comme une union TypeScript
   *  inline (`'ambiguous_identity' | 'duplicate_identity'`), même patron que
   *  `ai_tool_call_audit_log_status_check` ci-dessus — rien à mapper sans en
   *  inventer une. */
  contact_intake_exclusions_reason_check: null,
  // BEL-SC-243 (#3272, migration `LostDealRex1796374203141`) — le REX perte :
  // les quatorze motifs canoniques, sur les deux champs qui les portent
  // (déclaré et supposé), et les cinq distinctions, sur les quatre champs
  // interprétables. `lostDealMotifSchema` / `lostDealRexEvidenceSchema`
  // (`lost-deal-rex.ts`) sont la source unique des deux vocabulaires (GA-26).
  lost_deal_rex_declared_motif_check: 'LOST_DEAL_MOTIFS',
  lost_deal_rex_suspected_motif_check: 'LOST_DEAL_MOTIFS',
  lost_deal_rex_last_action_distinction_check: 'LOST_DEAL_REX_EVIDENCE_KINDS',
  lost_deal_rex_declared_motif_distinction_check: 'LOST_DEAL_REX_EVIDENCE_KINDS',
  lost_deal_rex_suspected_motif_distinction_check: 'LOST_DEAL_REX_EVIDENCE_KINDS',
  lost_deal_rex_what_team_knows_now_distinction_check: 'LOST_DEAL_REX_EVIDENCE_KINDS',
  // BEL-SC-243 (#3272.5) — la proposition de règle : les trois statuts de
  // `lostDealRuleProposalSchema` (`lost-deal-rule-proposal.ts`), jamais créée
  // ailleurs qu'à `pending`.
  lost_deal_rule_proposals_status_check: 'LOST_DEAL_RULE_PROPOSAL_STATUSES',
  // #3295 (migration `WorkspaceMethodRules1796417123457`) — la règle promue :
  // ses onze domaines sont ceux du corpus (`METHOD_RULE_DOMAINS`, source unique, GA-26).
  workspace_method_rules_domain_check: 'METHOD_RULE_DOMAINS',
  // BEL-SC-242 (#3271.10/.12, migration `WorkspaceRitualPreferences1796374065850`)
  // — le catalogue reste en CODE (`ritual.ts`) : un espace ne peut désactiver
  // qu'un rituel qui existe RÉELLEMENT, jamais un réglage mort. `RITUAL_KEYS`
  // (`ritual.ts`) est la source unique des cinq clés (GA-26).
  workspace_ritual_preferences_ritual_key_check: 'RITUAL_KEYS',
  // #3298 (suite #3271.8, migration `WorkspaceRitualLastHeld1796378870001`) —
  // la marque de dernière tenue : même contrainte que
  // `workspace_ritual_preferences` juste au-dessus, `RITUAL_KEYS` reste la
  // source unique (GA-26).
  workspace_ritual_last_held_ritual_key_check: 'RITUAL_KEYS',
  // #3271.8 reste (épopée #3298, migration `1796413221437-TaskRitualKey.ts`) —
  // la tâche porte le rituel d'où elle vient : mêmes cinq clés, même source.
  tasks_ritual_key_check: 'RITUAL_KEYS',
  /** #2887 (#2371.8, migration `PartnerCvPushes1796350118061`) — la revue d'un
   *  CV poussé à un partenaire : `status` (préparé / déclaré envoyé, jamais
   *  une preuve d'envoi) et `outcome` (le retour du partenaire), énumérés
   *  `PARTNER_CV_PUSH_STATUSES` / `PARTNER_CV_PUSH_OUTCOMES`
   *  (`partner-cv-push.ts`). */
  partner_cv_pushes_status_check: 'PARTNER_CV_PUSH_STATUSES',
  partner_cv_pushes_outcome_check: 'PARTNER_CV_PUSH_OUTCOMES',
  // P05 (#3246, lot 09/10, migration `SharedAnonymousBase1796437902401`) — la
  // base anonyme commune : le périmètre (réel / salle de démo), les dimensions
  // et la taille sont des vocabulaires fermés de `shared-anonymous-base.ts` /
  // `outcome-recommendation.ts`. `size_band` accepte en plus `all` (la cellule
  // « toutes tailles ») : une contrainte plus large que le TS est sans danger.
  shared_action_outcome_aggregates_scope_check: 'SHARED_SCOPES',
  shared_action_outcome_aggregates_dimension_check: 'OUTCOME_RECOMMENDATION_DIMENSIONS',
  shared_action_outcome_aggregates_size_band_check: 'SHARED_SIZE_BANDS',
  shared_case_outcome_aggregates_scope_check: 'SHARED_SCOPES',
  shared_case_outcome_aggregates_dimension_check: 'SHARED_CASE_DIMENSIONS',
  shared_signal_deal_aggregates_scope_check: 'SHARED_SCOPES',
  // #3989 + #2877 GLOBAL (Louis 11/10/2026, migration `SharedCompanyFacts1796439898901`)
  // — les faits société partagés (origine bellum / user, `shared-company-facts.ts`)
  // et les signaux d'apprentissage des messages mutualisés (`shared-anonymous-base.ts`).
  shared_company_people_scope_check: 'SHARED_SCOPES',
  shared_company_people_origin_check: 'SHARED_FACT_ORIGINS',
  // #4286.15.b (Louis 19/10/2026) — l'état employeur d'un fait commun (`shared-company-facts.ts`).
  shared_company_people_employment_state_check: 'SHARED_EMPLOYMENT_STATES',
  // #4286.15.c (Louis 22/10/2026, migration `SharedMarketPatternAggregates1796574700000`) — les tendances
  // de marché entre espaces (`market-pattern.ts`). `size_band` et `region_key` acceptent en plus `all`
  // (la cellule « toutes ») : une contrainte plus large que le TS est sans danger.
  shared_market_pattern_aggregates_scope_check: 'SHARED_SCOPES',
  shared_market_pattern_aggregates_topic_check: 'MARKET_PATTERN_SKILL_DOMAINS',
  shared_market_pattern_aggregates_size_band_check: 'SHARED_SIZE_BANDS',
  shared_market_pattern_aggregates_region_key_check: 'FRENCH_REGIONS',
  shared_message_learning_aggregates_scope_check: 'SHARED_SCOPES',
  shared_message_learning_aggregates_signal_check: 'SHARED_MESSAGE_LEARNING_SIGNALS',
  // #3223 (décision Louis 11/10/2026) — le verdict du juge « recommandation générique ».
  chat_generic_judgements_verdict_check: 'GENERIC_JUDGE_VERDICTS',
}

// Un commentaire de migration qui CITE une contrainte en prose (ex :
// ``violates check constraint "contacts_decision_role_check"``) n'est pas du
// SQL réel — les retirer avant de scanner évite qu'une citation fausse le
// compte, comme GA-177 l'a déjà appris (voir son `stripComments`).
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Un nom interpolé (`${table}_role_check`) ne désigne pas UNE contrainte mais
 * une FAMILLE, appliquée à chaque table d'une boucle `for (const table of …)`.
 * Elle se développe en noms concrets quand cette boucle itère un tableau
 * énumérable STATIQUEMENT dans le même fichier — inline (`for (const table of
 * ['a', 'b'])`) ou via un `const` déclaré ailleurs dans le fichier (`for
 * (const table of TABLES)` avec `const TABLES = ['a', 'b']`).
 *
 * `null` veut dire non résolue — la boucle existe mais son tableau ne se lit
 * pas statiquement (calculé, importé, issu d'une requête). Le nom de la
 * variable de boucle et le fichier d'origine suffisent en pratique ici : les
 * deux occurrences actuelles (`RbacRoles`, `MemberPermissions`) partagent la
 * même variable `table`, mais on cherche dans le fichier COURANT, jamais dans
 * un autre — deux fichiers qui nomment leur variable de boucle pareil ne
 * partagent pas forcément le même tableau.
 */
function resolveInterpolatedTables(fileSource: string, loopVariable: string): string[] | null {
  const inlineLoop = new RegExp(`for\\s*\\(\\s*const\\s+${loopVariable}\\s+of\\s+\\[([^\\]]*)\\]\\s*\\)`, 'i')
  const inline = fileSource.match(inlineLoop)
  if (inline) return [...(inline[1] ?? '').matchAll(/'([^']*)'/g)].map(entry => entry[1] as string)

  const namedLoop = new RegExp(`for\\s*\\(\\s*const\\s+${loopVariable}\\s+of\\s+([A-Za-z0-9_]+)\\s*\\)`, 'i')
  const named = fileSource.match(namedLoop)
  if (!named) return null
  const arrayName = named[1] as string
  const declaration = new RegExp(`const\\s+${arrayName}\\s*=\\s*\\[([^\\]]*)\\]`, 'i')
  const declared = fileSource.match(declaration)
  if (!declared) return null
  const values = [...(declared[1] ?? '').matchAll(/'([^']*)'/g)].map(entry => entry[1] as string)
  return values.length > 0 ? values : null
}

/**
 * Familles interpolées dont le tableau de tables ne se résout PAS
 * statiquement (voir `resolveInterpolatedTables`) — vide aujourd'hui : les
 * deux occurrences du dépôt (`${table}_role_check` dans `RbacRoles` et
 * `MemberPermissions`) se résolvent toutes les deux. Le jour où l'une ne s'y
 * prête plus, son gabarit (`${table}_role_check`, tel quel) doit être ajouté
 * ici AVEC SA RAISON — jamais disparaître en silence, comme le fait `null`
 * dans `MAPPING` pour une contrainte sans contrepartie TypeScript.
 */
const UNRESOLVABLE_INTERPOLATED_FAMILIES: Record<string, string> = {}

/** La dernière liste déclarée pour chaque contrainte — celle qui fait foi en base. */
function sqlConstraints(): { constraints: Map<string, string[]>; unresolvedFamilies: string[] } {
  const latest = new Map<string, string[]>()
  const unresolvedFamilies: string[] = []
  for (const file of readdirSync(MIGRATIONS)
    .filter(name => name.endsWith('.ts'))
    .sort()) {
    const fullSource = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'))
    // Seul le `up()` compte : un `down()` restaure l'état d'avant, par nature.
    const up = fullSource.split('public async down')[0] ?? ''
    for (const match of up.matchAll(ADD_CHECK)) {
      const groups = match.groups ?? {}
      const rawName = groups.name ?? ''
      const body = groups.inList ?? groups.anyList ?? ''
      const values = [...body.matchAll(/'([^']*)'/g)].map(entry => entry[1] as string)
      if (values.length === 0) continue

      if (rawName.startsWith('"') && rawName.endsWith('"')) {
        // Le guillemet est de l'échappement SQL, pas une part du nom.
        latest.set(rawName.slice(1, -1), values)
        continue
      }

      if (rawName.startsWith('${')) {
        const interpolation = rawName.match(/^\$\{([A-Za-z0-9_]+)\}([a-z0-9_]*)$/)
        const loopVariable = interpolation?.[1]
        const suffix = interpolation?.[2] ?? ''
        const tables = loopVariable ? resolveInterpolatedTables(fullSource, loopVariable) : null
        if (!tables) {
          unresolvedFamilies.push(rawName)
          continue
        }
        for (const table of tables) latest.set(`${table}${suffix}`, values)
        continue
      }

      latest.set(rawName, values)
    }
  }
  return { constraints: latest, unresolvedFamilies: [...new Set(unresolvedFamilies)] }
}

/** Les deux formes d'énumération du dépôt : `[...] as const` et `z.enum([...])`. */
function typescriptEnums(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  // Les commentaires sont retirés AVANT d'extraire les chaînes : une apostrophe
  // française dans un commentaire se lit sinon comme le début d'une valeur.
  const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  for (const file of readdirSync(SCHEMAS).filter(name => name.endsWith('.ts') && !name.includes('.test.'))) {
    const source = readFileSync(join(SCHEMAS, file), 'utf8')
    for (const match of source.matchAll(/export const ([A-Za-z][A-Za-z0-9_]*) = \[([\s\S]*?)\] as const/g)) {
      const values = [...strip(match[2] as string).matchAll(/'([^']*)'/g)].map(entry => entry[1] as string)
      if (values.length > 0) found.set(match[1] as string, values)
    }
    for (const match of source.matchAll(/export const ([A-Za-z][A-Za-z0-9_]*) = z\.enum\(\[([\s\S]*?)\]\)/g)) {
      const values = [...strip(match[2] as string).matchAll(/'([^']*)'/g)].map(entry => entry[1] as string)
      if (values.length > 0 && !found.has(match[1] as string)) found.set(match[1] as string, values)
    }
  }
  return found
}

describe('GA-12 — une contrainte CHECK couvre son énumération TypeScript', () => {
  const { constraints: sql, unresolvedFamilies } = sqlConstraints()
  const enums = typescriptEnums()

  it('toute famille de contrainte interpolée est résolue ou déclarée non-résoluble', () => {
    const undeclared = unresolvedFamilies.filter(name => !(name in UNRESOLVABLE_INTERPOLATED_FAMILIES))
    if (undeclared.length > 0) {
      throw new Error(
        [
          'Un nom de contrainte INTERPOLÉ (`${var}_suffix`) ne se résout pas sur un',
          'tableau de tables lisible statiquement. Rends son tableau énumérable dans',
          'le même fichier, ou déclare le gabarit dans',
          'UNRESOLVABLE_INTERPOLATED_FAMILIES avec la raison.',
          '',
          ...undeclared.map(name => `  · ${name}`),
        ].join('\n'),
      )
    }
    expect(undeclared).toEqual([])
  })

  it('toute contrainte trouvée en migration est TRANCHÉE dans la table', () => {
    const undeclared = [...sql.keys()].filter(constraint => !(constraint in MAPPING)).sort()
    if (undeclared.length > 0) {
      throw new Error(
        [
          'Une contrainte CHECK n’a pas d’entrée dans MAPPING. Ajoute-la, soit avec le',
          'nom de son énumération TypeScript, soit avec `null` ET la raison écrite.',
          '',
          ...undeclared.map(name => `  · ${name}`),
        ].join('\n'),
      )
    }
    expect(undeclared).toEqual([])
  })

  it('la table ne garde aucune entrée périmée', () => {
    const stale = Object.keys(MAPPING)
      .filter(constraint => !sql.has(constraint))
      .sort()
    expect(stale).toEqual([])
  })

  it('chaque énumération nommée existe vraiment', () => {
    const missing = Object.values(MAPPING).filter((name): name is string => name !== null && !enums.has(name))
    expect(missing).toEqual([])
  })

  it('la contrainte contient TOUTES les valeurs de son énumération', () => {
    const gaps: string[] = []
    for (const [constraint, enumName] of Object.entries(MAPPING)) {
      if (enumName === null) continue
      const allowed = new Set(sql.get(constraint) ?? [])
      const declared = enums.get(enumName) ?? []
      const missing = declared.filter(value => !allowed.has(value))
      if (missing.length > 0) {
        gaps.push(`${constraint} n’accepte pas ${missing.map(v => `'${v}'`).join(', ')} — déclaré par ${enumName}`)
      }
    }
    if (gaps.length > 0) {
      throw new Error(
        [
          'Une valeur EXISTE en TypeScript et la base la REFUSE. Le code qui l’écrira',
          'lèvera une violation de contrainte — souvent avalée dans un try/catch, donc',
          'invisible autrement que par un message d’erreur générique à l’utilisateur.',
          '',
          'Écris une migration qui ÉLARGIT la contrainte, en repartant de la DERNIÈRE',
          'liste déclarée (jamais d’une plus ancienne — voir GA-11), et déploie-la AVANT',
          'le code qui écrit la valeur.',
          '',
          ...gaps.map(line => `  · ${line}`),
        ].join('\n'),
      )
    }
    expect(gaps).toEqual([])
  })

  it('la garde lit bien quelque chose — une garde vide passe au vert pour toujours', () => {
    expect(sql.size).toBeGreaterThan(20)
    expect(enums.size).toBeGreaterThan(50)
    expect(enums.get('INTERVENTION_KINDS')).toContain('credits_exhausted')
  })

  it('la garde voit bien les trois formes élargies le 30/08/2026', () => {
    // Nom entre guillemets.
    expect(sql.has('workspaces_billing_currency_check')).toBe(true)
    // Nom interpolé, développé sur ses deux tables.
    expect(sql.has('workspace_members_role_check')).toBe(true)
    expect(sql.has('workspace_invitations_role_check')).toBe(true)
    // `= ANY (ARRAY[…])` au lieu de `IN (…)`.
    expect(sql.get('contacts_decision_role_check')).toContain('procurement')
  })
})
