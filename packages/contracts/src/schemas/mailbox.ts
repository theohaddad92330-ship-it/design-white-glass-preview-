import { z } from 'zod'
import { actionDispatchIdempotencyKeySchema } from './action-router.js'

/**
 * La MESSAGERIE de l'utilisateur, vue comme une capacité et non comme un
 * éditeur (doctrine « aucun nom de fournisseur côté app ») : les écrans disent
 * « ta messagerie », le contrat dit `mailbox`, et le fournisseur réel — Google
 * ou Microsoft — n'apparaît que dans `provider`, consommé par Réglages ›
 * Intégrations et par le back-office.
 *
 * Ce contrat est la réponse aux deux méta-analyses besoins (03/08/2026) : le
 * socle P0 y est « Gmail/Outlook : lecture des fils, recherche, détection des
 * non-réponses, brouillons, pièces jointes, réponses d'absence ». Tout ce qui
 * suit décrit ces objets une seule fois, pour les deux fournisseurs.
 *
 * Règle de sobriété, héritée du code existant : on transporte des MÉTADONNÉES
 * (objet, expéditeur, date, extrait) — jamais le corps complet d'un message.
 * Un corps entier n'est nécessaire ni pour prioriser, ni pour détecter un
 * silence, ni pour préparer une réponse : le modèle reçoit l'extrait et le
 * contexte du compte. Ce qu'on ne lit pas ne peut pas fuiter.
 */

export const mailboxProviderSchema = z.enum(['google', 'microsoft'])
export type MailboxProvider = z.infer<typeof mailboxProviderSchema>

/** Un message part-il de l'utilisateur (`outbound`) ou lui arrive-t-il (`inbound`) ? */
export const mailDirectionSchema = z.enum(['inbound', 'outbound'])
export type MailDirection = z.infer<typeof mailDirectionSchema>

/**
 * Un message réduit à ses métadonnées. `date` est une chaîne ISO 8601 : elle
 * se trie lexicalement comme chronologiquement, ce qui évite de reparser une
 * date à chaque comparaison.
 */
export const mailMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().nullable(),
  subject: z.string().nullable(),
  /** Adresse brute de l'expéditeur, telle que rendue par le fournisseur. */
  from: z.string().nullable(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  date: z.string().nullable(),
  snippet: z.string().nullable(),
  unread: z.boolean(),
  hasAttachments: z.boolean(),
  direction: mailDirectionSchema,
})
export type MailMessage = z.infer<typeof mailMessageSchema>

/**
 * #2104.15 — L'ÉTAT UNIFIÉ d'un fil, une seule table plutôt que des badges
 * séparés qui disaient la même chose avec des mots différents (GA-26).
 * `treated` et `irrelevant` sont des décisions HUMAINES (#2104.7 / #2104.8) et
 * l'emportent toujours sur ce qui est simplement observé.
 */
export const mailThreadStateSchema = z.enum(['unread', 'awaiting_reply', 'treated', 'irrelevant', 'read'])
export type MailThreadState = z.infer<typeof mailThreadStateSchema>

/**
 * #2393.2 — LES DOUZE ÉTATS COMMERCIAUX D'UN FIL (LAU-FINAL-107), déclarés une
 * fois pour toutes ici — même discipline que les catégories RAG « sans
 * producteur » (`apps/ia/app/services/rag_knowledge.py::CATEGORIES_WITHOUT_
 * PRODUCER`) : un enum complet, honnête sur ce qui est RÉELLEMENT calculé.
 *
 * PRODUITS aujourd'hui, par `computeMailThreadCommercialState` (mécanique,
 * zéro modèle) :
 *  - `waiting_on_me` / `waiting_on_them` — dérivés de `lastDirection`, déjà
 *    fiable à 100 % (c'est la même donnée qui alimente `awaitingReply`) ;
 *  - `positive_reply` — réutilise `positiveReplyThreadIds` (`mail-priority.ts`),
 *    déjà déterministe, déjà utilisé pour le niveau de priorité.
 *
 * SANS PRODUCTEUR pour l'instant, et pourquoi : `question`, `objection`,
 * `not_now`, `wrong_person`, `meeting`, `admin`, `no_action`, `spam_noise` et
 * `unresolved` demandent de comprendre le CONTENU du message (une objection
 * ne se distingue d'une question que par le sens de la phrase) — aucune
 * classification de ce type n'existe encore côté serveur, et en deviner une
 * ici inventerait une donnée (doctrine « jamais de donnée fictive »). Une
 * décision produit récente (#1399.1, 22/09) a par ailleurs tranché de garder
 * TROIS onglets de triage plutôt que treize — ce champ reste donc une donnée
 * d'API, pas encore affichée à l'écran.
 */
export const MAIL_THREAD_COMMERCIAL_STATES = [
  'waiting_on_me',
  'waiting_on_them',
  'positive_reply',
  'question',
  'objection',
  'not_now',
  'wrong_person',
  'meeting',
  'admin',
  'no_action',
  'spam_noise',
  'unresolved',
] as const
export const mailThreadCommercialStateSchema = z.enum(MAIL_THREAD_COMMERCIAL_STATES)
export type MailThreadCommercialState = z.infer<typeof mailThreadCommercialStateSchema>

/**
 * #2104.6/.7/.8 — la décision MANUELLE posée sur un fil : marqué traité,
 * signalé non pertinent, ou aucune (`null`). Distinct de `MailThreadState`,
 * qui mélange cette décision avec ce qui est simplement OBSERVÉ (lu/non lu) —
 * `MailThreadMark` est la partie que l'utilisateur, et lui seul, a écrite.
 */
export const mailThreadMarkSchema = z.enum(['treated', 'irrelevant', 'archived'])
export type MailThreadMark = z.infer<typeof mailThreadMarkSchema>

/**
 * Un FIL, c'est-à-dire ce sur quoi un commercial raisonne réellement : « est-ce
 * que ces gens m'ont répondu ? ». `awaitingReply` est calculé, pas déclaré par
 * le fournisseur — voir `no-reply.ts` côté API.
 */
export const mailThreadSchema = z.object({
  threadId: z.string().min(1),
  subject: z.string().nullable(),
  /** L'interlocuteur externe du fil (celui qu'on relance), si identifiable. */
  counterpart: z.string().nullable(),
  lastMessageAt: z.string().nullable(),
  lastDirection: mailDirectionSchema,
  messageCount: z.number().int().nonnegative(),
  /** Le dernier message est sorti de chez nous et personne n'a répondu depuis. */
  awaitingReply: z.boolean(),
  /** Jours écoulés depuis le dernier message du fil (null si date inconnue). */
  daysSinceLastMessage: z.number().int().nonnegative().nullable(),
  unread: z.boolean(),
  hasAttachments: z.boolean(),
  /**
   * Les autres personnes du fil, hors l'utilisateur et hors l'interlocuteur
   * principal — la matière du garde-fou n°12 (« gestion To/CC intelligente »).
   *
   * Répondre à un fil à trois en n'écrivant qu'à une personne coupe les deux
   * autres de la conversation : elles apprennent la suite par quelqu'un d'autre,
   * ou pas du tout. L'écran les propose en copie ; il ne les ajoute pas d'office.
   */
  otherParticipants: z.array(z.string()),
  /**
   * Le COMPTE auquel ce fil se rattache (MAIL-01, audit du 17/08).
   *
   * L'écran triait par intention et affichait « Re: Changement projet ·
   * s.dean@… · silencieux depuis 19 jours » : il fallait se rappeler qui est
   * cette personne et de quelle affaire il s'agit. Sans ce rappel, la messagerie
   * reste un filtre e-mail, pas un poste de travail commercial.
   *
   * `null` quand rien ne rattache le fil AVEC CERTITUDE — adresse inconnue, ou
   * domaine partagé par deux comptes. Se tromper de compte serait pire que ne
   * rien proposer : la ligne deviendrait un mensonge vérifiable d'un clic.
   * Absent d'une API antérieure au champ, d'où le `.optional()`.
   */
  account: z
    .object({
      id: z.string(),
      name: z.string(),
      /** `contact` = adresse exacte connue ; `domain` = domaine sans ambiguïté ;
       *  `manual` = rattaché à la main (#2104.6), l'auto-détection n'ayant rien trouvé. */
      via: z.enum(['contact', 'domain', 'manual']),
      /** #5003 — le compte rattaché est une ESN : le fil est ÉTIQUETÉ, jamais retiré. Absent = non établi. */
      isEsn: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  /**
   * #2104.3 — LA FICHE CONTACT de l'interlocuteur, quand son adresse
   * correspond exactement à un contact du portefeuille.
   *
   * Même prudence que `account` : seule l'adresse EXACTE identifie une
   * personne précise — un domaine partagé par plusieurs contacts ne dit pas
   * LEQUEL, donc il ne rattache rien ici (contrairement au COMPTE, où le
   * domaine suffit quand il n'appartient qu'à un seul dossier). `null` quand
   * rien ne correspond avec certitude. Absent d'une API antérieure au champ.
   */
  contactId: z.string().nullable().optional(),
  /**
   * Les MESSAGES du fil, en métadonnées (#1400).
   *
   * ⚠️ Ils n'ont jamais coûté un appel de plus : le backend récupère déjà les
   * messages (`MailSearchOutcome.messages`), `groupIntoThreads` les replie en
   * fils — et les JETAIT. Le panneau de détail réclamé par le retour demandait
   * donc une donnée qui traversait déjà le serveur pour finir à la poubelle.
   *
   * La règle de sobriété du haut de ce fichier tient : ce sont les mêmes
   * métadonnées que partout (objet, expéditeur, date, extrait), JAMAIS le corps
   * complet. Un panneau qui afficherait les corps demanderait un appel
   * fournisseur par message et transporterait ce qu'on a choisi de ne pas lire.
   *
   * Borné aux 12 derniers, du plus ancien au plus récent : un fil de support à
   * deux cents messages n'apprend rien de plus qu'un fil de douze, et la borne
   * évite qu'une seule recherche de 40 fils ne devienne une réponse énorme.
   * Absent d'une API antérieure au champ, d'où le `.optional()`.
   */
  messages: z.array(mailMessageSchema).optional(),
  /**
   * #2104.15 — L'ÉTAT UNIFIÉ. Remplace la lecture séparée de `unread` et
   * `awaitingReply` pour l'AFFICHAGE (les deux champs restent, pour le tri et
   * les filtres qui existaient déjà) : un seul badge, une seule vérité.
   * Absent d'une API antérieure au champ, d'où le `.optional()`.
   */
  state: mailThreadStateSchema.optional(),
  /**
   * #2393.2 — LE STATUT COMMERCIAL, distinct de `state` ci-dessus (`state`
   * dit ce qui est OBSERVÉ — lu, en attente — ou DÉCIDÉ manuellement ;
   * `commercialState` dit sur QUI l'échange retombe). `null` quand rien ne
   * le calcule encore (voir `MAIL_THREAD_COMMERCIAL_STATES` : neuf des douze
   * valeurs n'ont pas de producteur aujourd'hui, à dessein) — jamais deviné.
   */
  commercialState: mailThreadCommercialStateSchema.nullable().optional(),
  /**
   * #2104.16 — LE NIVEAU DE PRIORITÉ, 1 (le plus urgent) à 6 (rien de
   * particulier, ou marqué manuellement). Calculé côté serveur
   * (`mail-priority.ts`), jamais par l'écran : la RAISON qui l'accompagne
   * (`priorityReason`) est ce qui rend ce niveau vérifiable plutôt qu'affirmé.
   */
  priorityLevel: z.number().int().min(1).max(6).optional(),
  /**
   * #2104.14 / #2104.17 — LA RAISON du niveau ci-dessus, une clé STABLE que
   * l'écran traduit (`priorityReason.<clé>`) — jamais une phrase composée
   * côté serveur, qui figerait la langue. Un score n'est jamais nu (doctrine) :
   * ce champ est ce qui rend `priorityLevel` explicable plutôt qu'affirmé.
   */
  priorityReason: z.string().nullable().optional(),
  /**
   * Théo B M2.N3 — le fil est REPORTÉ jusqu'à cette date (retrouvable dans « À venir »). Absent quand rien n'est
   * reporté ou quand le report est échu : le fil est alors de retour dans « À traiter ». Aucun rappel externe.
   */
  snoozeUntil: z.string().nullable().optional(),
})
export type MailThread = z.infer<typeof mailThreadSchema>

/**
 * Les intentions MÉTIER de recherche listées par les méta-analyses (§5.1 Gmail,
 * §13.1). Elles existent pour une raison précise : un commercial dit « les mails
 * qui parlent de TJM », pas `subject:TJM OR body:"taux journalier"`. La
 * traduction en syntaxe fournisseur est déterministe et testée — aucun modèle
 * n'invente une requête, donc aucune recherche ne peut silencieusement rater sa
 * cible parce qu'un prompt a changé.
 *
 * `free` est l'échappatoire : la requête utilisateur passe telle quelle.
 */
export const mailSearchIntentSchema = z.enum([
  'unread',
  'no_reply',
  'budget',
  'tjm',
  'cv',
  'job_description',
  'contract',
  'tender',
  'invoice',
  'meeting',
  'positive_reply',
  'out_of_office',
  'attachments',
  'free',
])
export type MailSearchIntent = z.infer<typeof mailSearchIntentSchema>

export const mailSearchRequestSchema = z.object({
  intent: mailSearchIntentSchema.default('free'),
  /** Texte libre ajouté à l'intention (nom de société, domaine, mot-clé). */
  query: z.string().max(400).optional(),
  /** Restreint aux échanges avec cette adresse ou ce domaine. */
  counterpart: z.string().max(320).optional(),
  /** Fenêtre glissante, en jours (défaut 30 — un mois de recul commercial). */
  windowDays: z.number().int().min(1).max(365).default(30),
  /** Pour `no_reply` : silence minimum avant de considérer qu'il faut relancer. */
  silenceDays: z.number().int().min(1).max(180).default(7),
  limit: z.number().int().min(1).max(100).default(25),
})
export type MailSearchRequest = z.infer<typeof mailSearchRequestSchema>

/**
 * F2-FIX — « N RÉPONSES À TRAITER » EST UNE SEULE MESURE.
 *
 * Recette prod du 20/10 : `/mailbox` disait « 2 réponses à traiter », `/briefing` « 11 ». Deux calculs :
 * le Brief additionnait les réponses favorables ET les non-lus (`positiveReplies + unread`) sur une
 * fenêtre de 14 jours plafonnée à 5, la messagerie ne comptait que les réponses favorables sur 30 jours.
 * Un non-lu n'est pas une décision en attente (voir `mailbox/hero.ts`) : la mesure est les fils de
 * réponse favorable, posée par UNE question à la messagerie, lue par les deux écrans (GA-26).
 */
export const REPLIES_TO_TREAT_REQUEST = { intent: 'positive_reply', windowDays: 14, limit: 40 } as const

/** Le nombre de réponses à traiter : les fils de réponse favorable, rien d'autre. */
export function countRepliesToTreat(positiveReplyThreads: readonly unknown[] | null | undefined): number {
  return positiveReplyThreads?.length ?? 0
}

export const mailSearchResponseSchema = z.object({
  provider: mailboxProviderSchema,
  intent: mailSearchIntentSchema,
  threads: z.array(mailThreadSchema),
  /** Ce que la recherche a réellement demandé au fournisseur — affiché dans le
   *  détail « Méthode et sources », jamais dans la vue commerciale. */
  resolvedQuery: z.string(),
  /** Vrai quand la borne `limit` a coupé : l'écran doit le dire au lieu de
   *  laisser croire que le compte est à zéro. */
  truncated: z.boolean(),
})
export type MailSearchResponse = z.infer<typeof mailSearchResponseSchema>

/**
 * #2104.7 / #2104.8 — MARQUER un fil comme traité, ou le signaler non
 * pertinent. `mark: null` EFFACE la marque (toggle depuis l'écran) : ce n'est
 * ni « traité » ni « non pertinent » qui devrait exiger deux routes pour
 * revenir en arrière.
 */
export const setMailThreadMarkRequestSchema = z.object({
  mark: mailThreadMarkSchema.nullable(),
})
export type SetMailThreadMarkRequest = z.infer<typeof setMailThreadMarkRequestSchema>

/**
 * #2104.6 — RATTACHER un fil à un compte À LA MAIN, quand l'auto-détection
 * (`thread-account-link.ts`) n'a rien trouvé avec certitude. Un seul compte à
 * la fois : détacher n'est pas demandé par le retour, et une valeur vide
 * ouvrirait une question (« vide veut dire quoi ? ») que ce contrat ne pose
 * pas.
 */
export const linkMailThreadAccountRequestSchema = z.object({
  accountId: z.string().min(1),
})
export type LinkMailThreadAccountRequest = z.infer<typeof linkMailThreadAccountRequestSchema>

/**
 * Théo B M1.N1 / M1.N2 / M1.N3 / M1.N6 — l'état de traitement d'un fil, TENU CÔTÉ BELLUM, sans aucun contenu
 * de message : reporté jusqu'à une date (retrouvable dans « À venir », aucun rappel externe), prioritaire à la
 * main, rattaché à un contact. « Archivé » est une marque de plus (`mailThreadMarkSchema`) : on archive, on ne supprime pas.
 */
export const snoozeMailThreadRequestSchema = z.object({
  /** `null` retire le report. Une date passée est refusée : reporter, c'est repousser. */
  until: z.string().datetime({ offset: true }).nullable(),
})
export type SnoozeMailThreadRequest = z.infer<typeof snoozeMailThreadRequestSchema>

export const setMailThreadPriorityRequestSchema = z.object({ priority: z.boolean() })
export type SetMailThreadPriorityRequest = z.infer<typeof setMailThreadPriorityRequestSchema>

export const linkMailThreadContactRequestSchema = z.object({ contactId: z.string().guid() })
export type LinkMailThreadContactRequest = z.infer<typeof linkMailThreadContactRequestSchema>

/** Les compteurs des onglets de traitement. Un compteur est un nombre de fils marqués, jamais « 0 » inventé. */
export const mailThreadStateCountsSchema = z.object({
  treated: z.number().int().nonnegative(),
  irrelevant: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  snoozed: z.number().int().nonnegative(),
  prioritized: z.number().int().nonnegative(),
})
export type MailThreadStateCounts = z.infer<typeof mailThreadStateCountsSchema>

/** Une pièce jointe repérée sur un message (jamais téléchargée à ce stade). */
export const mailAttachmentSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
  filename: z.string(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
})
export type MailAttachment = z.infer<typeof mailAttachmentSchema>

/**
 * Une demande de BROUILLON. `threadId` + `inReplyTo` sont ce qui fait qu'une
 * réponse atterrit dans le bon fil plutôt qu'en nouveau message orphelin —
 * l'anti-pattern n°9 des méta-analyses (« créer de vrais brouillons »).
 */
export const mailDraftRequestSchema = z.object({
  to: z.string().email(),
  cc: z.array(z.string().email()).max(20).default([]),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  threadId: z.string().optional(),
  /** Message-ID RFC 5322 du message auquel on répond. */
  inReplyTo: z.string().optional(),
  /** Ajouter la signature réelle de l'utilisateur au pied du corps. */
  appendSignature: z.boolean().default(true),
  /**
   * Documents à joindre RÉELLEMENT, désignés par leur identifiant dans l'espace
   * documentaire de l'utilisateur.
   *
   * Garde-fou n°26 des méta-analyses : « associer la pièce jointe RÉELLE au
   * brouillon ». Un lien vers un document oblige le destinataire à avoir un
   * compte, à demander l'accès, et le plus souvent à ne jamais l'ouvrir — c'est
   * la façon la plus sûre de faire disparaître un CV.
   *
   * On transporte des IDENTIFIANTS et non des fichiers : le client ne renvoie
   * pas un document qu'il vient de télécharger, et le serveur ne reçoit jamais
   * de contenu qu'il n'a pas lui-même lu chez le fournisseur.
   */
  documentIds: z.array(z.string().min(1).max(200)).max(5).default([]),
  /**
   * #1959.3 — le chat appelle cet endpoint EN DIRECT, sans passer par le
   * routeur d'actions (`dispatchIdempotent`) : un double clic ou un rejeu
   * réseau déposait deux brouillons dans la vraie messagerie du commercial.
   * Optionnelle : un appelant qui l'ignore obtient le comportement d'avant
   * ce champ, au bit près (aucune réclamation, aucune ligne écrite).
   */
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
  /**
   * #2955 (#2394.57, décision Louis 28/09) — le fil `/chat` d'où la carte
   * « Préparer un brouillon » a été proposée, quand elle l'a été. Sert
   * UNIQUEMENT à retrouver les participants du fil visé (`threadId`) dans
   * l'état DÉJÀ persisté de CETTE conversation (`chat_messages.context.
   * mail_threads`) — jamais une nouvelle lecture de la messagerie, jamais le
   * corps d'un message. Absent = comportement inchangé (composition manuelle
   * depuis l'écran de messagerie, hors chat).
   */
  conversationId: z.string().optional(),
})
export type MailDraftRequest = z.infer<typeof mailDraftRequestSchema>

export const mailDraftResultSchema = z.object({
  provider: mailboxProviderSchema,
  draftId: z.string(),
  messageId: z.string().nullable(),
  threadId: z.string().nullable(),
  /** Lien direct vers le brouillon dans la messagerie, quand le fournisseur en
   *  donne un — c'est la « preuve d'exécution » réclamée par les rapports. */
  webUrl: z.string().nullable(),
})
export type MailDraftResult = z.infer<typeof mailDraftResultSchema>

/**
 * #4405.1 — « Préparer la réponse » pré-génère le mail prêt à l'envoi. Le fil est
 * désigné par son identifiant : le CORPS est lu côté serveur avec le jeton de
 * l'utilisateur (c96), il ne transite jamais par le navigateur.
 */
export const mailReplyDraftRequestSchema = z.object({
  threadId: z.string().min(1).max(500),
  /**
   * L'interlocuteur du fil — borne la lecture à ses messages, comme `read_mail_thread`.
   * #4405.1 — OPTIONNEL : un fil de groupe ou d'événement n'en a pas (`MailThread.counterpart`
   * est nullable) ; l'exiger faisait échouer « Préparer la réponse » en 400.
   */
  counterpart: z.string().min(1).max(320).optional(),
  locale: z.enum(['fr', 'en']).default('fr'),
})
export type MailReplyDraftRequest = z.infer<typeof mailReplyDraftRequestSchema>

/** Le VRAI texte du modèle — un échec est une erreur HTTP, jamais un corps vide ou deviné. */
export const mailReplyDraftResultSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
})
export type MailReplyDraftResult = z.infer<typeof mailReplyDraftResultSchema>

/**
 * #2394.62 — la garde derrière « déposé dans ta messagerie ».
 *
 * #2394.35 ne vérifiait que `draftId` : un fournisseur qui rend un identifiant
 * de brouillon SANS `messageId` ni `threadId` obtenait quand même un « Aucun
 * message n'a été envoyé » qui sonne comme un succès complet, alors que rien
 * ne prouve où ce brouillon a atterri. Le NO-GO de #2394 le dit explicitement :
 * annoncer un dépôt en messagerie sans cette preuve. Une seule dérivation
 * (GA-26), lue par le routeur (`action-router.service.ts::dispatchMailDraft`,
 * preuve serveur pour un run gouverné) ET par l'écran (`PendingActions.tsx`,
 * l'appel direct de #1959.3) : les deux affirment « déposé » sur le MÊME jeu
 * de preuves.
 */
export function mailDraftHasProof(result: Pick<MailDraftResult, 'draftId' | 'messageId' | 'threadId'>): boolean {
  return Boolean(result.draftId) && Boolean(result.messageId) && Boolean(result.threadId)
}

/**
 * Ce que la messagerie connectée sait faire ICI ET MAINTENANT, dérivé des
 * portées réellement accordées au jeton. Un écran qui propose « réponse
 * d'absence » alors que la portée manque ment à l'utilisateur ; il vaut mieux
 * griser le bouton et dire ce qu'il faut reconnecter.
 */
export const mailboxCapabilitiesSchema = z.object({
  read: z.boolean(),
  draft: z.boolean(),
  send: z.boolean(),
  labels: z.boolean(),
  outOfOffice: z.boolean(),
})
export type MailboxCapabilities = z.infer<typeof mailboxCapabilitiesSchema>

export const mailboxStatusSchema = z.object({
  connected: z.boolean(),
  provider: mailboxProviderSchema.nullable(),
  /** Adresse de la boîte connectée, quand le fournisseur la donne. */
  address: z.string().nullable(),
  capabilities: mailboxCapabilitiesSchema,
  /**
   * #2756 — le nombre de messageries RÉELLEMENT connectées (Google et
   * Microsoft 365 peuvent coexister), pas seulement celle qui gagne l'arbitrage
   * « la première connectée » (`MailboxService`, doctrine : deux boîtes
   * moitié-lues sont pires qu'une seule choisie). `0` sans connexion, sinon
   * au moins `1` — jamais recalculé côté client, lu tel quel du serveur.
   */
  connectedCount: z.number().int().min(0),
})
export type MailboxStatus = z.infer<typeof mailboxStatusSchema>

/**
 * #4546.5 — UNE boîte d'où le commercial peut faire partir un message. Ses boîtes seulement (jamais celles d'un
 * collègue) ; `address` est `null` quand le fournisseur ne l'a pas communiquée — jamais devinée. Les capacités sont
 * celles des portées RENDUES pour CETTE boîte : une boîte sans envoi ne propose pas l'envoi.
 */
export const mailboxSenderSchema = z.object({
  connectionId: z.string().guid(),
  provider: mailboxProviderSchema,
  address: z.string().nullable(),
  capabilities: z.object({ read: z.boolean(), draft: z.boolean(), send: z.boolean() }),
})
export type MailboxSender = z.infer<typeof mailboxSenderSchema>

/**
 * Réponse d'absence (§5.1 n°31, requête n°8). Bornée par des dates : une
 * absence sans fin est un piège à relance automatique.
 */
export const outOfOfficeRequestSchema = z.object({
  enabled: z.boolean(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  subject: z.string().max(300).optional(),
  message: z.string().max(5000).optional(),
  /** Ne répondre qu'aux contacts déjà connus (défaut : tout le monde). */
  contactsOnly: z.boolean().default(false),
})
export type OutOfOfficeRequest = z.infer<typeof outOfOfficeRequestSchema>

/**
 * La signature que l'utilisateur saisit DANS Bellum (PDF 6 §5.2 règle c).
 *
 * La colonne `profiles.email_signature` existait, elle était lue — et rien ne
 * l'écrivait. La première branche du repli documenté (« ce que l'utilisateur a
 * écrit dans Bellum l'emporte sur ce que le fournisseur stocke ») ne pouvait
 * donc jamais être vraie : elle était morte depuis sa livraison.
 *
 * Une chaîne VIDE efface la signature et retombe sur celle du fournisseur ; le
 * champ n'est pas `null`able pour cette raison — « je n'en veux pas » et « je
 * n'ai rien saisi » se distinguent, et seule la seconde interroge Gmail.
 */
export const updateSignatureSchema = z
  .object({
    signature: z.string().max(2000),
  })
  .strict()
export type UpdateSignatureInput = z.infer<typeof updateSignatureSchema>
