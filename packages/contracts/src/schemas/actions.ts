import { z } from 'zod'
import { paginatedResultSchema } from './pagination.js'
import { commercialCanonicalStageSchema } from './commercial-state-machine.js'

export const actionTypeSchema = z.enum([
  'message_copied',
  'message_sent',
  'response_received',
  'rdv_obtained',
  'deal_signed',
  'analysis_started',
  'analysis_completed',
  'export',
  'plan_action_added',
  'plan_action_completed',
  'plan_action_uncompleted',
  'plan_action_skipped',
  'plan_action_rescheduled',
  'plan_action_opened',
  'plan_action_contact_opened',
  'plan_action_message_generated',
  'plan_action_message_copied',
  'plan_action_message_sent',
  'plan_action_call_prepared',
  'plan_action_call_logged',
  'plan_action_linkedin_opened',
  'plan_action_enrichment_requested',
  'plan_action_assigned',
  // Traçage §8 « Historique » : deux événements SYSTÈME (pas des gestes du
  // commercial). Émis best-effort, uniquement sur un changement RÉEL.
  //  - `account_score_changed` : le score de priorité d'un compte a bougé à la
  //    complétion d'une (ré)analyse — de X à Y, X ≠ Y (jamais un premier score).
  //  - `profile_updated` : le profil ESN (contexte commercial) a été modifié.
  'account_score_changed',
  'profile_updated',
  // Plan d'attaque d'un besoin. Il DÉBITE un crédit, il doit donc laisser une
  // trace : le journal d'activité est l'endroit où un commercial retrouve ce
  // qu'il a consommé et pourquoi. Il n'en écrivait aucune — vu en production le
  // 04/08, un plan préparé à 16h05 restait invisible dans « Dernières actions
  // enregistrées » pendant que l'enrichissement de 14h34 y figurait.
  'need_play_generated',
  // #2117.24 — un changement de statut commercial (qui, de → vers, motif).
  // Ajouté en FIN de liste (GA-08) ; le CHECK SQL est élargi par
  // `1793700310000-CommercialStatusChangedActionType`, AVANT le code qui l'écrit.
  'commercial_status_changed',
  // #2277.36 (épopée #2771) — `ActionRouterService.dispatchCrmTask` journalise
  // sous ce type depuis le lot #1931 SANS que le CHECK SQL ne l'ait jamais
  // autorisé (trouvé en préparant le rollback `remove_crm_task`, qui cible
  // cette même ligne) : chaque écriture était rejetée par Postgres, avalée en
  // silence par le `catch` best-effort de `journal()` — aucune tâche CRM créée
  // depuis le routeur n'a jamais laissé de trace au Journal d'activité.
  // Ajouté en FIN de liste (GA-08) ; le CHECK SQL est élargi par
  // `1796321339217-CrmTaskCreatedActionType`, AVANT ce correctif.
  'crm_task_created',
])

export const actionChannelSchema = z.enum(['linkedin', 'email', 'phone', 'meeting', 'other'])

export const trackActionSchema = z.object({
  action_type: actionTypeSchema,
  account_id: z.string().guid().optional(),
  contact_id: z.string().guid().optional(),
  channel: actionChannelSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

/**
 * Décomposition d'un compteur d'« envois » par provenance.
 *
 * `verified` = Bellum a réellement expédié (preuve de livraison).
 * `declared` = le commercial affirme avoir envoyé lui-même (LinkedIn — Bellum
 * n'a aucune API de messagerie et n'envoie rien).
 * `unattributed` = historique dont la nature n'est pas prouvable.
 *
 * Un total d'envois ne doit JAMAIS être présenté sans cette décomposition :
 * fondre du déclaratif dans du vérifié rend le chiffre auto-gonflable.
 */
export const messageSendBreakdownSchema = z.object({
  verified: z.number().int().nonnegative(),
  declared: z.number().int().nonnegative(),
  unattributed: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

/**
 * Les issues d'une approche que le commercial CONSIGNE lui-même : il a répondu,
 * un rendez-vous est décroché, une affaire est signée.
 *
 * Elles sont déclaratives par construction — Bellum ne lit pas la boîte mail du
 * commercial et ne peut donc rien en déduire. La seule source est son geste,
 * porté par le changement de statut du contact (`replied` / `meeting`) et par
 * le passage d'un compte en `customer`.
 */
export const OUTCOME_ACTION_TYPES = ['response_received', 'rdv_obtained', 'deal_signed'] as const

export const weeklyStatsSchema = z.object({
  /** Total tous canaux — TOUJOURS accompagné de `messages_breakdown`. */
  messages_sent: z.number().int().nonnegative(),
  messages_breakdown: messageSendBreakdownSchema,
  messages_copied: z.number().int().nonnegative(),
  /**
   * Réponses consignées sur la fenêtre, ou `null` — « non mesuré ».
   *
   * ⚠️ `null` n'est PAS `0`, et la distinction est la raison d'être de ce champ.
   * Ces compteurs ont été LUS pendant des mois sans que rien ne les ÉCRIVE : le
   * produit n'offrait aucun geste pour dire « il a répondu ». « 0 réponse »
   * affirmait alors qu'on avait mesuré et trouvé zéro, quand la vérité était
   * qu'on n'avait jamais eu le moyen d'en enregistrer une.
   *
   * La règle appliquée : `null` tant que l'espace n'a JAMAIS consigné d'issue de
   * cette famille ; un vrai `0` dès qu'il en a consigné au moins une — ce zéro-là
   * est une mesure (« rien cette semaine »), et il se garde.
   */
  responses: z.number().int().nonnegative().nullable(),
  rdv_obtained: z.number().int().nonnegative().nullable(),
  /**
   * Réponses / total des envois. Le dénominateur est le TOTAL (et non les seuls
   * envois vérifiés) : les réponses arrivent aussi sur les envois déclarés
   * LinkedIn — les diviser par les seuls emails gonflerait le taux.
   *
   * `null` quand le taux n'est pas dérivable : numérateur non mesuré, ou aucun
   * envoi au dénominateur. « 0 % » sur un espace qui n'a rien envoyé décrit une
   * contre-performance qui n'a pas eu lieu.
   */
  response_rate: z.string().nullable(),
})

export const actionHistoryCategorySchema = z.enum(['analysis', 'enrichment', 'export', 'message', 'reminder', 'other'])

/**
 * Le rollback OFFERT sur cette ligne, ou `null` — épopée #2771 (#2277.33/.35/.36).
 *
 * Trois des cinq intents de rollback (`cancel_reminder`, `restore_status`,
 * `remove_crm_task`) ciblent une ligne `user_actions` PAR SON ID
 * (`ActionHistoryItem.id`) : c'est ce même id qui sert de `targetId` au
 * dispatch. Calculé côté serveur à partir de `user_actions.metadata`, jamais
 * deviné par le client — un rollback déjà consommé (`cancelled_at`,
 * `withdrawn_at`, `restored_at`) ou dont la donnée requise manque
 * (`previous_status` absent) rend `null`, jamais un bouton qui échouera au clic.
 *
 * `stop_sequence` (cible une séquence, pas une ligne `user_actions`) et
 * `delete_draft` (aucune trace persistée d'un brouillon créé) n'ont pas leur
 * place ici — voir le commentaire de l'écrivain sur #2771.
 */
export const actionHistoryRollbackSchema = z.enum(['cancel_reminder', 'restore_status', 'remove_crm_task'])

export const actionHistoryQuerySchema = z.object({
  type: actionHistoryCategorySchema.optional(),
  status: z.string().trim().min(1).optional(),
  period: z.enum(['7d', '30d', '90d']).optional(),
  /**
   * Recherche par compte : fragment du nom de l'entreprise, matché en `ILIKE`
   * côté serveur. Texte libre (et non un id) parce qu'on cherche un journal
   * « chez qui ? » sans quitter la page pour aller chercher un identifiant.
   */
  account: z.string().trim().min(1).max(120).optional(),
  /**
   * Théo B R2.A5 (décision Louis 22/10/2026) — l'historique est celui de l'ESPACE ; `me` le restreint à
   * l'appelant. Défaut `space`. Ce n'est jamais un autre espace : l'espace vient de la session, pas de la requête.
   */
  scope: z.enum(['space', 'me']).optional(),
  /** Auteur de l'action — un membre de l'espace de travail (`user_actions.user_id`). */
  actorId: z.string().guid().optional(),
  /**
   * #2200.38 — le canal de l'action (LinkedIn, e-mail, téléphone, RDV, autre).
   * La colonne existe déjà sur chaque ligne (`channel`, nullable) ; seul le
   * filtre manquait, obligeant à relire tout le journal pour « que s'est-il
   * passé sur LinkedIn ».
   */
  channel: actionChannelSchema.optional(),
  /**
   * Borne basse EXCLUSIVE (`created_at > since`) — le mode « Depuis votre
   * dernière connexion » du Journal. Datetime ISO 8601 ; c'est le repère
   * `last_seen_at` posé au sign-in (voir {@link sinceLastSeenSchema}), pas une
   * saisie libre. Composé avec les autres filtres (type/statut/compte…).
   */
  since: z.string().datetime({ offset: true }).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

/**
 * Réponse de `POST /actions/mark-seen` : le repère « depuis quand » à afficher
 * dans le mode « Depuis votre dernière connexion ».
 *
 * `since` = le `previous_seen_at` de l'utilisateur (l'instant de sa visite
 * PRÉCÉDENTE), figé pour toute la session courante. `null` = première visite
 * jamais enregistrée : il n'existe pas encore de « dernière connexion », donc
 * l'écran montre un état d'accueil plutôt qu'une fenêtre vide trompeuse.
 */
export const sinceLastSeenSchema = z.object({
  since: z.string().datetime({ offset: true }).nullable(),
})

export const actionHistoryActorSchema = z.object({
  id: z.string().guid(),
  name: z.string(),
  initials: z.string(),
})

export const actionHistoryTargetSchema = z.object({
  account_id: z.string().guid().nullable(),
  contact_id: z.string().guid().nullable(),
  label: z.string(),
  initials: z.string(),
  /**
   * #3388 (recette 30/09) — le stade CANONIQUE du compte visé, sur l'échelle
   * commune à Projets/Besoins/Missions (`commercial-state-machine.ts`, épopée
   * #2967). Dérivé du besoin le plus récemment mis à jour du compte — aucune
   * seconde machine, la même table `STAGE_BY_SUBJECT['need']`.
   *
   * `.optional()` — même patron que `NeedVerdictResponse.method` — pour ne pas
   * casser les fixtures qui construisent encore une cible sans ce champ ;
   * `null` = compte sans besoin, ou cible sans compte (contact seul).
   */
  commercial_stage: commercialCanonicalStageSchema.nullable().optional(),
})

export const actionHistoryItemSchema = z.object({
  id: z.string().guid(),
  action_type: actionTypeSchema,
  category: actionHistoryCategorySchema,
  action_label: z.string(),
  detail: z.string(),
  /**
   * Libellé de statut, ou ABSENT quand l'issue est réellement inconnue — une
   * ligne « Analyse lancée » antérieure à la clé de corrélation ne peut pas être
   * résolue, et prétendre « En cours » rendait un run mort indiscernable d'un run
   * vivant. Le client n'affiche alors aucun badge.
   */
  status: z.string().optional(),
  channel: actionChannelSchema.nullable(),
  actor: actionHistoryActorSchema,
  target: actionHistoryTargetSchema,
  created_at: z.string(),
  /** `null` = aucun rollback offert sur cette ligne (voir {@link actionHistoryRollbackSchema}). */
  rollback: actionHistoryRollbackSchema.nullable(),
  /**
   * #2319.114 (épopée #2985) — la ligne cible une tâche CRM créée (`crm_task_created`),
   * pas encore retirée ni clôturée, chez un fournisseur qui sait fermer une
   * tâche (HubSpot). `false` par défaut : ce N'EST PAS un rollback (rien ne
   * défait `create_crm_task`, on le TERMINE), donc un champ à part plutôt
   * qu'une sixième valeur dans {@link actionHistoryRollbackSchema}.
   */
  crmTaskClosable: z.boolean(),
})

export const actionHistoryResponseSchema = paginatedResultSchema(actionHistoryItemSchema)

export type ActionType = z.infer<typeof actionTypeSchema>
export type ActionChannel = z.infer<typeof actionChannelSchema>
export type ActionHistoryCategory = z.infer<typeof actionHistoryCategorySchema>
export type ActionHistoryRollback = z.infer<typeof actionHistoryRollbackSchema>
export type ActionHistoryQuery = z.infer<typeof actionHistoryQuerySchema>
export type ActionHistoryActor = z.infer<typeof actionHistoryActorSchema>
export type ActionHistoryTarget = z.infer<typeof actionHistoryTargetSchema>
export type ActionHistoryItem = z.infer<typeof actionHistoryItemSchema>
export type ActionHistoryResponse = z.infer<typeof actionHistoryResponseSchema>
export type SinceLastSeen = z.infer<typeof sinceLastSeenSchema>
export type TrackActionInput = z.infer<typeof trackActionSchema>
export type WeeklyStats = z.infer<typeof weeklyStatsSchema>
export type MessageSendBreakdown = z.infer<typeof messageSendBreakdownSchema>
