import {
  messageGroundingSchema,
  CHAT_BRANCH_KINDS,
  chatConversationAttachSchema,
  chatConversationAuditSnapshotSchema,
  chatConversationBranchSchema,
  chatConversationLegalHoldSchema,
  chatConversationOwnerSchema,
  chatConversationRefSchema,
  chatPresenceHeartbeatSchema,
  chatPresenceQuerySchema,
  chatResearchModeSchema,
  followUpRefSchema,
  replyTransformRequestSchema,
  chatScopeObjectSchema,
  toolFamilySchema,
  lauraContextModeSchema,
  chatThreadTitleSchema,
  chatVoiceTranscribeSchema,
  discoverRegistryRequestSchema,
  discoverSignalsRequestSchema,
  lauraPageContextSchema,
  marketLocaleSchema,
  ragAccountIdSchema,
  ragDocumentScopeSchema,
  refineRagScopeTarget,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Browser-facing IA proxy DTOs. None of them carry `user_id` — the controller
// derives it from the JWT, so a client can't act as another tenant.

const record = z.record(z.string(), z.unknown())

export const discoverSchema = z.object({
  criteria: z.string().min(1),
  // profileData is NOT accepted from the client: the controller resolves the ESN
  // profile server-side from the JWT (Théo: the front sends only the intent).
})
export class DiscoverDto extends createZodDto(discoverSchema) {}

// Découvrir v2 (`agent_docs/discover-v2-contract.md`). Les critères sont
// STRUCTURÉS : la v1 envoyait une phrase libre, relayée telle quelle à une
// fonction qui attendait un NOM D'ENTREPRISE — d'où ~22 requêtes malformées et
// tout le bruit de l'écran. Comme pour `discoverSchema`, le profil ESN n'est pas
// accepté du client : le contrôleur le résout server-side depuis le JWT.
export class DiscoverRegistryDto extends createZodDto(discoverRegistryRequestSchema) {}

export class DiscoverSignalsDto extends createZodDto(discoverSignalsRequestSchema) {}

export const chatSchema = z.object({
  message: z.string().min(1),
  // The front sends ONLY intent: message + which account is active + the local
  // transcript. The backend resolves the rest (profile, account, contacts, plan)
  // — the old accountData/contactsSummary/planSummary/profileData body fields are
  // gone (Théo §4/§13). accountId is nullish (no active account is valid).
  accountId: z.string().nullish(),
  // Thread key for long memory (Théo P2) — the web's synthetic id ("general",
  // "account-<uuid>"), so the rolling conversation summary maps to one thread.
  // Not a UUID; free-form string.
  conversationId: z.string().nullish(),
  /**
   * #2428.12 — l'identifiant CANONIQUE d'un collègue mentionné, choisi dans le
   * menu « Mentionner un membre » du composeur. Absent/`null` = mention tapée
   * à la main, ou aucune : le serveur retombe sur l'heuristique par prénom
   * (`ChatContextService.resolveMentionedColleague`), jamais cassé par une clé
   * manquante.
   */
  mentionedUserId: z.string().nullish(),
  history: z.array(record).nullish(),
  /**
   * Documents joints à cette conversation (identifiants `rag_documents`).
   *
   * Borné à trois : c'est le budget que le service IA lit en entier, et
   * l'annoncer ici fait échouer la requête plutôt que de laisser le quatrième
   * document être ignoré en silence.
   */
  documentIds: z.array(z.string().min(1).max(64)).max(3).nullish(),
  /**
   * Le copilote a-t-il déjà demandé une précision dans ce fil ?
   *
   * Envoyé par l'écran, qui est le seul à conserver les cartes de clarification
   * — l'historique transmis ne porte que `{role, content}`. Le §9.4 interdit un
   * second tour de clarification : deux questions d'affilée transforment une
   * demande en interrogatoire.
   */
  clarificationAsked: z.boolean().nullish(),
  /**
   * CE QUE L'ÉCRAN DÉCLARE MONTRER — la bulle de Laura (`LauraDock`).
   *
   * ⚠️ **Additif et facultatif.** Absent = corps identique à celui d'avant, donc
   * prompt du service IA byte-identique : l'écran `/chat`, qui ne déclare rien,
   * n'est touché par rien.
   *
   * Le schéma vient de `@bellum/contracts` et il BORNE tout ce qui vient du
   * navigateur : 160 caractères de titre, six précisions de 160, un genre pris
   * dans une énumération fermée. C'est le seul champ de cette route qu'un client
   * hostile contrôle librement, et il finit dans un prompt — d'où les bornes ici
   * plutôt qu'une confiance accordée au front.
   *
   * ⚠️ Le cloisonnement ne repose PAS sur ce schéma : un écran ne peut déclarer
   * que ce qu'il rend, et ce qu'il rend a déjà traversé l'espace actif
   * (`resolveActiveWorkspace`) et les droits de la personne. Rien n'est LU ici —
   * `entityId` ne sert qu'à cadrer, et le contenu du compte reste résolu
   * server-side depuis le JWT comme avant.
   */
  pageContext: lauraPageContextSchema.nullish(),
  /**
   * #1958.8 — LA LANGUE DE L'INTERFACE (décision de Louis, 12/09/2026 :
   * « langue de l'interface, tutoiement fixe »).
   *
   * Résolue côté navigateur (`i18n.language`, la seule porte `laura-turn.ts`)
   * et transmise TELLE QUELLE — cette porte ne valide pas un enum fermé et ne
   * rejette JAMAIS sur ce champ : le service IA retombe lui-même sur le
   * français pour toute valeur absente ou inconnue
   * (`bellum_advisor.build_system_prompt` — « toute autre valeur → fr »), donc
   * un futur troisième canal ou une typo ne doit jamais faire échouer un tour
   * de chat sur ce seul champ. La borne de longueur reste un garde-fou
   * d'écriture, la même discipline que `conversationId` un peu plus haut.
   */
  interfaceLanguage: z.string().max(8).nullish(),
  /**
   * #1943.1 — le TOUR, quand le navigateur en a déjà un (reprise du même tour).
   *
   * Moitié de la clé d'une carte (`card:<turnId>:<rang>`) : un tour rejoué avec
   * le même identifiant retrouve ses cartes au lieu d'en créer de nouvelles (I5).
   * Absent = le serveur en tire un neuf. Un UUID strict : la valeur vient du
   * client et atterrit dans une colonne `uuid`.
   */
  turnId: z.string().guid().nullish(),
  /**
   * #4967 (lot L6) — le tour vit EN ARRIÈRE-PLAN : le navigateur qui s'en va (autre écran, autre fil,
   * onglet fermé) ne l'annule plus, le serveur écrit lui-même la réponse dans le fil, et seul
   * « Arrêter » (`POST /ia/chat/turns/:turnId/stop`) l'abolit. Absent = D8 (la fermeture annule).
   */
  background: z.boolean().nullish(),
  /**
   * #1951.2 / #1951.3 — LE CONSULTANT OU LE BESOIN sur lequel le fil est cadré.
   *
   * Une nature et un identifiant, rien d'autre : le contrôleur relit la fiche
   * dans l'espace actif (même discipline que `accountId`). Un libellé envoyé
   * en plus est retiré par le schéma partagé. Absent = corps d'avant ce lot.
   *
   * ⚠️ Le plafond de coût d'une réponse (#1950.17) n'est PAS un champ de ce
   * corps : le navigateur pourrait l'élever. Le contrôleur le lit dans la grille.
   */
  scopeObject: chatScopeObjectSchema.nullish(),
  /**
   * #3772.4 / #3772.5 — L'EXCLUSION STRICTE des données de l'espace : « travailler
   * sans les données du portefeuille ». `true` = ce tour ne lit NI le
   * portefeuille, NI un compte nommé dans le texte, NI les outils qui lisent
   * l'espace — côté serveur, pas seulement au badge. Absent / `false` = corps
   * d'avant ce champ (le chemin historique : un tour sans dossier reste
   * lisible sur le portefeuille, et la promesse du libellé le DIT).
   */
  excludeWorkspaceData: z.boolean().nullish(),
  /**
   * #2453 — LE MODE DE CONTEXTE choisi sous le composeur (« Contexte de
   * travail » : Mon activité, Mission ponctuelle, Neutre). Enum FERMÉ du
   * contrat : un mode inconnu est refusé, jamais retombé en silence sur « Mon
   * activité » — l'utilisateur croirait être en neutre pendant que son profil
   * pèse. Absent = corps d'avant ce lot. C'est le service IA qui retire les
   * couches (`apps/ia/app/services/context_mode.py`) ; rien n'est écrit.
   */
  contextMode: lauraContextModeSchema.nullish(),
  /**
   * #2450.1 (reste partiel, épopée #2882) — LE MODE DE RECHERCHE choisi sous
   * le composeur (`chat-research-mode.ts`) : `'auto'`/absent = corps d'avant
   * ce champ (l'heuristique habituelle décide) ; les trois autres forcent le
   * PALIER DE MODÈLE côté service IA (`chat_model_routing.py`). Enum FERMÉ,
   * même discipline que `contextMode` juste au-dessus.
   */
  mode: chatResearchModeSchema.nullish(),
  /**
   * #3708 — « Outils et sources » : les FAMILLES d'outils que la personne a
   * exclues pour ce fil. Enum FERMÉ (`toolFamilySchema`) : une famille inconnue
   * est refusée, jamais ignorée en silence — l'utilisateur croirait une source
   * exclue qui continue d'être lue. Absent/vide = corps d'avant. Le service IA
   * retire ces familles du catalogue du tour ; désélectionner ne déconnecte rien.
   */
  excludedToolFamilies: z.array(toolFamilySchema).max(20).nullish(),
  /**
   * #3708.fournisseur — les OUTILS décochés (identifiant de connecteur, ex.
   * `hubspot`), pas seulement des familles. Le serveur les recoupe avec le
   * registre réel de la personne : un identifiant qui n'est pas un de ses outils
   * branchés est écarté, et exclure le dernier outil d'une famille exclut la
   * famille. Absent/vide = corps d'avant.
   */
  excludedToolProviders: z
    .array(
      z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9_-]+$/),
    )
    .max(40)
    .nullish(),
  /**
   * #3768 (BEL-LAU-1014) — LE GESTE « retravailler cette réponse » (approfondir,
   * synthétiser, plus de comptes…) : la réponse source et ce que l'écran en a lu
   * (forme, comptes cités, réserves). Schéma BORNÉ du contrat (le texte finit dans
   * un prompt) ; un geste inconnu est refusé. Absent = tour ordinaire, corps
   * d'avant ce champ. Rien n'est écrit ni débité par le geste lui-même.
   */
  replyTransform: replyTransformRequestSchema.nullish(),
  /** #4397 (N1) — l'objet d'une suite cliquée (consultant du vivier), hors du texte du message. */
  followUpRef: followUpRefSchema.nullish(),
  /**
   * #2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : le texte, déjà
   * extrait par `POST /rag-documents/extract` (jamais ingéré), transmis pour
   * CE tour et nulle part écrit. Distinct de `documentIds` (cas b, un geste
   * EXPLICITE d'ajout à la base de connaissance) — les deux peuvent coexister
   * sur un même message.
   *
   * Bornes identiques à l'esprit de `documentIds` : trois pièces au plus (le
   * budget que le service IA lit en entier), un nom de fichier raisonnable,
   * et un texte plafonné — annoncer le refus ici plutôt que de laisser un
   * quatrième fichier ou un texte démesuré passer en silence.
   */
  attachedFiles: z
    .array(z.object({ name: z.string().min(1).max(255), text: z.string().min(1).max(20_000) }))
    .max(3)
    .nullish(),
})
export class ChatDto extends createZodDto(chatSchema) {}

// Clé de fil de conversation — MÊME espace de noms que `chatSchema` ci-dessus.
// Historiquement la persistance exigeait un `.uuid()` pendant que `/ia/chat`
// acceptait l'id synthétique du web : le Copilote IA prenait donc un 400 à sa
// première écriture et seul le widget flottant (qui tire un `crypto.randomUUID`)
// savait persister. On aligne sur la clé libre — c'est déjà le choix fait par
// `conversation_summaries.conversation_id` (TEXT, migration LongMemory). La
// colonne `chat_messages.conversation_id` suit (UUID → TEXT, migration
// 1786500000000) : élargissement sans perte, les lignes du widget restent
// lisibles telles quelles. Borné à 200 car la valeur vient du client et atterrit
// dans une colonne indexée.
const conversationIdSchema = z.string().min(1).max(200).nullable().optional()

export const listChatMessagesSchema = z.object({
  // `accountId` reste un UUID strict : colonne uuid qui référence un compte réel.
  accountId: z.string().guid().nullable().optional(),
  conversationId: conversationIdSchema,
  limit: z.coerce.number().int().positive().max(100).default(50),
  // #2430.4 — lire une VERSION FIGÉE : le même fil, borné à la version partagée.
  version: z.coerce.number().int().positive().optional(),
  // #1944.20 — le curseur de PAGINATION vers le haut d'un fil VIVANT : la date
  // du plus ancien message déjà à l'écran (`created_at`). Distinct de
  // `version` (un LIEN figé) — deux concepts, deux clés, même si les deux se
  // traduisent en date de coupure côté service (`upTo` / `before`).
  before: z.coerce.date().optional(),
})
export class ListChatMessagesDto extends createZodDto(listChatMessagesSchema) {}

export const createChatMessageSchema = z.object({
  accountId: z.string().guid().nullable().optional(),
  conversationId: conversationIdSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  /** #1943.1 — le tour que le `done` a annoncé (`turn_id`) : c'est lui qui rattache les cartes au message. */
  turnId: z.string().guid().nullish(),
  /**
   * #1916.24 — le tour émis par le serveur à la fin du flux (`memory_turn_id`) :
   * il rattache à CETTE réponse les éléments de mémoire envoyés à Laura. Un
   * identifiant, jamais une liste d'éléments — le navigateur ne déclare pas ce
   * qui a été envoyé, il désigne un tour que le serveur a lui-même écrit.
   */
  memoryTurnId: z.string().guid().optional(),
  /**
   * #1939.13 — l'enregistrement d'un message VOCAL, tel que
   * `POST /ia/chat/voice/transcribe` l'a rendu. Un identifiant, jamais un
   * chemin ; le serveur vérifie qu'il appartient à l'appelant, dans son espace.
   */
  voiceObjectId: z.string().guid().nullable().optional(),
  /**
   * #1953.11 / #1953.22 — CETTE réponse repart d'une autre : laquelle, et
   * comment (réessai, autre angle, demande modifiée).
   *
   * Les deux vont ENSEMBLE — un lien sans nature ne dit rien à l'écran, une
   * nature sans lien ne désigne personne : le service n'écrit que la paire
   * complète, et seulement après avoir retrouvé la réponse d'origine dans
   * l'espace de l'appelant. Absents = message ordinaire, corps identique à
   * celui d'avant ce lot.
   *
   * `branchKind` est borné par `CHAT_BRANCH_KINDS` — la MÊME liste que la
   * contrainte `chat_messages_branch_kind_check` (GA-11 / GA-12 / GA-26).
   */
  branchOfMessageId: z.string().guid().nullish(),
  branchKind: z.enum(CHAT_BRANCH_KINDS).nullish(),
  /**
   * #1914.14 — le CONTEXTE du tour (sources citées, ce qui n'a pas été consulté,
   * question de précision), pour que les composants d'une réponse survivent au
   * rechargement du fil.
   *
   * `z.unknown()` À DESSEIN, et c'est une décision : la forme exacte est
   * appliquée PLUS LOIN par `persistedChatContext` (`@bellum/contracts`), qui
   * rend `null` sur ce qu'elle ne sait pas lire. Une validation stricte ICI
   * rejetterait le message ENTIER en 400 dès qu'un champ du contexte change de
   * forme — on perdrait la réponse pour sauver son panneau.
   */
  context: z.unknown().optional(),
  /**
   * #2494 — les documents ENVOYÉS avec ce message (identifiants `rag_documents`),
   * pour que la bulle affiche leur nom, tout de suite ET après un rechargement
   * du fil. Même borne que `chatSchema.documentIds` : trois au plus. Le
   * service RETROUVE le nom dans l'espace de l'appelant avant d'écrire quoi
   * que ce soit — un identifiant qui ne désigne rien ici n'écrit aucune pièce.
   */
  documentIds: z.array(z.string().min(1).max(64)).max(3).nullish(),
  /**
   * #2876 (#2433.4) — les IMAGES de conversation ENVOYÉES avec ce message
   * (identifiants `storage_objects`, domaine `chat_image_attachment`), pour
   * que la preuve visuelle survive à un rechargement du fil et reste lisible
   * par un autre membre de l'espace. Distinct de `documentIds` (rag_documents,
   * cas b) : une image de conversation (cas a, éphémère) n'en a jamais eu.
   * Même borne que `documentIds`/`attachedFiles` : trois au plus. Le service
   * VÉRIFIE que chaque identifiant appartient à l'appelant, dans cet espace,
   * avant d'écrire quoi que ce soit — un identifiant qui ne désigne rien ici
   * n'écrit aucune pièce.
   */
  imageObjectIds: z.array(z.string().min(1).max(64)).max(3).nullish(),
  /**
   * #2433.4 / #2433.12 (lot W8) — les zones lues et les objets mesurés sur ces
   * images, pour que la preuve visuelle soit RELUE à la réouverture du fil. Le
   * contenu est validé par le service (`persistableImageVision`) : une zone ou
   * une grille invalide est écartée, jamais corrigée.
   */
  imageVision: z
    .array(
      z.object({ id: z.string().min(1).max(64), regions: z.unknown().optional(), objects: z.unknown().optional() }),
    )
    .max(3)
    .nullish(),
})
export class CreateChatMessageDto extends createZodDto(createChatMessageSchema) {}

/** #1939 — le corps de `POST /ia/chat/voice/transcribe` (schéma partagé, `.strict()`). */
export class TranscribeChatVoiceDto extends createZodDto(chatVoiceTranscribeSchema) {}

export const listChatHistorySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  /** #1120 — ouvrir le tiroir des fils rangés. Absent = les fils actifs. */
  archived: z.coerce.boolean().optional(),
})
export class ListChatHistoryDto extends createZodDto(listChatHistorySchema) {}

/**
 * #1955.2 — chercher un fil sur TOUT l'historique, pas seulement la page
 * chargée par `ListChatHistoryDto`. `q` borné à 200 caractères : une requête
 * de recherche n'a pas besoin d'être plus longue qu'un titre de fil.
 */
export const searchChatThreadsSchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().positive().max(50).default(20),
  archived: z.coerce.boolean().optional(),
})
export class SearchChatThreadsDto extends createZodDto(searchChatThreadsSchema) {}

/**
 * Le fil visé par « ranger » / « supprimer » (#1120).
 *
 * Les deux clés, parce qu'un fil se désigne de deux façons selon son âge :
 * `conversationId` pour ceux qui en portent un, le couple (compte, aucun fil)
 * pour les plus anciens. C'est exactement ce que `threadWhere` sait lire.
 */
export const chatThreadTargetSchema = z.object({
  conversationId: z.string().min(1).max(200).nullish(),
  accountId: z.string().guid().nullish(),
  /**
   * #1955.18 — LA LANGUE DE L'INTERFACE, même porte et même discipline que
   * `chatSchema.interfaceLanguage` ci-dessus : résolue côté navigateur
   * (`i18n.language`), transmise TELLE QUELLE, jamais devinée. Sert
   * uniquement à choisir la locale d'affichage de la DATE dans l'export d'un
   * fil (`ChatThreadExportService` / `chatThreadExportSections`) — toute
   * autre valeur ou absence retombe sur le français, comme le reste du
   * document, qui n'est pas traduit par ce champ.
   */
  interfaceLanguage: z.string().max(8).nullish(),
  /**
   * #3895.1 — l'export d'un fil : « extract » (les derniers messages) ou « full » (le fil entier, défaut).
   * Ignoré par les autres gestes qui visent un fil (ranger, renommer…).
   */
  scope: z.enum(['extract', 'full']).nullish(),
})
export class ChatThreadTargetDto extends createZodDto(chatThreadTargetSchema) {}

export const archiveChatThreadSchema = chatThreadTargetSchema.extend({
  /** `false` ressort le fil du tiroir. Ranger n'est pas supprimer. */
  archived: z.boolean().default(true),
})
export class ArchiveChatThreadDto extends createZodDto(archiveChatThreadSchema) {}

/**
 * #1911.12 / #1955.1 — renommer un fil. Le même fil visé que l'archivage, plus
 * le titre saisi : blancs repliés, espaces retirés, 1 à 120 caractères
 * (`chatThreadTitleSchema`, @bellum/contracts — la même borne que l'écran).
 */
export const renameChatThreadSchema = chatThreadTargetSchema.extend({
  title: chatThreadTitleSchema,
})
export class RenameChatThreadDto extends createZodDto(renameChatThreadSchema) {}

/**
 * #1940.7 — attribuer une carte d'action de Laura à un collègue (sélecteur
 * « assigner à », relié à `useWorkspaceMembers`). Le même couple
 * (conversationId, accountId) que `chatThreadTargetSchema` : c'est le fil (ou
 * le compte, pour un fil ancien) qui a produit la carte, et c'est vers lui que
 * la notification renvoie (`chatNotificationLink`).
 */
export const assignPendingActionSchema = chatThreadTargetSchema.extend({
  /** Le libellé déjà lu par l'auteur (`describe(action, t, language)`, `PendingActions.tsx`) — jamais recalculé côté serveur. */
  summary: z.string().min(1).max(300),
  assigneeUserId: z.string().guid(),
})
export class AssignPendingActionDto extends createZodDto(assignPendingActionSchema) {}

/** #2430 — l'objet conversation : corps et requête de ses routes (`chat-conversations.controller.ts`). */
export class ChatConversationRefDto extends createZodDto(chatConversationRefSchema) {}
export class ChatConversationBranchDto extends createZodDto(chatConversationBranchSchema) {}
export class ChatConversationOwnerDto extends createZodDto(chatConversationOwnerSchema) {}
export class ChatConversationAttachDto extends createZodDto(chatConversationAttachSchema) {}
export class ChatConversationAuditSnapshotDto extends createZodDto(chatConversationAuditSnapshotSchema) {}
export class ChatConversationLegalHoldDto extends createZodDto(chatConversationLegalHoldSchema) {}

/** #3086 — présence sur un fil : même paire (accountId, conversationId) en écriture (heartbeat) et en lecture. */
export class ChatPresenceHeartbeatDto extends createZodDto(chatPresenceHeartbeatSchema) {}
export class ChatPresenceQueryDto extends createZodDto(chatPresenceQuerySchema) {}

// On-demand icebreaker generation for a contact. `userId` comes from the JWT,
// never the body — the IA endpoint checks ownership against it.
export const icebreakerSchema = z.object({
  contactId: z.string().guid(),
})
export class IcebreakerDto extends createZodDto(icebreakerSchema) {}

// #2810 — extraire un nom d'entreprise d'une phrase tapée dans le lanceur de
// /search (« Analyser une entreprise »). Aucune donnée d'espace : le texte
// tapé et une langue de repli, comme `chat/title` (`ChatTitleMessage`).
export const searchEntityExtractSchema = z.object({
  text: z.string().min(1).max(2_000),
  locale: z.enum(['fr', 'en']).optional(),
})
export class SearchEntityExtractDto extends createZodDto(searchEntityExtractSchema) {}

// On-demand outreach draft for one contact on one channel (engagement composer).
// `channel` picks the format; `context` is the seller's free-text angle. `userId`
// stays server-side (JWT) — the IA endpoint checks ownership against it.
// #2123.61-.68 — les paramètres CHOISIS dans le formulaire du composer. Les
// codes sont revalidés par le moteur (`MessageParameters`, 422 sur un inconnu) ;
// ici on borne la forme et la longueur de ce qui vient du navigateur.
const messageParameterCode = z.string().regex(/^[a-z_]{1,40}$/)
export const generateMessageSchema = z.object({
  contactId: z.string().guid(),
  // #2123.72 — `task` : la tâche de prise de contact (rédigée, jamais envoyée).
  // #2204.40 — `recommendation` (texte d'appui) : rédigé, jamais envoyé.
  // Théo B C5.A24 / C7.A3 — `voicemail`, `sms` et `whatsapp` ne se génèrent plus (le contrat les garde : historique lisible).
  // #2370 — les canaux préparés (règle de forme `bellum_outreach.py`) : rédigés, jamais envoyés d'ici.
  channel: z.enum([
    'email',
    'linkedin',
    'phone',
    'task',
    'recommendation',
    'introduction_request',
    'partner_message',
    'follow_up_email',
    'profile_push',
    'linkedin_connection_note',
  ]),
  context: z.string().max(2000).optional(),
  parameters: z
    .object({
      objective: messageParameterCode.optional(),
      relationship: messageParameterCode.optional(),
      persona: messageParameterCode.optional(),
      signal: z.string().max(300).optional(),
      offer: z.string().max(160).optional(),
      proof: z.string().max(300).optional(),
      cta: messageParameterCode.optional(),
      // #2204.7 — le périmètre visé ; #2204.15 — les contraintes de forme.
      scope: z.string().max(160).optional(),
      // #3418.8 / #3550 — le problème à adresser (moteur : `MessageParameters.problem`, 300). Absent ici, le
      // `.strict()` refusait en 400 TOUTE génération où le champ était rempli (recette prod 02/10).
      problem: z.string().max(300).optional(),
      constraints: z.string().max(300).optional(),
      // #3892.6 (Louis 15/10) — champs facultatifs : type de prestation, période, expérience passée.
      service: z.string().max(160).optional(),
      period: z.string().max(160).optional(),
      experience: z.string().max(300).optional(),
    })
    .strict()
    .optional(),
  // #2204.59-.65 (épopée #2947) — le style choisi dans le composer. Omis :
  // corps envoyé au moteur identique à avant (comportement historique). Fourni
  // mais introuvable/pas `active` : le contrôleur refuse plutôt que de deviner
  // (`MessageStyleService.resolveActiveTemplateForGeneration`).
  messageStyleTemplateId: z.string().guid().nullish(),
  // #2204.65 — l'ÉQUIPE visée par le composer, quand la personne en porte plusieurs. Le contrôleur ne l'honore que
  // si l'appelant porte ce périmètre (`perimetersOf`) ; le « fil » n'est pas un champ : il est recomposé du contact.
  businessUnitId: z.string().guid().optional(),
  // #4524.2 — « Sur quoi Laura s'appuie » : les faits cochés (ou « angle libre »). Omis = génération d'avant.
  grounding: messageGroundingSchema.optional(),
  // #3419.3 — « Autres accroches » : réécrire l'OUVERTURE d'un message déjà rédigé (moteur : `MessageRevision`).
  revision: z
    .object({
      kind: z.literal('alternative_hook'),
      currentBody: z.string().trim().min(1).max(4000),
      previousHooks: z.array(z.string().max(400)).max(5).optional(),
    })
    .strict()
    .optional(),
})
export class GenerateMessageDto extends createZodDto(generateMessageSchema) {}

export const ragIngestSchema = z
  .object({
    title: z.string().min(1),
    // Texte brut (txt/md/csv/json). Optionnel : un PDF/document binaire arrive
    // via `fileB64` et le texte est extrait serveur-side (IA). Théo p.21.
    content: z.string().min(1).optional(),
    category: z.string().optional(),
    // Contenu du fichier en base64 (max ~9MB via la limite 12mb de la route),
    // + son nom pour la détection de type côté IA.
    fileB64: z.string().min(1).max(12_000_000).optional(),
    filename: z.string().max(255).optional(),
    /**
     * #1954.7 — la PORTÉE du document (Louis, 12/09/2026). `workspace`
     * (défaut) ancre l'analyse de toute l'équipe, EXACTEMENT comme avant
     * cette décision. `conversation` : le document ne sert QU'AU FIL qui l'a
     * déposé — jamais listé dans `/knowledge`, jamais dans le RAG d'une
     * analyse de compte, jamais dans un autre fil.
     *
     * ⚠️ Absent = comportement byte-identique à avant : `IaClient.ragIngest`
     * n'envoie la clé au service IA que si elle est fournie ici.
     */
    scope: ragDocumentScopeSchema.optional(),
    /**
     * Le fil visé — MÊME espace de noms que `chatSchema.conversationId`
     * (l'id synthétique du web, pas un UUID). Obligatoire quand
     * `scope = 'conversation'` (voir le `.refine` plus bas ET la contrainte
     * SQL `rag_documents_conversation_scope_requires_id_check`, qui rejette
     * la même absence à l'écriture — la validation zod ne se substitue pas à
     * la contrainte, les deux tiennent la même règle).
     */
    conversationId: z.string().min(1).max(200).optional(),
    /**
     * #2779 — le compte visé quand `scope = 'account'` (un UUID). Vérifié par
     * `RagController` contre l'espace résolu côté serveur avant tout dépôt.
     */
    accountId: ragAccountIdSchema.optional(),
    /**
     * #2861 (#2437.2, niveau SOURCE) — la langue ORIGINALE du document,
     * DÉCLARÉE par la personne qui dépose, jamais détectée. Absente = `NULL`
     * en base (« non mesuré »), même catalogue que `marketLocaleSchema`
     * (GA-26 — `workspace.defaultLocale`, `contacts.locale`).
     */
    language: marketLocaleSchema.optional(),
  })
  .refine(data => Boolean(data.content) || Boolean(data.fileB64), {
    message: 'content ou fileB64 requis',
  })
  .superRefine(refineRagScopeTarget)
export class RagIngestDto extends createZodDto(ragIngestSchema) {}

/**
 * #2148.16 — extraire le texte d'un fichier SANS l'ingérer : la pièce jointe
 * de CONVERSATION (cas a). Même borne de taille que `ragIngestSchema.fileB64`
 * — c'est la même route d'upload, seule sa destination change (rien, plutôt
 * que `rag_documents`).
 */
export const ragExtractSchema = z.object({
  fileB64: z.string().min(1).max(12_000_000),
  filename: z.string().max(255).optional(),
})
export class RagExtractDto extends createZodDto(ragExtractSchema) {}

export const ragQuerySchema = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(50).optional(),
})
export class RagQueryDto extends createZodDto(ragQuerySchema) {}

// On-demand competitive battle card for one account. `userId` stays server-side
// (JWT) — the IA fetches the account scoped to it, so a client can't card another
// tenant's account.
export const battlecardSchema = z.object({
  accountId: z.string().guid(),
})
export class BattlecardDto extends createZodDto(battlecardSchema) {}

// On-demand AI comparison / prioritisation of 2–5 owned accounts. `userId` stays
// server-side (JWT); the IA scopes the read to it. Capped at 5 so the prompt (and
// the LLM cost) stays bounded — the client-side table already handles the rest.
export const compareSchema = z.object({
  accountIds: z.array(z.string().guid()).min(2).max(5),
})
export class CompareDto extends createZodDto(compareSchema) {}

// #4967 (lot L6) — les tours de Laura en arrière-plan : lesquels tournent encore, sur quel fil.
const chatTurnsRunningQuerySchema = z.object({ conversationId: z.string().min(1).max(200).nullish() })
export class ChatTurnsRunningQueryDto extends createZodDto(chatTurnsRunningQuerySchema) {}
