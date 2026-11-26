import { z } from 'zod'
import { reminderChannelSchema } from './reminder-channel.js'

/**
 * Les ACTIVITÉS — ce qui s'est réellement passé avec un compte, un contact ou
 * un projet, dans l'ordre.
 *
 * Le produit savait déjà lire une messagerie, un agenda et un standard
 * téléphonique. Il n'en gardait RIEN : chaque écran interrogeait le fournisseur
 * en direct, affichait, et oubliait. Trois conséquences, toutes vécues :
 *
 *  - on ne peut pas répondre à « où en est-on avec ACME ? » sans rouvrir trois
 *    outils, et c'est exactement la question qu'on se pose cinq minutes avant
 *    un rendez-vous ;
 *  - un commercial qui part emporte l'historique avec sa boîte ;
 *  - aucun calcul d'équipe n'est possible — « combien de touches avant une
 *    réponse ? » suppose de compter des touches, donc de les avoir gardées.
 *
 * Trois règles portent l'honnêteté de la table :
 *
 * 1. **Une activité sans date n'entre pas.** La timeline ne promet qu'une
 *    chose, l'ordre. Dater à « maintenant » un message dont le fournisseur ne
 *    donne pas la date casse cette promesse en silence — l'appelant écarte la
 *    ligne et DIT pourquoi.
 * 2. **L'idempotence porte sur `(espace, source, identifiant externe)`.**
 *    Rejouer une capture, redéployer, recharger : le même e-mail ne peut pas
 *    produire deux lignes. Un doublon dans une timeline se lit comme deux
 *    échanges — c'est-à-dire comme une relation plus avancée qu'elle ne l'est.
 * 3. **Le rattachement se prouve.** Une activité pointe un compte ou un contact
 *    parce qu'une adresse ou un numéro correspond, et la raison est stockée
 *    (`link_reason`). Rattacher au flair produit un historique que personne ne
 *    croit, donc que personne n'utilise.
 *
 * Le CORPS des messages est stocké intégralement (arbitrage Louis du 16/08,
 * revirement assumé de la règle antérieure « métadonnées seulement ») : sans
 * lui, « prépare une relance dans le ton du dernier échange » est impossible et
 * l'historique perd sa raison d'être le jour où l'on quitte le fournisseur. Ce
 * qui NE change PAS : le copilote ne remonte jamais de corps — la garde
 * existante (`test_chat_mailbox_tools.py`) reste en place. Stocker et exposer
 * sont deux décisions distinctes.
 */

/**
 * La NATURE d'une activité. Liste fermée et courte : chaque valeur doit se
 * traduire par une icône et une phrase, et une taxonomie que personne ne sait
 * réciter finit remplie de `other`.
 */
export const ACTIVITY_KINDS = [
  'email',
  'call',
  'meeting',
  'note',
  'task',
  'stage_change',
  'crm_export',
  'linkedin',
  'analysis',
  'workflow',
  /**
   * Le franchissement d'une porte de décision (BEL-ARCH-005). Ajouté EN FIN,
   * jamais au milieu : pour plusieurs taxonomies du dépôt l'index porte un
   * sens, et la garde `enum-additivity` refuse une insertion. La contrainte
   * SQL correspondante a été élargie AVANT ce code (`DecisionGates`).
   */
  'gate_decision',
  /**
   * #1791.2 — Laura a consulté le CRM d'espace pour CE compte, depuis la
   * conversation. Ajoutée EN FIN, comme `gate_decision` juste au-dessus (GA-08).
   *
   * ⚠️⚠️ Le GESTE, jamais le CONTENU : cette ligne ne porte ni le résultat
   * (connecté ou non, nombre de contacts, affaires ouvertes) ni le nom de
   * l'éditeur — seuls `kind`, `account_id`, `user_id` et `occurred_at` le
   * disent, `subject`/`body` restent `null`. Voir
   * `ActivitiesService.recordCrmLookup`. La contrainte SQL correspondante est
   * élargie AVANT ce code (`CrmLookupActivity`).
   */
  'crm_lookup',
] as const
export const activityKindSchema = z.enum(ACTIVITY_KINDS)
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

/**
 * Les natures qui comptent comme un ÉCHANGE avec le compte (#1581.1).
 *
 * ⚠️ « Activité » et « échange » ne sont pas la même question, et la deuxième
 * est celle que le produit pose partout : « ce compte est-il silencieux ? ».
 * Une NOTE prise pour soi, une analyse lancée, un changement d'étape sont des
 * activités — aucune n'est un échange avec quelqu'un. Les compter ferait
 * disparaître un compte de la liste des comptes négligés parce qu'on a écrit
 * une note dessus.
 *
 * ⚠️ Cette liste vivait en CONSTANTE LOCALE dans `cockpit-perspective.service`
 * (`INTERACTION_KINDS_SQL`), et le contexte du copilote posait la même question.
 * Deux écritures de la même règle divergent — le dépôt a déjà payé cette leçon
 * sur `noUpcomingTask` (GA-53), où deux copies « identiques le jour où elles ont
 * été écrites » avaient fini par dire le contraire l'une de l'autre. Il n'y a
 * donc plus qu'une liste, et elle est ici.
 */
export const INTERACTION_ACTIVITY_KINDS = ['email', 'call', 'meeting', 'linkedin'] as const
export type InteractionActivityKind = (typeof INTERACTION_ACTIVITY_KINDS)[number]

/**
 * La même liste, prête à être interpolée dans un `IN (…)`.
 *
 * Les valeurs viennent d'une liste FERMÉE écrite juste au-dessus : rien de ce
 * qui traverse cette fonction ne vient d'une saisie, d'une requête ou d'une
 * base. C'est ce qui la distingue d'une concaténation de SQL, et c'est pourquoi
 * elle n'a pas de paramètre.
 */
export function interactionActivityKindsSql(): string {
  return `(${INTERACTION_ACTIVITY_KINDS.map(kind => `'${kind}'`).join(', ')})`
}

/**
 * D'OÙ vient la ligne. Sert deux choses : l'idempotence (le couple
 * `source` + `external_id` est unique) et l'honnêteté d'affichage — « saisi à
 * la main » et « lu dans ta messagerie » n'ont pas la même valeur de preuve.
 */
export const ACTIVITY_SOURCES = ['mailbox', 'agenda', 'telephony', 'manual', 'crm', 'system'] as const
export const activitySourceSchema = z.enum(ACTIVITY_SOURCES)
export type ActivitySource = (typeof ACTIVITY_SOURCES)[number]

/**
 * `internal` n'est pas un remplissage : une réunion interne de préparation est
 * une activité du compte, mais elle ne compte pas comme une touche client. Les
 * confondre ferait passer une équipe qui se réunit beaucoup pour une équipe qui
 * prospecte beaucoup.
 */
export const ACTIVITY_DIRECTIONS = ['inbound', 'outbound', 'internal'] as const
export const activityDirectionSchema = z.enum(ACTIVITY_DIRECTIONS)
export type ActivityDirection = (typeof ACTIVITY_DIRECTIONS)[number]

/**
 * POURQUOI cette activité est attachée à cet objet. Affiché tel quel dans le
 * détail : « rattaché parce que l'adresse correspond au contact Marie Dupont »
 * se vérifie, « rattaché » ne se vérifie pas.
 */
export const ACTIVITY_LINK_REASONS = [
  'contact_email',
  'contact_phone',
  'account_domain',
  'manual',
  'project_explicit',
] as const
export const activityLinkReasonSchema = z.enum(ACTIVITY_LINK_REASONS)
export type ActivityLinkReason = (typeof ACTIVITY_LINK_REASONS)[number]

/** Borne du corps stocké. Au-delà, on garde le début et on le DIT (`bodyTruncated`). */
export const ACTIVITY_BODY_MAX_LENGTH = 100_000

export const activityParticipantSchema = z.object({
  /** Adresse ou numéro, tel que rendu par le fournisseur. */
  handle: z.string(),
  displayName: z.string().nullable(),
  /** Rattaché à un contact de l'espace, quand on a su le prouver. */
  contactId: z.string().guid().nullable(),
  /** L'utilisateur de l'espace lui-même — ni un client, ni un prospect. */
  isSelf: z.boolean(),
})
export type ActivityParticipant = z.infer<typeof activityParticipantSchema>

/**
 * Le verdict d'une activité — ce qui est RÉELLEMENT arrivé au message.
 *
 * Nommé et exporté depuis le 22/08/2026 : la liste était écrite deux fois en
 * `z.enum([...])` au milieu de deux schémas, donc invisible à GA-12 — la garde
 * ne compare que des énumérations NOMMÉES, et une contrainte SQL sans
 * énumération en face n'est comparée à rien.
 *
 * `drafted` n'est pas `sent` : rien n'est parti. `unknown` n'est pas `failed` :
 * la requête est partie et on ne sait pas ce qu'elle est devenue — les replier
 * l'un dans l'autre rejouerait un envoi peut-être déjà fait.
 */
export const ACTIVITY_VERDICTS = ['sent', 'drafted', 'failed', 'partial', 'unknown'] as const
export const activityVerdictSchema = z.enum(ACTIVITY_VERDICTS)

/**
 * L'ISSUE d'un appel (N11-B).
 *
 * On savait qu'un appel avait eu lieu ; on ne savait jamais s'il avait abouti,
 * s'il était tombé sur une messagerie, ou sur la mauvaise personne. La
 * taxonomie existait pourtant déjà — `WORKFLOW_OUTCOME_CATALOG`
 * (`workflow-outcomes.ts`), motion `cold_call_qualification` — et en créer une
 * seconde ici aurait produit deux listes qui auraient fini par diverger.
 *
 * ⚠️ Écrite À PLAT et non par référence (`WORKFLOW_OUTCOME_CATALOG.cold_call_qualification.outcomes`) :
 * la garde GA-12 compare une contrainte SQL à un tableau littéral NOMMÉ dans ce
 * dossier, et un accès de propriété lui est invisible — même raison que
 * `CONTACT_STOP_REASONS` dans `workflow-outcomes.ts`. Le test
 * `activity.test.ts` (« CALL_OUTCOMES — réutilise le catalogue existant »)
 * vérifie que cette liste reste identique à sa source, dans le même ordre :
 * c'est lui qui empêche les deux écritures de diverger.
 */
export const CALL_OUTCOMES = [
  'connected_qualified',
  'connected_no_fit',
  'callback_scheduled',
  'voicemail',
  'wrong_contact',
  'no_answer',
  // #2377.3 — les 14 valeurs manquantes des 18 « outcomes canoniques » du
  // corps de l'issue #2377 (§OUTCOMES CANONIQUES). `wrong_person` et
  // `callback_requested` n'y reviennent pas : `wrong_contact` et
  // `callback_scheduled` portent déjà la même intention (élargir, pas
  // renommer — CLAUDE.md §Doctrine). GA-08 : ajouts en FIN, ordre gelé
  // au-dessus.
  'orientation_given',
  'not_now',
  'interest',
  'need_detected',
  'need_confirmed',
  'meeting_booked',
  'refused',
  'opt_out',
  'email_requested',
  'document_requested',
  'partner_opportunity',
  'invalid_contact',
  'left_company',
  'other',
] as const
export const callOutcomeSchema = z.enum(CALL_OUTCOMES)
export type CallOutcome = z.infer<typeof callOutcomeSchema>

/**
 * #2377.4 — ce qu'on retient d'un appel, en champs SÉPARÉS.
 *
 * Le corps libre (`body`) reste la note telle que tapée ou dictée ; ce schéma
 * ne la remplace pas, il ajoute une lecture structurée À CÔTÉ. Chaque champ
 * est saisi par le commercial lui-même — aucune extraction automatique n'est
 * tentée ici : une IA qui sépare fait/besoin/objection sur une note ambiguë
 * inventerait une lecture, ce que la doctrine interdit (« jamais de donnée
 * fictive »). Les quatre champs restent facultatifs, chacun pour sa propre
 * raison : un appel peut n'avoir révélé qu'un fait, ou qu'un besoin, jamais
 * les quatre à la fois.
 */
export const callDebriefSchema = z
  .object({
    fact: z.string().trim().min(1).max(500).optional(),
    need: z.string().trim().min(1).max(500).optional(),
    objection: z.string().trim().min(1).max(500).optional(),
    engagement: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
export type CallDebrief = z.infer<typeof callDebriefSchema>

/**
 * #2377.6 — « Rappeler » seul est insuffisant : une prochaine action DÉCLARÉE
 * porte toujours qui, quand, et sous quelle condition. Le schéma entier reste
 * FACULTATIF sur `logActivitySchema` (un appel peut ne déclencher aucune
 * prochaine action), mais dès qu'il est présent, les trois champs sont
 * obligatoires — la validation Zod REFUSE la création plutôt que de laisser
 * passer une action à moitié posée.
 */
export const callNextActionSchema = z
  .object({
    owner: z.string().trim().min(1).max(200),
    /** Date calendaire (`YYYY-MM-DD`) — jamais une échéance devinée. */
    dueDate: z.string().trim().min(1).max(20),
    condition: z.string().trim().min(1).max(500),
    expectedResult: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
export type CallNextAction = z.infer<typeof callNextActionSchema>

export const activitySchema = z.object({
  id: z.string().guid(),
  kind: activityKindSchema,
  source: activitySourceSchema,
  direction: activityDirectionSchema,
  /** Objet du message, titre de la réunion, motif de l'appel. */
  subject: z.string().nullable(),
  /** Corps intégral quand il y en a un. `null` pour un appel sans transcription. */
  body: z.string().nullable(),
  /** Le corps dépassait la borne : l'écran doit le dire plutôt que laisser
   *  croire que le message s'arrêtait là. */
  bodyTruncated: z.boolean(),
  /**
   * Le corps a été RETIRÉ parce que le lecteur n'en est pas l'auteur (D65).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI CE DRAPEAU EXISTE PLUTÔT QU'UN SIMPLE `null`
   * ─────────────────────────────────────────────────────────────────────────
   * `body: null` veut déjà dire quelque chose : « cet échange n'a pas de corps »
   * (un appel sans transcription). Réutiliser ce `null` pour dire « tu n'as pas
   * le droit de le lire » ferait afficher « aucun contenu » sur un message qui
   * en a un — le lecteur en conclurait que la capture est cassée.
   *
   * `default(false)` et non `boolean()` : le champ est AJOUTÉ à une réponse qui
   * circule déjà, et le web se déploie dix minutes avant l'API.
   */
  bodyRedacted: z.boolean().default(false),
  /** Date RÉELLE de l'événement. Jamais la date d'import. */
  occurredAt: z.string(),
  /** Secondes. `null` quand le fournisseur ne le dit pas — pas zéro. */
  durationSeconds: z.number().int().nonnegative().nullable(),
  accountId: z.string().guid().nullable(),
  contactId: z.string().guid().nullable(),
  projectId: z.string().guid().nullable(),
  linkReason: activityLinkReasonSchema.nullable(),
  /** L'utilisateur de l'espace côté Bellum (celui dont on a lu la boîte). */
  userId: z.string().guid().nullable(),
  authorName: z.string().nullable(),
  participants: z.array(activityParticipantSchema),
  /** Identifiant chez le fournisseur — la clé d'idempotence. */
  externalId: z.string().nullable(),
  /**
   * Le canal RÉELLEMENT emprunté (PDF 6 §5.2 règle f). `null` pour tout ce qui
   * est capturé en LECTURE — une activité relue dans une boîte n'a pas de canal
   * d'envoi, et lui en inventer un ferait croire qu'on l'a envoyée.
   */
  channel: reminderChannelSchema.nullish(),
  /**
   * Ce qui s'est passé. `partial` porte le cas que le produit refuse de
   * simplifier — trois destinataires sur cinq n'est ni un succès ni un échec —
   * et `unknown` celui du délai dépassé, où l'on ne sait pas et où l'on
   * réconcilie avant de rejouer.
   */
  verdict: activityVerdictSchema.nullish(),
  /**
   * L'issue d'un APPEL (N11-B). `null` — ou l'absence du champ, pour une
   * ligne écrite avant son existence — se lit « non renseignée », jamais un
   * échec par défaut : on sait qu'un appel a eu lieu, on ne sait juste pas
   * encore comment il s'est terminé.
   *
   * `nullish` et non `.default(null)` : le champ est AJOUTÉ à une réponse qui
   * circule déjà — même raison que `channel` et `verdict` juste au-dessus.
   */
  outcome: callOutcomeSchema.nullish(),
  /**
   * #2377.1/.4/.6 — ce que le compilateur de fin d'appel a retenu : le
   * debrief structuré et, s'il y en a une, la prochaine action DÉCLARÉE
   * (déjà validée owner+date+condition à l'écriture). `null` pour toute
   * ligne écrite avant l'existence de ce champ, ou sans debrief saisi — un
   * état honnête, jamais une extraction manquée.
   */
  callDebrief: callDebriefSchema
    .merge(
      z.object({
        nextAction: callNextActionSchema.nullable(),
        /** #2984 — `nullish` : ajouté à un blob JSON qui circule déjà, une
         *  ligne antérieure n'en portait aucune trace, ce n'est pas pour ça
         *  qu'il faut refuser de la relire. */
        recordingConsent: z.boolean().nullish(),
        /** #2984 — le brouillon de suivi composé à l'écriture, jamais envoyé. */
        followUpDraft: z.object({ subject: z.string().nullable(), body: z.string() }).nullish(),
      }),
    )
    .nullish(),
  /** Lien vers l'objet chez le fournisseur, quand il en donne un. */
  externalUrl: z.string().nullable(),
  createdAt: z.string(),
})
export type Activity = z.infer<typeof activitySchema>

/**
 * Ce qu'une capture pousse. `occurredAt` est REQUIS — c'est la règle n°1, et
 * la rendre optionnelle ici la déplacerait chez chaque appelant, où elle serait
 * oubliée une fois sur deux.
 */
export const ingestActivitySchema = z
  .object({
    kind: activityKindSchema,
    source: activitySourceSchema,
    direction: activityDirectionSchema,
    subject: z.string().max(2000).nullable().default(null),
    body: z.string().nullable().default(null),
    occurredAt: z.string().datetime({ offset: true }),
    durationSeconds: z.number().int().nonnegative().nullable().default(null),
    accountId: z.string().guid().nullable().default(null),
    contactId: z.string().guid().nullable().default(null),
    projectId: z.string().guid().nullable().default(null),
    linkReason: activityLinkReasonSchema.nullable().default(null),
    externalId: z.string().max(500).nullable().default(null),
    /**
     * Le canal RÉELLEMENT emprunté (PDF 6 §5.2 règle f). `null` pour tout ce qui
     * est capturé en LECTURE — une activité relue dans une boîte n'a pas de canal
     * d'envoi, et lui en inventer un ferait croire qu'on l'a envoyée.
     */
    channel: reminderChannelSchema.nullish(),
    /**
     * Ce qui s'est passé. `partial` porte le cas que le produit refuse de
     * simplifier — trois destinataires sur cinq n'est ni un succès ni un échec —
     * et `unknown` celui du délai dépassé, où l'on ne sait pas et où l'on
     * réconcilie avant de rejouer.
     */
    verdict: activityVerdictSchema.nullish(),
    externalUrl: z.string().max(2000).nullable().default(null),
    participants: z
      .array(
        z.object({
          handle: z.string().min(1).max(400),
          displayName: z.string().max(300).nullable().default(null),
          contactId: z.string().guid().nullable().default(null),
          isSelf: z.boolean().default(false),
        }),
      )
      .max(100)
      .default([]),
  })
  .strict()
export type IngestActivityInput = z.infer<typeof ingestActivitySchema>

/**
 * La saisie MANUELLE — « j'ai appelé, il rappelle en septembre ».
 *
 * Volontairement plus étroite que l'ingestion : un humain ne pose ni identifiant
 * externe ni participant technique. La laisser passer par le même schéma
 * permettrait de fabriquer à la main une ligne qui se présenterait comme lue
 * chez un fournisseur.
 */
export const logActivitySchema = z
  .object({
    kind: z.enum(['call', 'meeting', 'email', 'note', 'linkedin']),
    direction: activityDirectionSchema.default('outbound'),
    subject: z.string().trim().max(2000).optional(),
    body: z.string().trim().max(20_000).optional(),
    /** Défaut côté service : maintenant. Une saisie rétroactive est légitime. */
    occurredAt: z.string().datetime({ offset: true }).optional(),
    durationSeconds: z.number().int().min(0).max(86_400).nullable().default(null),
    accountId: z.string().guid().optional(),
    contactId: z.string().guid().optional(),
    projectId: z.string().guid().optional(),
    /**
     * L'issue de l'appel (N11-B). Facultative même sur un appel — « on ne sait
     * pas encore » est un état honnête, pas une erreur de saisie — mais n'a de
     * sens QUE sur `kind: 'call'` : la refuser ailleurs évite qu'un rendez-vous
     * ou un e-mail se voie attribuer une issue d'appel.
     */
    outcome: callOutcomeSchema.optional(),
    /** #2377.4 — fait/besoin/objection/engagement, séparés du corps libre. */
    callDebrief: callDebriefSchema.optional(),
    /** #2377.6 — owner+date+condition, ou rien : jamais une action à moitié posée. */
    nextAction: callNextActionSchema.optional(),
    /**
     * #2984 — le consentement à l'enregistrement, DÉCLARATIF : un booléen que
     * le commercial coche ou non lui-même, jamais une porte qui bloque la
     * saisie. Contrairement à `recordingConsent: z.literal(true)` sur la
     * transcription audio réelle (#2319.57, `meeting-notes.dto.ts`) — là un
     * VRAI enregistrement est envoyé à un tiers, ici c'est une note tapée à la
     * main : refuser de l'enregistrer si la case n'est pas cochée ferait
     * perdre la trace d'un appel qui a bien eu lieu pour la seule raison
     * qu'une case UI n'a pas été cochée. `false` reste un état honnête — « il
     * n'a pas donné son accord » se trace, plutôt que de se taire.
     */
    recordingConsent: z.boolean().optional(),
  })
  .strict()
  .refine(value => Boolean(value.accountId ?? value.contactId ?? value.projectId), {
    message: 'Une activité doit être rattachée à un compte, un contact ou un projet',
  })
  .refine(value => value.kind === 'call' || value.outcome === undefined, {
    message: 'Une issue ne se déclare que sur un appel',
  })
  .refine(value => value.kind === 'call' || value.callDebrief === undefined, {
    message: 'Un debrief ne se déclare que sur un appel',
  })
  .refine(value => value.kind === 'call' || value.nextAction === undefined, {
    message: 'Une prochaine action issue d’un appel ne se déclare que sur un appel',
  })
  .refine(value => value.kind === 'call' || value.recordingConsent === undefined, {
    message: 'Le consentement à l’enregistrement ne se déclare que sur un appel',
  })
export type LogActivityInput = z.infer<typeof logActivitySchema>

export const ACTIVITY_SCOPES = ['account', 'contact', 'project'] as const
export const activityScopeSchema = z.enum(ACTIVITY_SCOPES)
export type ActivityScope = (typeof ACTIVITY_SCOPES)[number]

export const activityQuerySchema = z
  .object({
    scope: activityScopeSchema,
    id: z.string().guid(),
    kind: activityKindSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict()
export type ActivityQuery = z.infer<typeof activityQuerySchema>

/**
 * Une capture qui n'a pas pu lire une source — À CÔTÉ des résultats, jamais à
 * la place. « Aucun appel » et « le standard n'a pas répondu » se ressemblent à
 * l'écran et n'ont rien à voir.
 */
export const activitySyncSourceSchema = z.object({
  source: activitySourceSchema,
  ingested: z.number().int().nonnegative(),
  /** Déjà connues : la preuve que l'idempotence fonctionne, affichée en clair. */
  duplicates: z.number().int().nonnegative(),
  /** Écartées, avec la raison — sans date exploitable, sans rattachement… */
  skipped: z.array(z.object({ ref: z.string(), reason: z.string() })).default([]),
  /** Source injoignable ou capacité absente. `null` = elle a répondu. */
  unavailable: z.string().nullable().default(null),
  /**
   * #2126.6 — POURQUOI `unavailable` n'est pas `null`, en deux mots stables.
   *
   * `unavailable` est une phrase LIBRE (message d'exception compris) : elle
   * s'affiche, mais rien ne doit la comparer en texte pour décider quoi
   * afficher. `not_connected` (aucun outil branché) et `error` (branché, mais
   * la lecture a échoué) se lisent différemment à l'écran — le premier
   * propose « Connecter un outil », le second propose de réessayer.
   */
  reason: z.enum(['not_connected', 'error']).nullable().default(null),
})
export type ActivitySyncSource = z.infer<typeof activitySyncSourceSchema>

export const activitySyncResultSchema = z.object({
  sources: z.array(activitySyncSourceSchema),
  ingested: z.number().int().nonnegative(),
})
export type ActivitySyncResult = z.infer<typeof activitySyncResultSchema>

/**
 * L'état d'une relation, calculé sur les activités.
 *
 * Quatre nombres qui répondent à des questions qu'on pose vraiment, et un
 * cinquième refus : **aucun score**. Un « score de relation » sur 100 se lit
 * comme une mesure alors qu'il n'est qu'une pondération choisie par nous ; les
 * dates brutes, elles, se vérifient.
 */
export const engagementSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  /** Dernière fois que NOUS avons fait quelque chose. */
  lastOutboundAt: z.string().nullable(),
  /** Dernière fois qu'ILS ont répondu. La seule qui prouve une relation. */
  lastInboundAt: z.string().nullable(),
  /** Jours depuis la dernière activité, tous sens confondus. */
  daysSinceLastActivity: z.number().int().nonnegative().nullable(),
  /**
   * On a écrit et personne n'a répondu depuis. Distinct de « rien depuis
   * longtemps » : ici il y a une balle dans leur camp, et c'est ce qui décide
   * s'il faut relancer ou changer d'angle.
   */
  awaitingReply: z.boolean(),
  byKind: z.partialRecord(activityKindSchema, z.number().int().nonnegative()),
})
export type EngagementSummary = z.infer<typeof engagementSummarySchema>

/** Une activité, réduite à ce dont le calcul a besoin. */
type EngagementInput = {
  kind: ActivityKind
  direction: ActivityDirection
  occurredAt: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Résume une relation à partir de ses activités.
 *
 * Pur, `now` en paramètre : un calcul de fraîcheur qui lit l'horloge lui-même
 * ne se teste pas, et c'est précisément celui qu'on veut tester.
 *
 * Les activités `internal` comptent dans le total mais ne peuvent PAS être la
 * dernière touche client ni le « dernier échange » (#3688.7) ; une activité
 * datée dans le FUTUR (rendez-vous planifié) n'est comptée nulle part : une réunion de préparation entre collègues ne
 * repousse pas la date à laquelle il faudrait relancer le client.
 */
export function engagementSummary(activities: readonly EngagementInput[], now: Date): EngagementSummary {
  const byKind: Partial<Record<ActivityKind, number>> = {}
  let lastOutbound: number | null = null
  let lastInbound: number | null = null
  let lastAny: number | null = null

  for (const activity of activities) {
    const at = Date.parse(activity.occurredAt)
    if (Number.isNaN(at)) continue
    // #3688.7 — un rendez-vous PLANIFIÉ n'a pas eu lieu : ni compté, ni une
    // touche (« envoyé »), ni « dernier échange ». Il se lit dans « à venir ».
    if (at > now.getTime()) continue
    byKind[activity.kind] = (byKind[activity.kind] ?? 0) + 1
    // #3688.7 — un point d'équipe a eu lieu (il compte au total) mais n'est pas
    // un échange avec la personne : « dernier échange il y a N j » ne s'y lit pas.
    if (activity.direction !== 'internal' && (lastAny === null || at > lastAny)) lastAny = at
    if (activity.direction === 'outbound' && (lastOutbound === null || at > lastOutbound)) lastOutbound = at
    if (activity.direction === 'inbound' && (lastInbound === null || at > lastInbound)) lastInbound = at
  }

  const total = Object.values(byKind).reduce<number>((sum, count) => sum + count, 0)
  return {
    total,
    lastOutboundAt: lastOutbound === null ? null : new Date(lastOutbound).toISOString(),
    lastInboundAt: lastInbound === null ? null : new Date(lastInbound).toISOString(),
    daysSinceLastActivity: lastAny === null ? null : Math.max(0, Math.floor((now.getTime() - lastAny) / DAY_MS)),
    // Une réponse plus récente que notre dernier envoi ferme la question. À
    // égalité de date, on considère qu'ils ont répondu : dater deux messages à
    // la seconde près est un artefact d'import, et croire qu'on attend encore
    // ferait relancer quelqu'un qui vient d'écrire.
    awaitingReply: lastOutbound !== null && (lastInbound === null || lastInbound < lastOutbound),
    byKind: byKind as Record<ActivityKind, number>,
  }
}

/**
 * La clé d'idempotence d'une activité importée.
 *
 * `null` quand la ligne n'a pas d'identifiant externe : une saisie manuelle
 * n'est pas un doublon d'une autre saisie manuelle, même mot pour mot — un
 * commercial qui note deux appels identiques a passé deux appels.
 */
export function activityDedupeKey(input: { source: ActivitySource; externalId: string | null }): string | null {
  if (!input.externalId) return null
  return `${input.source}:${input.externalId}`
}

/**
 * Écarte les doublons d'un lot AVANT l'écriture.
 *
 * La contrainte d'unicité en base est le vrai garde-fou ; celle-ci évite de lui
 * envoyer un lot qui échouerait à moitié. Le PREMIER d'une clé gagne : les
 * fournisseurs rendent le plus récent en tête, et le plus récent est le plus
 * complet.
 */
export function dedupeActivityBatch<T extends { source: ActivitySource; externalId: string | null }>(
  batch: readonly T[],
): T[] {
  const seen = new Set<string>()
  const kept: T[] = []
  for (const item of batch) {
    const key = activityDedupeKey(item)
    if (key === null) {
      kept.push(item)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(item)
  }
  return kept
}

/* ------------------------------------------------------------------ */
/*  L'OBJET d'une ligne écrite par le SYSTÈME (#2124.68)               */
/* ------------------------------------------------------------------ */

/**
 * Le séparateur de l'objet d'une ligne de timeline écrite par le SYSTÈME.
 *
 * Trois émetteurs écrivent un objet de la forme `<contexte> — <clé>` :
 * le franchissement d'une porte (`decision-gates.service`), le mouvement d'un
 * projet (`projects.service`) et l'étape d'un positionnement
 * (`submissions.service`). La partie de DROITE est toujours une clé de domaine
 * (`accept`, `won`, `submitted`) — jamais un mot écrit pour un humain.
 *
 * ⚠️ Mesuré en production le 14/09/2026 sur le compte THALES : la section
 * « Historique & preuves » du dossier affichait `account_priority — accept`.
 * L'auteur, la date et la source étaient justes ; l'OBJET sortait en clé
 * machine. Un commercial ne lit pas « account_priority » (#2124.68 : l'historique
 * ne devient pas un journal technique).
 *
 * Le libellé ne s'écrit PAS ici — un libellé d'affichage posé dans un contrat
 * est français pour toujours (même raison que `recordCrmLookup`, qui laisse
 * `subject` à `null`). Ce que ce module garde, c'est la FORME : une seule
 * définition du séparateur, écrite par l'API et relue par l'écran, pour que les
 * deux côtés ne puissent pas diverger (GA-26).
 */
export const TIMELINE_SYSTEM_SUBJECT_SEPARATOR = ' — '

/** Compose l'objet d'une ligne système. Le seul endroit qui connaît la forme. */
export function timelineSystemSubject(context: string, key: string): string {
  return `${context}${TIMELINE_SYSTEM_SUBJECT_SEPARATOR}${key}`
}

/**
 * Redécoupe un objet système en `{ context, key }`, ou `null` s'il n'en est pas un.
 *
 * Le découpage porte sur la DERNIÈRE occurrence : un projet peut s'appeler
 * « Refonte SI — phase 2 », et c'est bien l'étape qui ferme la chaîne. Un objet
 * sans séparateur, ou dont une moitié est vide, n'est pas une ligne système :
 * on rend `null` plutôt que de réécrire le texte de quelqu'un.
 */
export function splitTimelineSystemSubject(subject: string): { context: string; key: string } | null {
  const at = subject.lastIndexOf(TIMELINE_SYSTEM_SUBJECT_SEPARATOR)
  if (at <= 0) return null
  const context = subject.slice(0, at)
  const key = subject.slice(at + TIMELINE_SYSTEM_SUBJECT_SEPARATOR.length)
  if (!context.trim() || !key.trim()) return null
  return { context, key }
}
