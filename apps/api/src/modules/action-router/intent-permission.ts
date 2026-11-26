import type { ActionIntent, WorkspacePermission, WorkspaceRuleGesture } from '@bellum/contracts'

/**
 * Le droit PROPRE à l'effet de chaque intent — celui de la route directe qu'il
 * remplace, et aucun autre (D1, revue de sécurité du lot Action OS, 13/09/2026).
 *
 * - `send_email` → `messages:send` (`POST contacts/:id/send`, `contacts.controller.ts`) ;
 * - `enrich_contact` → `contacts:enrich` (`POST contacts/:id/enrich`) ;
 * - `create_crm_task`, `create_crm_note` → `data:export` (`POST crm/tasks`,
 *   `POST crm/contacts/:crmId/activity`, `POST crm/hubspot/export`) ;
 * - tout le reste → `null` : un rappel, un report, une notification à soi-même,
 *   un brouillon généré ou déposé dans SA messagerie, un réglage ou une note
 *   personnels — leurs routes n'exigent aucun droit d'espace au-delà du jeton.
 *
 * Épopée #2771 — les cinq rollbacks reprennent le droit de la route DIRECTE
 * qu'ils imitent : `restore_status` écrit `contact.user_status`, exactement
 * ce que `PATCH contacts/:id/status` exige déjà en `records:write`
 * (`contacts.controller.ts`) ; `remove_crm_task` verse une note CRM, comme
 * `create_crm_note` en `data:export`. Les trois autres (`cancel_reminder`,
 * `stop_sequence`, `delete_draft`) n'écrivent que chez nous ou dans une
 * messagerie PERSONNELLE — même portée que leurs gestes d'origine.
 *
 * `Record` sur l'union des types : un intent ajouté au contrat sans être classé
 * ici ne compile pas. Un droit oublié serait un effet ouvert à tous les sièges.
 */
export const INTENT_PERMISSION: Readonly<Record<ActionIntent['type'], WorkspacePermission | null>> = {
  send_email: 'messages:send',
  enrich_contact: 'contacts:enrich',
  create_crm_task: 'data:export',
  create_crm_note: 'data:export',
  schedule_reminder: null,
  snooze: null,
  create_calendar_event: null,
  notify_user: null,
  generate_message: null,
  create_mail_draft: null,
  update_routine: null,
  update_setting: null,
  pin_memory_fact: null,
  cancel_reminder: null,
  restore_status: 'records:write',
  remove_crm_task: 'data:export',
  // #2319.114 — clôture une tâche CRM, même droit que `create_crm_task`/`remove_crm_task`.
  close_crm_task: 'data:export',
  stop_sequence: null,
  delete_draft: null,
  // #3076 — la MÊME route directe qu'il remplace (`PATCH /projects/:id/stage|amount|btmmp|risks`, `records:write`).
  update_opportunity: 'records:write',
}

/**
 * #2081.14 — le geste qu'une RÈGLE D'ESPACE gouverne, par intent : la SORTIE
 * de données, ou rien (DÉCISION Louis 19/09/2026).
 *
 * - `create_crm_task` → `data_exit` : il POUSSE la fiche du contact dans le
 *   CRM (le même `exportContact` que `POST crm/hubspot/export`, `@DataExit()`) ;
 * - `create_crm_note` → `null` : une note sur une fiche EXISTANTE est un
 *   versement, comme l'appel versé au CRM — ouvert aux membres même quand
 *   l'export est réservé aux administrateurs ;
 * - tout le reste → `null`.
 *
 * À part de `INTENT_PERMISSION` : la permission (`data:export` pour les deux)
 * ne dit pas si le geste fait sortir la donnée. `Record` : un intent ajouté au
 * contrat sans être classé ici ne compile pas.
 *
 * Épopée #2771 — `remove_crm_task` verse une note sur une fiche EXISTANTE,
 * exactement comme `create_crm_note` : `null`, pas `data_exit` (il ne pousse
 * aucune fiche, contrairement à `create_crm_task`).
 */
export const INTENT_WORKSPACE_GESTURE: Readonly<Record<ActionIntent['type'], WorkspaceRuleGesture | null>> = {
  send_email: null,
  enrich_contact: null,
  create_crm_task: 'data_exit',
  create_crm_note: null,
  schedule_reminder: null,
  snooze: null,
  create_calendar_event: null,
  notify_user: null,
  generate_message: null,
  create_mail_draft: null,
  update_routine: null,
  update_setting: null,
  pin_memory_fact: null,
  cancel_reminder: null,
  restore_status: null,
  remove_crm_task: null,
  // #2319.114 — met à jour une tâche EXISTANTE, ne pousse aucune fiche neuve.
  close_crm_task: null,
  stop_sequence: null,
  delete_draft: null,
  // #3076 — écrit dans `projects` (Bellum), jamais dehors : aucune sortie de données.
  update_opportunity: null,
}
