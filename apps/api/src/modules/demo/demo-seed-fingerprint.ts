import { importContentFingerprint } from '@bellum/contracts'
import {
  DEMO_ACTION_OS_APPROVAL,
  DEMO_ACTIVITIES,
  DEMO_EVENT_PARTICIPANTS,
  DEMO_ANALYSED_ACCOUNTS,
  DEMO_EXTENSION_ACCOUNTS,
  DEMO_SUBMISSIONS_MIN_TOTAL,
  DEMO_EXPERTISE_GROUNDINGS,
  DEMO_AGREEMENT_CONFIRMED_CONSULTANT,
  DEMO_STAFFING,
  DEMO_ANALYSIS_BATCH,
  DEMO_WORK_PROGRESS,
  DEMO_BRIDGE_CONTACTS,
  DEMO_COLLEAGUES,
  DEMO_COLLEAGUE_ACTIVITY,
  DEMO_TEAM_RESEARCH,
  DEMO_TEAM_THREADS,
  DEMO_DELEGATED_ACTIONS,
  DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE,
  DEMO_SHARED_ACCOUNT_WORK,
  DEMO_ESTIMATED_EMAIL_CONTACTS,
  DEMO_HAND_ENTERED_TALENT_FIELDS,
  DEMO_BUSINESS_UNITS,
  DEMO_SHARED_BASE_ACTION_OUTCOMES,
  DEMO_SHARED_BASE_CASE_OUTCOMES,
  DEMO_SHARED_BASE_SIGNAL_DEALS,
  // #3989 / #2877 GLOBAL (c94) et métiers placés déduits (#4032) — semés par seedWorkspace.
  DEMO_SHARED_BASE_COMPANY_ROLES,
  DEMO_SHARED_BASE_MESSAGE_LEARNING,
  DEMO_SHARED_BASE_MARKET_PATTERNS,
  DEMO_INFERRED_PLACED_ROLES,
  DEMO_CHAIN_MANUAL_MARKS,
  DEMO_COMMERCIAL_OUTCOMES,
  DEMO_CONSULTANTS,
  DEMO_COPILOT_CANCELLED_JOB,
  DEMO_COPILOT_DONE_JOB,
  DEMO_COPILOT_LONG_JOB,
  DEMO_CRM_DEALS,
  DEMO_CRM_MIRROR,
  DEMO_ORG_CRM_MARKED_CONTACTS,
  DEMO_OUTREACH_ASSETS,
  DEMO_TEAM_POLICY,
  DEMO_CV_IMPORT_CONSULTANTS,
  DEMO_DELIVERY_CARRIER,
  DEMO_DELIVERY_CLIENT,
  DEMO_DISCOVER_CANDIDATE_NOTE,
  DEMO_DOSSIERS,
  DEMO_DOCUMENT_IDENTITY,
  DEMO_FLAGSHIP_NEED_SOURCE_URL,
  DEMO_ACCOUNT_CRM_EXPORT,
  DEMO_ENTITY_RESOLUTION_CORRECTION,
  DEMO_JOB_OFFER_THREAD,
  DEMO_LONG_LAURA_THREAD,
  DEMO_RESTRICTED_SOURCE_THREAD,
  DEMO_SAMPLE_PLAN_V1,
  DEMO_SAMPLE_PLAN_V2,
  DEMO_SG_COMPLETE_LEAD,
  DEMO_ESN_PROFILE,
  DEMO_TARGET_PERSONAS,
  DEMO_SOLD_SENIORITY_LEVELS,
  DEMO_PERSONAL_ACCESS_EXTRA_SEEDS,
  DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS,
  DEMO_PERSONAL_CONTACTS,
  DEMO_EXPENSE_POLICY,
  DEMO_EXPENSE_REPORTS,
  DEMO_EXTERNAL_SOURCING_CONSULTANTS,
  DEMO_EXTERNAL_SOURCING_PARTNER_NAME,
  DEMO_EXTERNAL_SOURCING_SKILL,
  DEMO_FACTORING,
  DEMO_FLAGSHIP_NEED,
  DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT,
  DEMO_INTEGRATION_SYNC_RUN,
  DEMO_LEGAL_ENTITY,
  DEMO_LOST_DEAL_REX,
  DEMO_SECOND_LOST_DEAL,
  DEMO_THIRD_LOST_DEAL,
  DEMO_MARGIN_ALERT_THRESHOLD_PERCENT,
  DEMO_MEMBER_OBJECTIVE,
  DEMO_MEMORY_FACTS,
  DEMO_MESSAGE_LIBRARY_ENTRIES,
  DEMO_MESSAGE_STYLE_TEMPLATES,
  DEMO_MESSAGE_STYLE_RULE_PROPOSALS,
  DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS,
  DEMO_RECRUITMENT_SEED_SPECS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER,
  DEMO_MISSION_BUSINESS_UNIT_TRANSFER,
  DEMO_CONTACT_SCOPE_DIFFERENCE,
  DEMO_MISSION_CLIENT_MANAGER,
  DEMO_NOTES,
  DEMO_MISSING_EXPERTISE,
  DEMO_NO_DEFENDABLE_PROFILE_NEED,
  DEMO_PILOTAGE_WEEK_MOVES,
  DEMO_PROBABILITY_CALIBRATION,
  DEMO_PIPE_L2,
  DEMO_OUTREACH_CALL_TASKS,
  DEMO_ANALYSIS_RUNS,
  DEMO_HISTORY_RUNS,
  DEMO_VERIFICATION_RUNS,
  DEMO_OUTREACH_MESSAGES,
  DEMO_OWNER,
  DEMO_PARTNER_RELATIONS,
  DEMO_PLAN_TASKS,
  DEMO_PROFILE_CONTEXT,
  DEMO_RAG_DOCUMENTS,
  DEMO_RFP,
  DEMO_RFP_INTERRUPTED_IMPORT,
  DEMO_SG_ESN_PARTNERS,
  DEMO_SG_NEED_ANNOTATIONS,
  DEMO_STAFFED_NEED,
  DEMO_SIMILAR_CASES,
  DEMO_START_READINESS_MISSION,
  DEMO_FORFAIT_PROFILE_NEEDS,
  DEMO_SUPERVISED_FORFAIT_MISSION,
  DEMO_SUPERVISED_FORFAIT_NEED,
  DEMO_CONTACT_TARGET_LISTS,
  DEMO_IMPORT_HISTORY,
  DEMO_TARGET_LIST,
  DEMO_TIERED_TARGET_LIST,
  DEMO_TASKS,
  DEMO_TERRITORIES,
  DEMO_TERRITORY_SNAPSHOTS,
  DEMO_TIMESHEET_EXCEPTIONS,
  DEMO_UNQUALIFIED_CONTACTS,
  DEMO_AUTO_MERGED_DUPLICATE,
  DEMO_PIPELINE_DETECTIONS,
  DEMO_USER_ACTIONS,
  DEMO_CARD_RUN,
  DEMO_WORKFLOW_RUN,
  DEMO_WORK_CONTEXT,
  DEMO_IMPORT_MARKS,
  DEMO_CRM_COMPLETION,
  DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS,
  DEMO_SCHEDULED_SEND_SEED_SPECS,
  DEMO_CV_READ_THIS_WEEK,
  DEMO_MISSION_FRAME,
} from './demo-dataset'

/**
 * L'EMPREINTE DU SEMIS — ce qui distingue « une salle a ses six dossiers » de
 * « une salle a les six dossiers de la version DÉPLOYÉE ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ (PROD, 27/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * #3135 a livré quatre nouveautés semées (plan SNCF > 3 actions #2923,
 * talent « Interruption à confirmer » #3068, séquence terminée #2873, carte
 * « Prioriser ma semaine » #2897) et l'API a bien été déployée (8cb4ed5e).
 * Une salle de démo ouverte APRÈS ce déploiement n'en montrait AUCUNE :
 * `DemoSeedService.seedWorkspace` est idempotent sur la seule PRÉSENCE d'un
 * compte, et `DemoPoolService`/`DemoResetService` ne purgent une salle que
 * quand elle est INCOMPLÈTE — jamais quand elle est complète mais PÉRIMÉE.
 * Le bail d'un même navigateur se renouvelant indéfiniment, une salle semée
 * avant un déploiement gardait l'ancien jeu pour toujours.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE CHOIX : LE SHA DE BUILD D'ABORD, LE CONTENU EN REPLI — PAS L'INVERSE
 * ─────────────────────────────────────────────────────────────────────────
 * Deux signaux étaient possibles : un hash du CONTENU (`DEMO_DOSSIERS`), ou le
 * SHA du build réellement déployé. Le SHA gagne quand il est disponible,
 * parce qu'il est LE PLUS FIABLE des deux : le défaut ci-dessus n'a jamais
 * touché au contenu de `DEMO_DOSSIERS` — les quatre nouveautés de #3135
 * vivent dans la LOGIQUE de `demo-seed.service.ts` (`seedMissionInterruption`
 * pour #3068, `sequence_completed_crm_update` pour #2873, …), jamais dans le
 * jeu de données lui-même. Un hash de contenu seul n'aurait donc RIEN détecté
 * sur cet incident précis — et rien ne garantit qu'un futur correctif de
 * seed touche, lui non plus, `DEMO_DOSSIERS`. Le SHA de build, lui, change à
 * CHAQUE déploiement, quel que soit l'endroit qui a bougé : il ne peut jamais
 * rester périmé par oubli, ce qui est exactement le mode de défaillance de
 * l'incident (personne n'a stampé quoi que ce soit, faute de mécanisme).
 *
 * `RAILWAY_GIT_COMMIT_SHA` (même variable que `SENTRY_RELEASE` dans
 * `status.service.ts`/`health.controller.ts`) n'existe pas en local ni dans
 * la CI standard : le hash de contenu sert alors de repli, complété par
 * {@link DEMO_SEED_REVISION} pour couvrir les changements de LOGIQUE de semis
 * qui ne touchent pas `DEMO_DOSSIERS` — le seul cas que ni le SHA (absent) ni
 * le hash de contenu (aveugle à la logique) ne couvriraient seuls, hors
 * Railway. Cette constante est le SEUL geste manuel qui reste, et seulement
 * pour cet environnement.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #3068 (28/09/2026) — LE REPLI ÉTAIT AVEUGLE À DEUX AUTRES JEUX DE DONNÉES
 * ─────────────────────────────────────────────────────────────────────────
 * Le paragraphe ci-dessus dit vrai pour `seedMissionInterruption` (la ligne
 * `mission_interruptions` est bien de la LOGIQUE, dans `demo-seed.service.ts`)
 * mais passait sous silence que Léa Fontaine ELLE-MÊME (`DEMO_CONSULTANTS`,
 * le vivier) et la mission qu'elle porte (`DEMO_DELIVERY_CLIENT`, les
 * missions de livraison) sont, eux, bien DU CONTENU — dans `demo-dataset.ts`,
 * comme `DEMO_DOSSIERS`, mais dans DEUX AUTRES exports que le repli ne
 * hachait pas. Résultat mesuré en prod le 28/09 : une salle déjà semée avant
 * #3135 montrait encore les onze profils du 27/09, sans Léa Fontaine, malgré
 * le correctif d'empreinte déjà déployé — le SHA de build reste le signal
 * PRIMAIRE et n'a pas cette lacune (il change de toute façon à chaque
 * déploiement), mais tout environnement qui retombe sur le repli de contenu
 * (local, CI, ou un Railway où `RAILWAY_GIT_COMMIT_SHA` ne vaudrait rien)
 * restait aveugle à ces deux jeux de données. Les trois sont donc hachés
 * ensemble désormais.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #3068 GÉNÉRALISÉ (28/09/2026) — LE DOSSIER SOCIÉTÉ GÉNÉRALE, MÊME TROU
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en prod le 28/09 sur l'onglet Contacts du dossier Société Générale :
 * une salle louée servait encore l'ANCIEN jeu SG (avant la PR #3138, 27/09
 * 19:01), alors que `DEMO_DOSSIERS` — qui PORTE le dossier SG — était bien
 * dans la liste ci-dessus depuis #3135. Preuve retenue : `DEMO_DOSSIERS`
 * N'ÉTAIT PAS le trou cette fois (`demo-reset.service.ts` purge et re-sème
 * intégralement dès que l'empreinte diffère, y compris salle déjà louée —
 * `resetWorkspace()` re-crée `accounts` en dernier, jamais en ajout).
 *
 * Le vrai trou, retrouvé en listant TOUT ce que `DemoSeedService.seedWorkspace`
 * importe de `demo-dataset.ts` (`demo-seed.service.ts`, import unique) : une
 * cinquantaine d'autres exports `DEMO_*` (vivier de territoires, notes,
 * activités, tâches, RFP, factoring, notes de découverte…) n'étaient PAS
 * hachés — exactement le trou que #3068 avait déjà nommé pour deux d'entre
 * eux, jamais refermé pour les autres. Le dossier SG n'en souffrait pas
 * lui-même, mais RIEN ne garantissait qu'un futur export nouvellement seedé
 * le soit — la garde `demo-seed-fingerprint.spec.ts` (« chaque export DEMO_*
 * que seedWorkspace lit … est dans l'empreinte ») le vérifie désormais à la
 * place d'une relecture manuelle : une nouvelle table semée entre donc
 * d'office dans l'empreinte, sans qu'il faille y penser (même doctrine que
 * `demoCompletenessProbes` dans `demo-reset.service.ts`).
 *
 * Calculée UNE fois au démarrage du process (constante de module, pas une
 * fonction rappelée à chaque bail) : aucun des exports listés ci-dessus, ni
 * la variable d'environnement du build, ne changent en cours de vie d'un
 * process.
 */

/**
 * À INCRÉMENTER À LA MAIN quand un changement de `demo-seed.service.ts` (une
 * nouvelle table semée, une nouvelle règle dérivée) ne touche PAS
 * `DEMO_DOSSIERS` — donc quand le hash de contenu, seul, ne verrait rien.
 * Sans effet quand `RAILWAY_GIT_COMMIT_SHA` est posé (Railway le rend
 * inutile en production, là où l'oubli de le bumper coûterait le plus cher).
 */
// #2873 (28/09/2026) — `seedSequenceCompletedCrmUpdateProposal` (nouvelle
// table `routine_runs`, une ligne `notifications` de plus) et le
// resserrement de l'échéance Isabelle Rouault (`DEMO_OUTREACH_PLAN`, `-5` →
// `-3`) : deux changements de LOGIQUE dans `demo-seed.service.ts`, aucun dans
// `DEMO_DOSSIERS` — le hash de contenu, seul, ne les verrait pas.
// Lot D01 (06/10/2026) — la séquence active de Mathieu Brossard (`DEMO_OUTREACH_PLAN`, dans
// `demo-seed.service.ts`, donc hors du hash de contenu) et le statut `analyzing` du dossier porteur.
// Lot P07 (09/10/2026, #3970) — `resolveDemoEmployment` date les arrivées simulées AU SEED
// (logique de `demo-seed.service.ts`, hors du hash de contenu).
// Recette 13/10/2026 — le chemin d'accès Orange (`pathFromDecisionMakers`, #4090) est un changement de LOGIQUE de semis
// (`commercial-brief-seed.ts`), invisible au hash de contenu quand aucun SHA de build n'est posé.
// 13/10/2026 — les briefs « Ce que je sais » d'Airbus, EDF, Renault et Thales (`raw_analysis.commercial_brief`,
// ESN d'`account_partners` pour Thales) : les salles déjà semées doivent être rejouées.
// 13/10/2026 (recette) — une année sans CA n'est plus écrite « 0 » dans le graphique des briefs EDF et Renault : rejeu.
// 13/10/2026 — les dates de collecte des segments sont posées au semis pour TOUT compte (plus de bandeau « collecte
// antérieure » en démo, `demoCollectedAtColumns`) et les offres d'Orange sont datées au semis : logique de semis, rejeu.
// 14/10/2026 — L3 Staffing : coûts journaliers, congés, jours saisis du mois et seuil TACE posés au semis (`seedStaffing`).
// 14/10/2026 (#4163 LF) — les séquences « achats » visent une personne NOMMÉE (`DEMO_OUTREACH_PLAN`) et la file porte
// des écritures CRM en attente (`seedCrmWriteRequests`) : logique de semis, les salles déjà semées sont rejouées.
// 15/10/2026 — fusion main (L5/L6) + lot L-D1/L-F : révision au-dessus des deux côtés.
// 15/10/2026 — les dossiers de compte Crédit Agricole, VINCI, Enedis et Safran (comptes d'extension, hors
// `DEMO_DOSSIERS`) : les salles déjà semées doivent être rejouées.
// 16/10/2026 (recette des 4 dossiers) — les tuiles CONTACTS et les décomptes de décideurs de Crédit Agricole et VINCI
// égalent le nombre de personnes semées (403 / 255) : les briefs JSON changent, les salles déjà semées sont rejouées.
// 16/10/2026 (Louis) — à rôle égal, les contacts joignables (e-mail ou téléphone) sont semés avant ceux sans coordonnée
// (`briefContactSeeds`, tous les comptes à brief) : logique de semis, les salles déjà semées sont rejouées.
// 23/10/2026 (refonte Théo) — CV lus cette semaine (`DEMO_CV_READ_THIS_WEEK`) et cadre de mission (`DEMO_MISSION_FRAME`, MISSIONS-A) entrent dans l’empreinte: rejeu des salles déjà semées.
// 23/10/2026 (Louis, lot R23-N-WEB-A) — la vue enregistrée du vivier (`seedTalentSavedView`, « Mes vues ») : rejeu.
export const DEMO_SEED_REVISION = 18

function buildIdentifier(): string {
  return process.env['RAILWAY_GIT_COMMIT_SHA'] ?? process.env['GIT_COMMIT'] ?? `rev-${DEMO_SEED_REVISION}`
}

/** Pure — testée sans dépendre de `process.env` ni de l'horloge de module. */
export function computeDemoSeedFingerprint(build: string, dossiers: readonly unknown[]): string {
  return importContentFingerprint(`${build}|${JSON.stringify(dossiers)}`)
}

/** L'empreinte du process courant — ce qui est stampé sur une salle au semis,
 *  et comparé au bail suivant (voir `demo-reset.service.ts`).
 *
 *  #3068 (généralisé) — TOUS les exports `DEMO_*` que
 *  `DemoSeedService.seedWorkspace` sème réellement depuis `demo-dataset.ts`,
 *  pas seulement `DEMO_DOSSIERS` : voir le docblock ci-dessus. Gardé complet
 *  par `demo-seed-fingerprint.spec.ts`, dérivé de l'import réel de
 *  `demo-seed.service.ts` — jamais recopié à la main. */
export const DEMO_SEED_FINGERPRINT: string = computeDemoSeedFingerprint(buildIdentifier(), [
  DEMO_ACTION_OS_APPROVAL,
  DEMO_ACTIVITIES,
  DEMO_EVENT_PARTICIPANTS,
  DEMO_ANALYSED_ACCOUNTS,
  DEMO_EXTENSION_ACCOUNTS,
  DEMO_SUBMISSIONS_MIN_TOTAL,
  DEMO_EXPERTISE_GROUNDINGS,
  DEMO_AGREEMENT_CONFIRMED_CONSULTANT,
  DEMO_STAFFING,
  DEMO_ANALYSIS_BATCH,
  DEMO_WORK_PROGRESS,
  DEMO_BRIDGE_CONTACTS,
  DEMO_COLLEAGUES,
  DEMO_COLLEAGUE_ACTIVITY,
  DEMO_TEAM_RESEARCH,
  DEMO_TEAM_THREADS,
  DEMO_DELEGATED_ACTIONS,
  DEMO_ACTIVE_ANALYSIS_BY_COLLEAGUE,
  DEMO_SHARED_ACCOUNT_WORK,
  DEMO_ESTIMATED_EMAIL_CONTACTS,
  DEMO_HAND_ENTERED_TALENT_FIELDS,
  DEMO_BUSINESS_UNITS,
  DEMO_SHARED_BASE_ACTION_OUTCOMES,
  DEMO_SHARED_BASE_CASE_OUTCOMES,
  DEMO_SHARED_BASE_SIGNAL_DEALS,
  DEMO_SHARED_BASE_COMPANY_ROLES,
  DEMO_SHARED_BASE_MESSAGE_LEARNING,
  DEMO_SHARED_BASE_MARKET_PATTERNS,
  DEMO_INFERRED_PLACED_ROLES,
  DEMO_CHAIN_MANUAL_MARKS,
  DEMO_COMMERCIAL_OUTCOMES,
  DEMO_CONSULTANTS,
  DEMO_COPILOT_CANCELLED_JOB,
  DEMO_COPILOT_DONE_JOB,
  DEMO_COPILOT_LONG_JOB,
  DEMO_CRM_DEALS,
  DEMO_CRM_MIRROR,
  DEMO_ORG_CRM_MARKED_CONTACTS,
  DEMO_OUTREACH_ASSETS,
  DEMO_TEAM_POLICY,
  DEMO_CV_IMPORT_CONSULTANTS,
  DEMO_DELIVERY_CARRIER,
  DEMO_DELIVERY_CLIENT,
  DEMO_DISCOVER_CANDIDATE_NOTE,
  DEMO_DOSSIERS,
  DEMO_DOCUMENT_IDENTITY,
  DEMO_FLAGSHIP_NEED_SOURCE_URL,
  DEMO_ACCOUNT_CRM_EXPORT,
  DEMO_ENTITY_RESOLUTION_CORRECTION,
  DEMO_JOB_OFFER_THREAD,
  DEMO_LONG_LAURA_THREAD,
  DEMO_RESTRICTED_SOURCE_THREAD,
  DEMO_SAMPLE_PLAN_V1,
  DEMO_SAMPLE_PLAN_V2,
  DEMO_SG_COMPLETE_LEAD,
  DEMO_ESN_PROFILE,
  DEMO_TARGET_PERSONAS,
  DEMO_SOLD_SENIORITY_LEVELS,
  DEMO_PERSONAL_ACCESS_EXTRA_SEEDS,
  DEMO_PERSONAL_ACCESS_PATH_SEED_SPECS,
  DEMO_PERSONAL_CONTACTS,
  DEMO_EXPENSE_POLICY,
  DEMO_EXPENSE_REPORTS,
  DEMO_EXTERNAL_SOURCING_CONSULTANTS,
  DEMO_EXTERNAL_SOURCING_PARTNER_NAME,
  DEMO_EXTERNAL_SOURCING_SKILL,
  DEMO_FACTORING,
  DEMO_FLAGSHIP_NEED,
  DEMO_ICEBREAKER_INSUFFICIENT_CONTEXT_CONTACT,
  DEMO_INTEGRATION_SYNC_RUN,
  DEMO_LEGAL_ENTITY,
  DEMO_LOST_DEAL_REX,
  DEMO_SECOND_LOST_DEAL,
  DEMO_THIRD_LOST_DEAL,
  DEMO_MARGIN_ALERT_THRESHOLD_PERCENT,
  DEMO_MEMBER_OBJECTIVE,
  DEMO_MEMORY_FACTS,
  DEMO_MESSAGE_LIBRARY_ENTRIES,
  DEMO_MESSAGE_STYLE_TEMPLATES,
  DEMO_MESSAGE_STYLE_RULE_PROPOSALS,
  DEMO_MESSAGE_DRAFT_VERSION_SEED_SPECS,
  DEMO_RECRUITMENT_SEED_SPECS,
  DEMO_SPRINT_PARTNER_ROUTE_PARTNER,
  DEMO_SPRINT_SUGGESTED_SWITCH_PARTNER,
  DEMO_MISSION_BUSINESS_UNIT_TRANSFER,
  DEMO_CONTACT_SCOPE_DIFFERENCE,
  DEMO_MISSION_CLIENT_MANAGER,
  DEMO_NOTES,
  DEMO_MISSING_EXPERTISE,
  DEMO_NO_DEFENDABLE_PROFILE_NEED,
  DEMO_PILOTAGE_WEEK_MOVES,
  DEMO_PROBABILITY_CALIBRATION,
  DEMO_PIPE_L2,
  DEMO_OUTREACH_CALL_TASKS,
  DEMO_ANALYSIS_RUNS,
  DEMO_HISTORY_RUNS,
  DEMO_VERIFICATION_RUNS,
  DEMO_OUTREACH_MESSAGES,
  DEMO_OWNER,
  DEMO_PARTNER_RELATIONS,
  DEMO_PLAN_TASKS,
  DEMO_PROFILE_CONTEXT,
  DEMO_RAG_DOCUMENTS,
  DEMO_RFP,
  DEMO_RFP_INTERRUPTED_IMPORT,
  DEMO_SG_ESN_PARTNERS,
  DEMO_SG_NEED_ANNOTATIONS,
  DEMO_STAFFED_NEED,
  DEMO_SIMILAR_CASES,
  DEMO_START_READINESS_MISSION,
  DEMO_FORFAIT_PROFILE_NEEDS,
  DEMO_SUPERVISED_FORFAIT_MISSION,
  DEMO_SUPERVISED_FORFAIT_NEED,
  DEMO_CONTACT_TARGET_LISTS,
  DEMO_IMPORT_HISTORY,
  DEMO_TARGET_LIST,
  DEMO_TIERED_TARGET_LIST,
  DEMO_TASKS,
  DEMO_TERRITORIES,
  DEMO_TERRITORY_SNAPSHOTS,
  DEMO_TIMESHEET_EXCEPTIONS,
  DEMO_UNQUALIFIED_CONTACTS,
  DEMO_AUTO_MERGED_DUPLICATE,
  DEMO_PIPELINE_DETECTIONS,
  DEMO_USER_ACTIONS,
  DEMO_CARD_RUN,
  DEMO_WORKFLOW_RUN,
  DEMO_WORK_CONTEXT,
  DEMO_IMPORT_MARKS,
  DEMO_CRM_COMPLETION,
  DEMO_PREPARED_CHANNEL_DRAFT_SEED_SPECS,
  DEMO_SCHEDULED_SEND_SEED_SPECS,
  DEMO_CV_READ_THIS_WEEK,
  DEMO_MISSION_FRAME,
])
