import { z } from 'zod'
import { relanceHistorySchema } from './account-facts.js'
import { evidenceFieldSourceSchema } from './provenance.js'

/**
 * The executable lifecycle of an action-plan item (Théo P1/P2 — "les actions
 * doivent être exécutables : fait, snooze, assigner"). `todo` is the seeded
 * default, `done` mirrors the legacy `done` boolean, `snoozed` parks the item
 * until `snoozed_until`. Kept in sync with the boolean server-side so the
 * existing checkbox flow keeps working.
 *
 * #2123.37 — `prepared` (« Préparée ») : le geste est prêt, pas encore fait. Il
 * reste OUVERT (ni `done`, ni reporté) et s'ajoute EN FIN (GA-08), après la
 * contrainte SQL élargie par `1793700352123-ActionPreparedStatus`.
 * #2123.41 — « Exécutée » n'est pas une valeur : c'est le libellé de `done`.
 * #2317.12 — `obsolete` : un changement de poste, de scope ou de besoin rend
 * l'action caduque — elle est MARQUÉE, jamais supprimée silencieusement
 * (« on archive, on ne supprime pas »). Geste MANUEL (menu d'exécution), pas
 * une détection automatique — celle-ci resterait à construire. Ajoutée EN FIN
 * (GA-08), après la contrainte SQL élargie par
 * `1796321997785-ActionObsoleteStatus`.
 */
export const actionExecutionStatusSchema = z.enum(['todo', 'done', 'snoozed', 'prepared', 'obsolete'])
export type ActionExecutionStatus = z.infer<typeof actionExecutionStatusSchema>

/**
 * #2396.5 — la liste CANONIQUE d'issues qu'une complétion manuelle enregistre.
 *
 * Deux taxonomies voisines existaient déjà sans se parler : `CALL_OUTCOMES`
 * (journal d'appel) et le statut de contact (`contacted/replied/meeting/…`).
 * Celle-ci ne remplace ni l'une ni l'autre — elle est le vocabulaire PARTAGÉ
 * d'une action du plan, la seule ligne qui n'en avait aucun.
 *
 * #3265.3 (BEL-SC-236, P0) — les cinq valeurs d'origine ne distinguaient pas
 * « on m'a orienté vers quelqu'un d'autre » d'« on m'a raccroché au nez » :
 * les deux tombaient dans `declined` ou `no_response`, alors que la seule
 * différence change TOTALEMENT la prochaine action (fermer la route vs.
 * ouvrir la route Delphine — l'exemple même de l'issue #3265 §LAURA). Les
 * quinze valeurs AJOUTÉES réutilisent le vocabulaire déjà canonique de
 * `CALL_OUTCOMES` (`activity.ts`) partout où le concept existe déjà —
 * jamais une deuxième qualification concurrente (instruction commune #3249
 * règle 4) — et n'en inventent que deux : `information_obtained` (aucun
 * équivalent CALL_OUTCOMES : une info utile obtenue sans réorientation ni
 * besoin confirmé) et `need_not_confirmed` (l'envers explicite de
 * `need_confirmed`, absent de CALL_OUTCOMES) et `action_cancelled` (annulée
 * par l'utilisateur — distinct d'`execution_status: 'obsolete'`, qui est une
 * détection de péremption, pas un choix déclaré à la complétion).
 *
 * ⚠️ GA-08 : ne jamais insérer au milieu, une valeur ne disparaît jamais —
 * les cinq valeurs d'origine restent en tête, dans le même ordre.
 *
 * #3416.1 (beta-feedback, lot C14 30/09) — QUATRE issues manquaient encore au
 * §OUTCOMES de la recette : un blocage côté ACHATS et un blocage côté MARGE
 * n'avaient aucun équivalent (les deux ferment la route pour une raison
 * opposée à un refus humain — personne n'a dit non, une contrainte l'a fait à
 * sa place, et la confondre avec `declined`/`refused` ferait porter au
 * commercial un refus qui n'est pas le sien) ; une ERREUR TECHNIQUE (numéro
 * invalide, e-mail qui rebondit sans le motif `invalid_contact`, plantage de
 * l'outil) n'avait pas de case, si bien qu'elle tombait dans `other`, qui ne
 * distingue plus rien ; et ABANDONNÉ (la piste est fermée par lassitude ou
 * faute de temps, pas par un geste explicite) était distinct des trois
 * fermetures déjà connues (`declined` = refus reçu, `action_cancelled` =
 * retrait d'une action pas encore tentée, `not_now` = reste ouvert pour plus
 * tard) sans qu'aucune ne le couvre. Ajoutées EN FIN (GA-08), après la
 * contrainte SQL élargie par `1796409441337-ActionPlanItemOutcomeBlockers`.
 */
export const ACTION_PLAN_OUTCOMES = [
  'positive',
  'declined',
  'deferred',
  'qualified',
  'no_response',
  // #3265.3 — ajouts BEL-SC-236, dans l'ordre du §OUTCOMES de l'issue.
  'information_obtained',
  'connected_qualified',
  'wrong_contact',
  'orientation_given',
  'need_confirmed',
  'need_not_confirmed',
  'callback_scheduled',
  'not_now',
  'refused',
  'no_answer',
  'invalid_contact',
  'left_company',
  'meeting_booked',
  'action_cancelled',
  'other',
  // #3416.1 (lot C14 30/09) — ajouts, dans l'ordre du §OUTCOMES de l'issue.
  'blocked_by_procurement',
  'blocked_by_margin',
  'technical_error',
  'abandoned',
] as const
export const actionPlanOutcomeSchema = z.enum(ACTION_PLAN_OUTCOMES)
export type ActionPlanOutcome = z.infer<typeof actionPlanOutcomeSchema>

/**
 * #2396.1 — les QUATRE modes de complétion d'une action du plan.
 *
 * ⚠️ Corrigé le 23/09/2026 (#2396.1, réfuté sur la prod 7e7105fb7) : ce
 * docblock affirmait encore que `manual` était le SEUL chemin d'écriture réel
 * — faux depuis #2396.3 (même jour, posé APRÈS ce commentaire sans qu'on y
 * revienne). DEUX chemins écrivent réellement `action_plan_items`
 * aujourd'hui :
 *   - `manual` — le clic humain ({@link updateActionPlanItemSchema},
 *     `ActionPlanItemsService.update`) ;
 *   - `proof` — l'envoi VÉRIFIÉ d'un email qui complète automatiquement une
 *     prise de contact encore ouverte, sans qu'un humain choisisse d'issue
 *     (`CadenceService.completeOpenItemsByProof`, apps/api/src/modules/
 *     contacts/cadence.service.ts:153, appelée depuis
 *     `ContactsService.sendEmail`).
 * `event` / `proposed` restent le contrat prêt pour le jour où un pas de
 * workflow ou une proposition de Laura complètera une action sans passer par
 * l'un des deux chemins ci-dessus — aucun des deux n'écrit encore
 * `action_plan_items` aujourd'hui, donc aucun test ne peut les prouver avant
 * qu'ils existent (doctrine : jamais de donnée fictive).
 */
export const ACTION_COMPLETION_MODES = ['manual', 'proof', 'event', 'proposed'] as const
export const actionCompletionModeSchema = z.enum(ACTION_COMPLETION_MODES)
export type ActionCompletionMode = z.infer<typeof actionCompletionModeSchema>

/**
 * #2123.1-.10 — les HUIT natures d'objet qu'une action du plan peut viser.
 *
 * Le Plan d'action était une to-do list flottante : « rappeler le DSI » était
 * du texte libre avec un responsable, et rien ne menait du texte au contact, au
 * projet ni au besoin. Une action nomme désormais l'objet EXISTANT sur lequel
 * elle porte — c'est ce qui la rend cliquable, et ce qui empêche une quatrième
 * copie du mot « action » d'apparaître (constat complet :
 * `agent_docs/plan-un-seul-chemin-de-tache.md`).
 *
 * `verification` est la huitième et la seule qui ne pointe pas vers un objet
 * déjà peuplé : elle porte la CLÉ de ce qu'il faut aller vérifier
 * (`contact.email`, `account.effectif`). Une action à qui il manque une donnée
 * devient d'abord une vérification (#2123.35) plutôt qu'un geste qu'on ne peut
 * pas tenir.
 *
 * ⚠️ GA-08 — une nature ne disparaît jamais et ne s'insère jamais au milieu :
 * l'index n'est pas un sens ici, mais la valeur est écrite en base, contrainte
 * par `action_plan_items_target_kind_check` et traduite dans deux langues.
 */
export const ACTION_TARGET_KINDS = [
  'contact',
  'meeting',
  'crm_task',
  'sequence',
  'project',
  'need',
  'partner',
  'verification',
] as const
export const actionTargetKindSchema = z.enum(ACTION_TARGET_KINDS)
export type ActionTargetKind = z.infer<typeof actionTargetKindSchema>

/**
 * #2395.4/#2395.9 — les QUATRE canaux déjà canoniques d'une action (correctif
 * de collecte le 24/09/2026, #2395.4/.9 : le plan de Laura écrivait déjà le
 * canal de chaque action — `linkedin | email | phone | event | meeting |
 * content`, `apps/ia/app/models/outputs/plan.py`) — mais aucun écrivain ne le
 * persistait, si bien que le type et l'attendu canoniques restaient TOUJOURS
 * `null` (0/213 actions en recette prod le 24/09/2026, f9f23f887). Seuls les
 * quatre canaux qui ont déjà un sens ici (téléphone/e-mail/LinkedIn/réunion)
 * sont gardés — `event`/`content` n'ont pas d'équivalent canonique et
 * resteraient un mensonge de canal.
 *
 * ⚠️ GA-08 — une valeur ne disparaît jamais et ne s'insère jamais au milieu.
 */
export const PLAN_ACTION_CHANNELS = ['phone', 'email', 'linkedin', 'meeting'] as const
export const planActionChannelSchema = z.enum(PLAN_ACTION_CHANNELS)
export type PlanActionChannel = z.infer<typeof planActionChannelSchema>

/**
 * L'objet canonique visé par une action.
 *
 * `id` est l'identifiant de l'objet dans SON référentiel — un uuid pour un
 * contact ou un projet, l'identifiant du fournisseur pour une tâche CRM, une
 * clé de champ pour une vérification. Volontairement une chaîne non vide et pas
 * un uuid : trois des huit référentiels n'émettent pas d'uuid, et deviner le
 * contraire ferait échouer l'écriture au dernier moment.
 *
 * `label` est ce que l'humain LIT sur la carte. Il est stocké avec l'action
 * parce qu'une action reste lisible quand l'objet visé a été archivé — sinon la
 * carte afficherait un identifiant nu, ou pire, rien.
 */
export const actionTargetSchema = z.object({
  kind: actionTargetKindSchema,
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(300),
})
export type ActionTarget = z.infer<typeof actionTargetSchema>

/**
 * #2123.30 — le niveau de confiance d'une action, en trois crans.
 *
 * ⚠️ `null` veut dire NON MESURÉE, et c'est un état à part entière : la
 * question à se poser est « si cette valeur est absente, "faible" est-il VRAI ? »
 * — non. Une action dont on n'a pas évalué la confiance n'est pas une action peu
 * fiable, et l'écran la NOMME non mesurée (GA-18 / GA-19).
 */
export const ACTION_CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const
export const actionConfidenceSchema = z.enum(ACTION_CONFIDENCE_LEVELS)
export type ActionConfidence = z.infer<typeof actionConfidenceSchema>

/**
 * #2123.29 — d'où vient cette action : la source ET la date, jamais l'une sans
 * l'autre (primitive `Provenance` de la doctrine).
 *
 * Le vocabulaire de source est celui de `provenance.ts` — `human` /
 * `connector` / `pipeline` / `model` —, pas un second : une action posée par
 * quelqu'un et une action proposée par un modèle ne se lisent pas pareil, et
 * ce classement existe déjà à un seul endroit (GA-26). `at` est nullable
 * (une ligne historique n'a pas gardé sa date) ; la CLÉ, elle, est obligatoire,
 * pour qu'aucun écran ne puisse afficher une source sans se demander de quand
 * elle date.
 */
export const actionProvenanceSchema = z.object({
  source: evidenceFieldSourceSchema,
  at: z.string().nullable(),
})
export type ActionProvenance = z.infer<typeof actionProvenanceSchema>

/**
 * #2123.33 — la page PROPRIÉTAIRE d'une action se DÉRIVE de la nature de son
 * objet ; elle ne se stocke pas.
 *
 * Deux chemins qui refont la même dérivation divergent (GA-26), et une colonne
 * de plus serait le second chemin : elle pourrait dire « contacts » sur une
 * action qui vise un projet. Une action appartient à la page où vit l'objet
 * qu'elle fait avancer — c'est ce qui permet d'aller de « rappeler le DSI » au
 * contact, et c'est la question à laquelle #2123.1 répond.
 *
 * Une vérification appartient au dossier du compte : c'est là que la donnée
 * manquante se complète.
 */
const OWNER_PAGE_BY_KIND: Readonly<Record<ActionTargetKind, string>> = {
  contact: 'contacts',
  meeting: 'agenda',
  crm_task: 'actions',
  sequence: 'sequences',
  project: 'projets',
  need: 'besoins',
  partner: 'partenaires',
  verification: 'dossier',
}

export function actionOwnerPage(kind: ActionTargetKind): string {
  return OWNER_PAGE_BY_KIND[kind]
}

/**
 * A single, user-trackable action-plan item. Seeded from the generated plan
 * (`action_plans.weeks`) the first time an account's plan is read, then owned by
 * the user: `done` / `due_date` persist per item so the checklist survives a
 * reload and overdue items can drive the "Rappels de relance" notification.
 *
 * `week_index` / `step_index` are the item's 0-based position inside the
 * generated plan (phase, action) — the natural key the web board uses to overlay
 * persisted state onto the rendered plan. `due_date` is a calendar date
 * (`YYYY-MM-DD`, no timezone); `completed_at` / `snoozed_until` are ISO
 * timestamps. `execution_status` is the executable state and `assigned_to` the
 * workspace member the action is delegated to (both default `todo` / `null`).
 */
export const actionPlanItemSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  label: z.string(),
  week_index: z.number().int().min(0),
  step_index: z.number().int().min(0),
  done: z.boolean(),
  due_date: z.string().nullable(),
  completed_at: z.string().nullable(),
  execution_status: actionExecutionStatusSchema,
  snoozed_until: z.string().nullable(),
  assigned_to: z.string().guid().nullable(),
  /**
   * #4158.31 — la note de contexte laissée par celui qui a délégué l'action, et son
   * auteur. `null` sur une action non déléguée et sur toute délégation antérieure :
   * « pas de note » est une réponse honnête, jamais un texte inventé.
   */
  handoff_note: z.string().nullable().optional(),
  handoff_by: z.string().guid().nullable().optional(),
  /**
   * #4158.48 — la ligne est-elle modifiable PAR LE LECTEUR ? Vrai pour l'assigné,
   * le créateur et un détenteur de `team:manage` ; faux pour tout autre membre de
   * l'espace (l'écran la montre alors en lecture, sans bouton actif). `true` par
   * défaut : absent = pas de restriction inventée.
   */
  can_edit: z.boolean().optional(),
  /**
   * #2123.46 — le responsable SAISI au formulaire du plan (« Sophie »), tel
   * qu'il était écrit dans `raw_analysis.user_plan_actions` avant que l'action
   * ne devienne une ligne.
   *
   * Ce n'est PAS `assigned_to`, qui est l'identifiant d'un membre de l'espace :
   * un prénom tapé à la main ne délègue rien et n'ouvre aucun droit. Les
   * confondre aurait fait disparaître le champ en silence le jour où le
   * formulaire a changé de porte — le défaut que ce lot répare.
   *
   * `null` par défaut : une ligne écrite avant la règle n'en porte pas, et une
   * chaîne vide se lirait comme un responsable nommé « rien ».
   */
  owner_name: z.string().nullable().default(null),
  /**
   * #2123.46 — le RÉSULTAT ATTENDU et l'INDICATEUR d'une action, tels que les
   * quatre autres écrivains du plan (la veille, la fiche contact, le panneau
   * besoin, l'ajout en masse de contacts) les écrivaient dans
   * `raw_analysis.user_plan_actions`. La ligne canonique n'avait pas de place
   * pour eux : les basculer sans ces colonnes aurait perdu en silence ce que la
   * carte du plan affichait.
   *
   * `null` par défaut : une ligne écrite avant la règle n'en porte pas.
   */
  expected_outcome: z.string().nullable().default(null),
  kpi: z.string().nullable().default(null),
  /**
   * #2395.4/#2395.9 — le CANAL déjà écrit par le plan de Laura (`bellum_plan.py`
   * : linkedin/email/phone/event/meeting/content), gardé SEULEMENT quand il
   * correspond à un canal déjà canonique (téléphone/e-mail/LinkedIn/réunion) —
   * un « event » ou un « content » n'a pas d'équivalent canonique aujourd'hui
   * et reste non rangé plutôt qu'un mensonge de canal (`readChannel`,
   * `action-plan-items.service.ts`). C'est ce que le TYPE et l'ATTENDU
   * canoniques (`packages/contracts/src/schemas/action.ts`) lisent pour se
   * déterminer SANS deviner.
   *
   * `null` par défaut : une ligne écrite avant la règle, ou un item manuel où
   * aucun canal n'a été saisi (le formulaire ne le demande pas).
   */
  channel: planActionChannelSchema.nullable().default(null),
  /**
   * #2153.57 — le RÉSULTAT, distinct de `expected_outcome`/`kpi` juste
   * au-dessus (l'ATTENDU, écrit AVANT le geste). Purement DÉCLARATIF, comme
   * « Fait » lui-même : une phrase que l'auteur de l'action tape après coup,
   * jamais une preuve d'exécution vérifiée par Bellum
   * (`c73_fait_ne_porte_pas_preuve_denvoi`, `agent_docs/doctrine.md:41`).
   * `null` = rien de saisi, jamais une chaîne vide.
   */
  result: z.string().nullable().default(null),
  /**
   * #2123.1 — l'objet canonique visé. `null` sur les lignes ÉCRITES AVANT
   * cette règle : on archive, on ne supprime pas, et une action historique
   * reste lisible. Une action NEUVE en porte un ({@link createActionPlanItemSchema}).
   */
  target: actionTargetSchema.nullable(),
  /** #2123.21 — POURQUOI cette action, en une phrase. `null` = pas de raison écrite. */
  reason: z.string().nullable(),
  /** #2123.24 — le contact lié, quand l'action passe par quelqu'un. */
  contact_id: z.string().guid().nullable(),
  /** #2123.28 — l'action qui doit être faite AVANT celle-ci. */
  depends_on_item_id: z.string().guid().nullable(),
  /** #2123.29 — la source et sa date. `null` = provenance non conservée (lignes historiques). */
  provenance: actionProvenanceSchema.nullable(),
  /** #2123.30 — `null` = confiance NON MESURÉE, ce qui n'est pas « faible ». */
  confidence: actionConfidenceSchema.nullable(),
  /**
   * #2123.31 — le coût en crédits, annoncé AVANT le geste qui le facture
   * (GA-49 / GA-86). `null` = NON MESURÉ ; `0` veut dire gratuit, ce qui est
   * une autre affirmation. Un négatif est refusé : ce serait un remboursement,
   * qui ne s'écrit pas ici.
   */
  cost_credits: z.number().int().min(0).nullable(),
  /** #2396.2/.5 — l'issue choisie à la complétion manuelle. `null` = non complétée, ou ligne antérieure à la règle. */
  outcome: actionPlanOutcomeSchema.nullable().default(null),
  /** #2396.1 — comment l'action a été complétée. `null` = pas encore complétée. */
  completion_mode: actionCompletionModeSchema.nullable().default(null),
  /**
   * #3287 (#3265.2) — QUELLE recommandation a produit cette action (distinct de
   * `provenance`, qui dit QUI/QUAND). Une clé courte posée par l'écrivain réel
   * (ex. `renewal_decision`). `null` = action saisie à la main, sans recommandation.
   */
  source_recommendation: z.string().nullable().default(null),
  /** #3287 (#3265.2) — l'identifiant d'une règle du corpus méthode (`METHOD_CORPUS_V1`) sous laquelle l'action a été posée. `null` = aucune. */
  method_rule: z.string().nullable().default(null),
  /** #3287 (#3265.2) — l'identifiant côté fournisseur (événement d'agenda…) quand le geste a RÉELLEMENT été exécuté ailleurs. `null` = rien d'exécuté hors de Bellum. */
  external_execution_id: z.string().nullable().default(null),
  /**
   * #3287 (#3265.2) — ce qui arrête CETTE action précise — distinct de
   * `WORKFLOW_OUTCOME_CATALOG[...].stop`, qui est au niveau de la MOTION.
   */
  stop_condition: z.string().nullable().default(null),
  /**
   * #2715.1 (corrigé 23/09) — le statut d'ENVOI de l'action, LU sur
   * `user_actions` (jamais deviné). DEUX valeurs, jamais fondues : une
   * PREMIÈRE version les fondait sous un seul `'success'`, ce qui confondait
   * exactement ce que la doctrine interdit — « "Fait" ne porte jamais de
   * preuve d'envoi » (`c73_fait_ne_porte_pas_preuve_denvoi`, CLAUDE.md
   * § Doctrine) :
   *   - `email_sent` : e-mail VÉRIFIÉ (`message_sent` estampillé
   *     `via: 'bellum'` — la seule preuve de livraison que Bellum détient) ;
   *   - `declared` : un geste DÉCLARATIF — LinkedIn déclaré
   *     (`plan_action_message_sent`), un appel renseigné
   *     (`plan_action_call_logged`), ou un `message_sent` historique sans
   *     `via` connu (dans le doute, jamais compté comme vérifié — même règle
   *     que `message-send-provenance.ts`).
   * La vérifiée gagne quand les deux coexistent pour la même cible.
   * `null` = rien enregistré, ou l'action ne vise aucun contact.
   */
  send_status: z.enum(['email_sent', 'declared']).nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
})
export type ActionPlanItem = z.infer<typeof actionPlanItemSchema>

/**
 * #2396.6 — les issues PERTINENTES pour le type d'action, jamais les cinq à
 * l'aveugle. Un rendez-vous ne se « qualifie » pas et ne se « refuse » pas
 * (ces deux issues décrivent une prise de contact, pas une rencontre déjà
 * obtenue) : il a eu lieu, il a été reporté, ou personne ne s'est présenté.
 * Absent de cette table = les cinq issues s'appliquent sans restriction.
 */
const OUTCOMES_BY_TARGET_KIND: Partial<Record<ActionTargetKind, readonly ActionPlanOutcome[]>> = {
  meeting: ['positive', 'deferred', 'no_response'],
}

export function outcomesForTargetKind(kind: ActionTargetKind | null | undefined): readonly ActionPlanOutcome[] {
  if (kind && OUTCOMES_BY_TARGET_KIND[kind]) return OUTCOMES_BY_TARGET_KIND[kind]
  return ACTION_PLAN_OUTCOMES
}

/** `?account_id=` query for the list endpoint. */
export const listActionPlanItemsQuerySchema = z.object({
  account_id: z.string().guid(),
})
export type ListActionPlanItemsQuery = z.infer<typeof listActionPlanItemsQuerySchema>

/** Plafond d'une lecture groupée : le briefing liste quelques dizaines de comptes, jamais le parc. */
export const PLAN_ITEMS_LAST_OUTCOMES_MAX_ACCOUNTS = 100

/**
 * `?account_ids=a,b,c` sur `GET /plan-items/last-outcomes` — le dernier résultat déclaré de
 * PLUSIEURS comptes en un appel (le briefing en listait un par ligne : N appels, N requêtes).
 */
export const listPlanItemLastOutcomesQuerySchema = z.object({
  account_ids: z
    .string()
    .transform(raw => [
      ...new Set(
        raw
          .split(',')
          .map(id => id.trim())
          .filter(id => id !== ''),
      ),
    ])
    .pipe(z.array(z.string().guid()).min(1).max(PLAN_ITEMS_LAST_OUTCOMES_MAX_ACCOUNTS)),
})

/**
 * #2717 — `?overdue=true` on `GET /plan-items/mine` : la MÊME portée que la
 * tuile « En retard » du Dashboard (`countPersonalRelances().overdue`), pour
 * que le clic atterrisse sur une liste dont le compte égale le chiffre.
 */
export const listMyPlanItemsQuerySchema = z.object({
  overdue: z.coerce.boolean().optional(),
})
export type ListMyPlanItemsQuery = z.infer<typeof listMyPlanItemsQuerySchema>

/**
 * PATCH body for a single item — every field optional so the client persists
 * one at a time:
 *  - `done` / `due_date`: the legacy checkbox + deadline (`due_date: null`
 *    clears the deadline).
 *  - `execution_status`: the executable lifecycle (`done` / `snoozed` / `todo`);
 *    the server keeps `done` in sync with it.
 *  - `snoozed_until`: ISO timestamp the item is parked until (`null` clears it).
 *  - `assigned_to`: a workspace member id the action is delegated to (`null`
 *    unassigns). The server rejects a non-member.
 * Unknown keys are stripped.
 */
export const updateActionPlanItemSchema = z.object({
  done: z.boolean().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be an ISO calendar date (YYYY-MM-DD)')
    .nullable()
    .optional(),
  execution_status: actionExecutionStatusSchema.optional(),
  snoozed_until: z.string().datetime({ offset: true }).nullable().optional(),
  assigned_to: z.string().guid().nullable().optional(),
  /**
   * #4158.31 — la note de contexte d'une délégation. OBLIGATOIRE quand `assigned_to`
   * désigne un AUTRE membre que soi (le serveur refuse sinon) ; ignorée quand on
   * s'attribue l'action ou qu'on la libère.
   */
  handoff_note: z.string().trim().max(1000).optional(),
  /** #2153.57 — `null` efface le résultat ; une chaîne blanche est détourée puis traitée comme `null`. */
  result: z.string().max(1000).nullable().optional(),
  /**
   * #2396.2 — l'issue choisie par l'humain qui complète l'action à la main.
   * Le serveur EXIGE ce champ quand la requête fait passer `execution_status`
   * à `done` depuis un autre état (voir `ActionPlanItemsService.update`).
   */
  outcome: actionPlanOutcomeSchema.optional(),
  /**
   * #3416.2b — la date du rappel quand l'issue est `callback_scheduled` : le
   * serveur en fait UNE tâche ouverte datée (idempotente). Sans date, rien n'est
   * créé ; sur toute autre issue, ce champ est ignoré.
   */
  callback_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'callback_date must be an ISO calendar date (YYYY-MM-DD)')
    .optional(),
  /**
   * #3287 (#3265.2) — l'identifiant d'exécution côté fournisseur, posé par le
   * web quand un geste de la ligne (événement d'agenda) a réellement abouti.
   * Écrit UNE fois : un identifiant déjà posé n'est pas remplacé.
   */
  external_execution_id: z.string().trim().min(1).max(300).optional(),
})
export type UpdateActionPlanItem = z.infer<typeof updateActionPlanItemSchema>

/**
 * #2123.1 — le corps de création d'une action, où l'objet canonique est
 * OBLIGATOIRE.
 *
 * C'est le seul endroit où la règle « aucune tâche flottante » peut être tenue
 * mécaniquement : la lecture doit rester tolérante (des lignes sans objet
 * existent), l'écriture ne le doit pas. Sans cette asymétrie, la nullabilité
 * nécessaire à la lecture rouvrirait la porte à chaque écriture.
 */
export const createActionPlanItemSchema = z.object({
  label: z.string().trim().min(1).max(500),
  target: actionTargetSchema,
  /**
   * #2901 (#2395.4) — même champ, même énumération fermée que
   * {@link createPlanActionSchema} (GA-26) : absent = `null`, jamais deviné
   * du libellé. ⚠️ Aucun appelant ne pose encore cette porte à ce jour
   * (`git grep createActionPlanItemSchema` hors tests) — le champ est posé
   * pour que la porte AUTOMATE ne diverge pas de la porte manuelle le jour où
   * un premier appelant l'utilisera, pas parce qu'un appelant existe déjà.
   */
  channel: planActionChannelSchema.nullable().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be an ISO calendar date (YYYY-MM-DD)')
    .nullable()
    .optional(),
})
export type CreateActionPlanItem = z.infer<typeof createActionPlanItemSchema>

/**
 * #2123.46 — la bande de position réservée aux actions saisies À LA MAIN.
 *
 * Un plan généré a une poignée de phases (un chiffre) : la semaine 1000 ne peut
 * donc jamais entrer en collision avec la clé `(week_index, step_index)` d'une
 * action du plan, celle par laquelle le tableau superpose l'état persisté au
 * plan qu'il rend. Le nombre vivait dans le service de l'API, où le web ne
 * pouvait pas le lire — donc où il allait être recopié (GA-26).
 */
export const MANUAL_ACTION_WEEK_INDEX = 1000

/**
 * #2123.46 — le corps de création d'une action DU PLAN, saisie par un humain.
 *
 * Deux portes, deux exigences, et l'asymétrie est voulue :
 *  - {@link createActionPlanItemSchema} est la porte des appelants AUTOMATES
 *    (le copilote, une capacité MCP) : l'objet visé y est OBLIGATOIRE, parce
 *    qu'un agent qui ne sait pas sur quoi il agit ne doit pas créer de tâche ;
 *  - celle-ci est la porte de la personne qui tape une phrase. L'objet est
 *    `null` quand elle n'en a désigné aucun : l'écran NOMME alors le manque
 *    (« à vérifier d'abord », {@link actionMissingData}) au lieu d'en deviner
 *    un. Deviner un objet serait pire que ne pas en avoir — l'action pointerait
 *    vers la mauvaise personne.
 *
 * `account_id` est requis : un plan d'action appartient à un compte, et une
 * action sans compte n'a nulle part où s'afficher (#1473, même défaut).
 */
export const createPlanActionSchema = z.object({
  account_id: z.string().guid(),
  label: z.string().trim().min(1).max(500),
  target: actionTargetSchema.nullable(),
  /** Le responsable saisi à la main — voir `owner_name` de l'item. */
  owner_name: z.string().trim().min(1).max(200).nullable().optional(),
  /**
   * #2123.72 — la CONSIGNE d'une tâche de prise de contact rédigée dans le
   * composer (canal, fait qui justifie, ce qu'il faut obtenir). Elle devient la
   * `reason` de la ligne — jamais une raison inventée.
   */
  // #2871 (#2395.8) — l'OBJECTIF est OBLIGATOIRE à la création : `reason` EST la
  // colonne qui le porte (`action_plan_items.reason`, nullable en base pour les
  // lignes historiques et les étapes dérivées du plan — non touchées, aucune
  // migration). Une action sans objectif est une tâche dont personne ne sait à
  // quoi elle sert ; elle est refusée ICI, à l'écriture, pas seulement signalée
  // à l'affichage. L'objectif est rédigé par la personne (ou par l'appelant, qui
  // le tire d'un fait réel), jamais inventé.
  reason: z.string().trim().min(1).max(2000),
  // #2395.8 — REQUIS à la création, comme `reason` : « à quoi ressemble fait ? », jamais un verbe seul. Les lignes
  // EXISTANTES gardent `expected_outcome` nullable en lecture (`actionPlanItemSchema`) : aucune migration.
  expected_outcome: z.string().trim().min(1).max(1000),
  /** #2123.46 — l'indicateur qui dira que l'action a porté. Absent = `null`. */
  kpi: z.string().trim().min(1).max(300).nullable().optional(),
  /**
   * #2901 (#2395.4) — le CANAL, quand la personne l'a choisi dans le composer
   * (téléphone/e-mail/LinkedIn/réunion). `seedFromPlan` le pose déjà pour les
   * actions DÉRIVÉES du plan de Laura (#2395.4/#2395.9, 24/09/2026,
   * `f9f23f887`) ; cette porte-ci était la seule à ne pas le porter, alors
   * qu'elle écrit la MÊME table — ni devinée depuis le libellé libre (la
   * doctrine du fichier l'interdit), ni obligatoire : absent = `null`,
   * comportement inchangé, et `type` reste alors non typé
   * (`canonicalActionFromPlanItem`).
   */
  channel: planActionChannelSchema.nullable().optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'due_date must be an ISO calendar date (YYYY-MM-DD)')
    .nullable()
    .optional(),
  /** #3287 (#3265.2) — la recommandation source, posée par l'écrivain qui la connaît. Absent = `null`. */
  source_recommendation: z.string().trim().min(1).max(120).nullable().optional(),
  /** #3287 (#3265.2) — la règle du corpus méthode ; le serveur REFUSE un identifiant inconnu. */
  method_rule: z.string().trim().min(1).max(120).nullable().optional(),
  /** #3287 (#3265.2) — la condition d'arrêt de CETTE action. Absent = `null`. */
  stop_condition: z.string().trim().min(1).max(500).nullable().optional(),
})
export type CreatePlanAction = z.infer<typeof createPlanActionSchema>

/**
 * #4416 — `POST /plan-items/for-contact` : « Préparer un plan pour <prénom> ». Le compte ET le contact sont
 * requis ; le serveur vérifie que le compte est de l'espace de l'appelant et que le contact est de ce compte.
 * `locale` ne choisit que la langue des libellés écrits sur les lignes (fr par défaut).
 */
export const prepareContactPlanSchema = z.object({
  account_id: z.string().guid(),
  contact_id: z.string().guid(),
  locale: z.enum(['fr', 'en']).optional(),
})
export type PrepareContactPlan = z.infer<typeof prepareContactPlanSchema>

/**
 * #2123.46 — ce que `POST /plan-items` rend : la ligne, et si elle VIENT
 * d'être écrite.
 *
 * L'ancienne porte (`raw_analysis.user_plan_actions`) était idempotente et le
 * disait (`added: false` = l'action y était déjà) : c'est ce qui permet à
 * l'ajout en masse d'annoncer « N ajoutés, M ignorés (déjà au plan) » avec de
 * vrais compteurs. La nouvelle porte garde cette promesse — une action OUVERTE
 * de même libellé et de même objet n'est pas écrite une seconde fois — et la
 * rend observable par ce champ, obligatoire : un « je ne sais pas » ici ferait
 * compter comme ajoutée une ligne qui ne l'a pas été.
 */
export const createdPlanActionSchema = actionPlanItemSchema.extend({
  added: z.boolean(),
})
export type CreatedPlanAction = z.infer<typeof createdPlanActionSchema>

/**
 * #2123.46 — une de MES actions, telle que l'écran Actions la liste.
 *
 * C'est la ligne d'action elle-même (la MÊME que celle du plan du compte), plus
 * le nom du compte qu'elle fait avancer : l'écran est transversal, et « Relancer
 * le DSI » sans entreprise ne désigne rien. `company_name` peut être `null`
 * (compte sans raison sociale lisible) — on ne fabrique pas de nom.
 */
export const myPlanActionSchema = actionPlanItemSchema.extend({
  company_name: z.string().nullable(),
  /** #4072.2 — l'historique d'échanges (métadonnées) et les faits récents du compte. Absent = rien à dire. */
  history: relanceHistorySchema.optional(),
  /**
   * #4521.1 — le contact VISÉ, résolu côté serveur (identifiant de la ligne, sinon le nom du responsable du plan
   * rapproché des contacts du compte) : son nom et sa fonction, pour que la carte les montre sans lire la consigne.
   * Absent = personne de résolu ; jamais un nom inventé.
   */
  contact_name: z.string().nullable().optional(),
  contact_role: z.string().nullable().optional(),
  /** #4521.2 — le signal cité par la consigne, en une ligne, et sa date si la provenance la porte. Absent = aucun. */
  signal: z.object({ text: z.string(), at: z.string().nullable() }).nullable().optional(),
})
export type MyPlanAction = z.infer<typeof myPlanActionSchema>

/**
 * #3211.9 (#3234, lot M11 09/10) — une action FAITE dont aucune issue n'a été
 * déclarée (complétée par preuve d'envoi, ou antérieure à la règle #2396.2) :
 * une ligne de la FILE PROACTIVE « Issues à déclarer » du Centre d'actions.
 * L'issue se déclare après coup par le PATCH existant (`outcome` seul), une
 * fois, jamais en réécrivant une issue déjà posée.
 */
export const awaitingOutcomeActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string().nullable(),
  completed_at: z.string().nullable(),
  completion_mode: actionCompletionModeSchema.nullable(),
  target_kind: actionTargetKindSchema.nullable(),
})
export type AwaitingOutcomeAction = z.infer<typeof awaitingOutcomeActionSchema>

/**
 * #2123.34 — trois actions en tête, jamais quinze.
 *
 * Le tableau rendait l'horizon entier sans troncature : quinze cartes
 * « prioritaires » ne sont pas une priorisation, c'est la même liste avec un
 * autre titre. Le nombre vit ICI et nulle part ailleurs (GA-26).
 */
export const NEXT_ACTIONS_MAX = 3

/**
 * #2123.35 — ce qui MANQUE à une action pour être tenable, nommé.
 *
 * Rend une CLÉ, jamais une phrase : un libellé d'affichage écrit dans un
 * contrat est français pour toujours, et les deux langues sont une promesse.
 *
 *  - `target` — on ne sait pas sur QUOI porte l'action ;
 *  - `contact` — l'action passe par quelqu'un, et ce quelqu'un n'est pas nommé.
 *
 * Le second ne vaut que pour une action qui vise un contact : demander un
 * contact à une action qui fait avancer un projet inventerait un manque.
 */
export function actionMissingData(item: ActionPlanItem): 'target' | 'contact' | null {
  if (item.target === null) return 'target'
  if (item.target.kind === 'contact' && item.contact_id === null) return 'contact'
  return null
}

/**
 * #2123.34 / #2123.35 — les actions à mettre en tête du plan.
 *
 * Deux règles, dans cet ordre : ce qu'il faut VÉRIFIER passe devant (proposer
 * « rappeler le DSI » quand on ne sait pas qui est le DSI fait perdre le
 * rendez-vous, pas le temps de la vérification), puis on coupe à
 * {@link NEXT_ACTIONS_MAX}. L'ordre relatif des actions d'un même groupe est
 * celui qu'on a reçu — on ne réordonne pas ce qu'on ne sait pas ordonner.
 */
export function nextActions(items: readonly ActionPlanItem[]): ActionPlanItem[] {
  const toVerify = items.filter(item => actionMissingData(item) !== null)
  const ready = items.filter(item => actionMissingData(item) === null)
  return [...toVerify, ...ready].slice(0, NEXT_ACTIONS_MAX)
}

/**
 * #2317.9 — une action CONDITIONNELLE n'est pas exécutable tant que sa
 * dépendance ({@link ActionPlanItem.depends_on_item_id}) n'est pas `done`.
 *
 * Elle reste VISIBLE et sa dépendance reste NOMMÉE (on archive, on ne
 * supprime pas — masquer une action légitime serait pire que la bloquer) :
 * seul le geste d'exécution (marquer fait) est gelé, jusqu'à ce que la
 * condition soit remplie. Une dépendance introuvable (ligne retirée du plan)
 * ne bloque plus rien : la condition ne peut plus être vérifiée.
 */
export function blockedByDependency(
  item: ActionPlanItem,
  items: readonly ActionPlanItem[],
): { id: string; label: string } | null {
  if (!item.depends_on_item_id) return null
  const dependency = items.find(other => other.id === item.depends_on_item_id)
  if (!dependency || dependency.execution_status === 'done') return null
  return { id: dependency.id, label: dependency.label }
}

/**
 * #2317.15 — LE NO-GO du plan : « une recommandation non cliquable, non
 * attribuée ou sans date et résultat attendu ». Trois raisons, NOMMÉES,
 * jamais un verdict binaire nu (GA-18/GA-19 : ce qui manque se nomme) :
 *
 *  - `not_clickable` — aucun objet visé ({@link actionMissingData} le nomme
 *    déjà comme la même absence, réutilisée ici plutôt que redéfinie, GA-26) ;
 *  - `not_assigned` — ni un membre délégué (`assigned_to`), ni un responsable
 *    saisi à la main (`owner_name`) ;
 *  - `no_date_or_outcome` — ni échéance, ni résultat attendu : une action sans
 *    l'un des deux ne dit ni QUAND ni POURQUOI.
 *
 * Une action peut cumuler plusieurs raisons ; `[]` = pas de NO-GO.
 */
export const ACTION_NO_GO_REASONS = ['not_clickable', 'not_assigned', 'no_date_or_outcome'] as const
export type ActionNoGoReason = (typeof ACTION_NO_GO_REASONS)[number]

export function actionNoGoReasons(item: ActionPlanItem): ActionNoGoReason[] {
  const reasons: ActionNoGoReason[] = []
  if (actionMissingData(item) === 'target') reasons.push('not_clickable')
  if (!item.assigned_to && !item.owner_name) reasons.push('not_assigned')
  if (!item.due_date && !item.expected_outcome) reasons.push('no_date_or_outcome')
  return reasons
}

/**
 * #4485 (décision Louis 24/10) — « Proposer de les clore » : des centaines d'actions « en retard » datées
 * de plusieurs mois encombrent Actions › Aujourd'hui. Au-delà de ce seuil de jours, l'écran PROPOSE à la
 * personne de les marquer faites ; rien ne se ferme seul, rien ne se supprime.
 */
export const STALE_ACTION_DAYS = 30

/** Le plafond d'une clôture en lot : une requête, jamais le parc entier d'un coup. */
export const CLOSE_STALE_MAX_IDS = 300

/**
 * Corps de `POST /plan-items/close-stale` : les identifiants que la personne vient de CONFIRMER au clic.
 * Le serveur vérifie que chacune lui appartient et qu'elle est bien ouverte et ancienne.
 */
export const closeStalePlanItemsSchema = z.object({
  ids: z.array(z.string().guid()).min(1).max(CLOSE_STALE_MAX_IDS),
})
export type CloseStalePlanItems = z.infer<typeof closeStalePlanItemsSchema>

/** `closed` marquées faites ; `skipped` déjà faites ou pas assez anciennes (inchangées) ; `failed` non écrites. */
export type CloseStalePlanItemsResult = { closed: number; skipped: number; failed: number }
