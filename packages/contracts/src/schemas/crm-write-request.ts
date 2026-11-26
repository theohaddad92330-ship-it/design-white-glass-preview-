import { z } from 'zod'
import { writeRequestTargetSchema } from './write-request-target.js'

/**
 * La file d'attente des écritures CRM — le guichet de la porte de validation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine dit : « une écriture CRM/ERP passe par une porte — geste
 * d'utilisateur = auto-approuvé, geste de SYSTÈME = demande VISIBLE,
 * prévisualisation FIGÉE, expiration 3 jours ». La moitié « demande visible »
 * n'existait pas : `GET /crm/write-requests` rendait l'ENTITÉ BRUTE, et aucun
 * écran ne l'appelait. Une note de téléphonie versée en fond partait donc en
 * attente, et personne ne pouvait la voir — « en attente » voulait dire
 * « perdu ».
 *
 * ⚠️ L'entité brute ne pouvait pas être exposée telle quelle : elle porte la
 * charge utile complète, la clé d'idempotence, la réponse du fournisseur et son
 * NOM — et un nom d'éditeur ne traverse jamais vers l'app (on nomme la
 * capacité : « ton CRM »). Cette vue est ce qu'un écran a besoin de savoir, et
 * rien de plus.
 */

/** Les natures d'écriture que le produit sait demander. Miroir de
 *  `OUTBOUND_WRITE_KINDS` côté API — la garde `crm-write-request-view.spec.ts`
 *  fait échouer la CI si les deux divergent. */
export const CRM_WRITE_KINDS = [
  'export_contact',
  'create_note',
  'create_task',
  'log_meeting',
  'create_company',
  'create_list',
  'enroll_sequence',
  // #1934.18 — le stade d'une affaire, PROPOSÉ par le copilote à partir d'un
  // compte rendu. EN FIN de liste : un vocabulaire ne perd jamais de valeur et
  // n'en insère jamais au milieu (GA-08).
  'update_deal_stage',
  // #2777 — une opportunité candidate, PROPOSÉE comme Deal à partir d'un
  // compte rendu. Même raison que le stade ci-dessus : EN FIN de liste.
  'create_deal',
  // #2319.114 (épopée #2985) — clôturer une tâche déjà créée. EN FIN de liste.
  'close_task',
  // #4186 — un besoin déposé dans le CRM par l'adaptateur commun. EN FIN de liste.
  'export_need',
  // #4406.3 — une réponse Beeper, envoyée sur le geste de l'utilisateur. EN FIN de liste.
  'send_chat_message',
] as const
export type CrmWriteKind = (typeof CRM_WRITE_KINDS)[number]

/** Une ligne de la prévisualisation : un champ ÉCRIT, et la valeur qui partira.
 *  Une valeur absente est NOMMÉE absente, jamais rendue par une ligne vide. */
export const crmWritePreviewLineSchema = z.object({
  field: z.string(),
  value: z.string(),
  /**
   * LA CLÉ DE LA CHARGE UTILE, à côté de son libellé (#1498).
   *
   * ⚠️ `field` porte le LIBELLÉ (« Note », « Société »), pas la clé. Tant que la
   * clé n'était nulle part, une prévisualisation modifiée ne pouvait pas être
   * renvoyée dans la charge utile : on savait ce qui s'affichait, pas ce que ça
   * écrivait. C'est ce qui rendait « Modifier » impossible.
   *
   * Optionnelle : les demandes créées avant ce champ n'en ont pas, et une
   * demande sans clé se relit très bien — elle ne se révise simplement pas.
   */
  key: z.string().optional(),
  /**
   * LA VALEUR ACTUELLE, FIGÉE AU MOMENT DE LA DEMANDE (#1498).
   *
   * *« Ancienne valeur → nouvelle valeur »*, comme le retour le demande. Elle
   * est figée avec le reste, et c'est le choix le plus naturel : la
   * prévisualisation entière décrit un INSTANT — celui où la demande a été
   * préparée. La relire à l'ouverture donnerait une valeur fraîche à côté d'une
   * valeur gelée, donc un diff qui ne décrit plus ce qui a été autorisé.
   *
   * ⚠️ `undefined` = **on ne sait pas**, et ce n'est pas « vide ». Le demandeur
   * ne connaît pas toujours l'état du champ chez le fournisseur ; l'écran écrit
   * alors la nouvelle valeur seule, jamais « (vide) → … », qui affirmerait que
   * le champ était vide.
   */
  previous: z.string().nullish(),
})

export const crmWriteRequestViewSchema = z.object({
  id: z.string(),
  kind: z.enum(CRM_WRITE_KINDS),
  /**
   * FIGÉE au moment de la demande — champ par champ, ce qui partira. Jamais un
   * recalcul : entre la demande et la décision le monde a pu changer, et on ne
   * fait pas approuver autre chose que ce qui a été montré.
   */
  preview: z.array(crmWritePreviewLineSchema),
  /**
   * `system` — une routine, un versement de téléphonie, un reflet
   * d'interaction. Personne ne l'a relue, donc rien n'est parti. Le champ est
   * là parce qu'une file où l'on ne distingue pas ce qu'un humain a demandé de
   * ce qu'une machine a proposé se relit mal.
   */
  origin: z.enum(['user', 'system']),
  createdAt: z.string(),
  /** Trois jours. Une demande expirée écrirait un état que plus personne n'a en
   *  tête : elle quitte la file plutôt que de faire croire qu'on peut encore. */
  expiresAt: z.string(),
  /** L'utilisateur est-il à l'origine de la demande ? */
  requestedByYou: z.boolean(),
  /**
   * #1943.8 — où en est la demande. Sans lui, la réponse à « Valider » ne pouvait
   * pas dire si l'écriture est PARTIE (`written`), a échoué (`failed`) ou est
   * partie sans réponse (`unknown` — à vérifier dans le CRM, jamais à relancer).
   * Ordre de la colonne : aucune valeur retirée, les nouvelles EN FIN.
   * Optionnel : une vue d'avant ce champ reste valide (onglets et fixtures d'avant).
   */
  state: z
    .enum(['pending', 'approved', 'rejected', 'expired', 'failed', 'written', 'superseded', 'writing', 'unknown'])
    .optional(),
  /**
   * #2200.10 / #2200.11 / #2200.17 / #2201.21 — l'objet visé, projeté depuis
   * la prévisualisation déjà FIGÉE (`preview`) quand elle porte un nom de
   * société ou de contact — jamais depuis un identifiant interne qui
   * n'existe pas encore pour une écriture CRM (`accountId`/`contactId` restent
   * `null`, absence de mesure assumée, pas une valeur inventée).
   */
  target: writeRequestTargetSchema,
  /**
   * #2864 — reste du lot précédent : le collègue à qui la demande est
   * CONFIÉE (`OutboundWriteService.assign`). `null` = circuit d'origine,
   * jamais « personne » en creux — même sémantique que sur une approbation.
   */
  assignedTo: z.string().nullable().optional(),
  /**
   * #2856 — reste du lot précédent : reportée jusqu'à cette date
   * (`OutboundWriteService.snooze`). La demande reste `pending` : reporter ne
   * décide rien, elle sort seulement de la file active jusque-là.
   */
  snoozedUntil: z.string().nullable().optional(),
  /**
   * #2854 (#2201.9) — le LOT auquel cette demande appartient, quand elle a
   * été déposée avec d'autres via `OutboundWriteService.requestBatch()`.
   * `null` = demande seule, jamais un lot d'un seul élément deviné. C'est ce
   * qui permet à l'écran de regrouper plusieurs écritures sous UNE carte, avec
   * la possibilité d'ouvrir chacune — jamais une fausse fusion qui rendrait un
   * état commun à des décisions en réalité indépendantes.
   */
  batchId: z.string().nullable().optional(),
  /**
   * #4186.2 — VERS QUEL CRM part l'écriture, maintenant que la porte sert tous
   * les fournisseurs. Nommé par l'espace CRM de l'utilisateur (son
   * `accountLabel`, « Acme Corp »), JAMAIS par l'éditeur — on nomme ce que
   * l'espace a BRANCHÉ. `null` = ce CRM n'est plus branché, ou son espace n'a
   * pas de nom connu : l'écran dit alors « ton CRM », sans deviner.
   */
  destination: z.string().nullable().optional(),
})
export type CrmWriteRequestView = z.infer<typeof crmWriteRequestViewSchema>

/**
 * La réponse de `GET /crm/write-requests` — un ÉTAT, jamais un tableau nu.
 *
 * « Aucune demande en attente » et « aucun CRM branché, donc rien ne peut
 * partir » sont deux situations opposées qu'une liste vide rendait
 * identiques — et une erreur se remarque là où une liste vide se croit.
 */
export const crmWriteRequestsSchema = z.object({
  status: z.enum(['ready', 'not_connected', 'not_configured']),
  requests: z.array(crmWriteRequestViewSchema),
})
export type CrmWriteRequests = z.infer<typeof crmWriteRequestsSchema>

/** Corps de `POST /crm/write-requests/:id/decide`. Approuver ou refuser — il
 *  n'y a pas de troisième geste, et surtout pas « plus tard » : l'expiration à
 *  trois jours EST le « plus tard ». */
export const decideCrmWriteSchema = z.object({ approve: z.boolean() })
export type DecideCrmWrite = z.infer<typeof decideCrmWriteSchema>
