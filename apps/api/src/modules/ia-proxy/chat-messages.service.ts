import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { And, In, IsNull, LessThan, LessThanOrEqual, MoreThanOrEqual, Not, Repository } from 'typeorm'
import {
  persistableImageVision,
  persistedChatContext,
  STORAGE_RETENTION_DAYS_BY_DOMAIN,
  type ChatBranchKind,
  type PersistedChatImage,
} from '@bellum/contracts'
import { ChatMessageEntity, type ChatMessageRole } from '../../database/entities/chat-message.entity'
import { RagDocumentEntity } from '../../database/entities/rag-document.entity'
import { returnedCount } from '../../database/returned-rows'
import { resolveChatAuthors, type ChatMessageAuthor } from './chat-message-authors'
import { resolveThreadAccountNames } from './chat-thread-accounts'
import { QUOTA_WINDOW_MS } from './chat-quota'

/**
 * #1957.8 — la borne de lecture des horodatages du plafond. Au plafond (50 par
 * défaut, plus au plus un tiers d'exonérés), une personne a quelques dizaines de
 * demandes sur 24 h : 1 000 laisse vingt fois la marge, et au-delà la lecture
 * est déclarée TRONQUÉE plutôt que calculée sur une partie.
 */
const QUOTA_STAMPS_READ_LIMIT = 1000

/**
 * #1955.2 — la borne de lecture d'une recherche de fils : au-delà, une
 * recherche est TRONQUÉE plutôt que rendue sur une partie qu'elle ne nomme
 * pas. 500 fils couvre plusieurs années d'activité normale d'un siège.
 */
const THREAD_SEARCH_SCAN_LIMIT = 500

/**
 * #1955.2 — LA MÊME règle que `filterThreads` (web, `conversation.ts`) :
 * insensible à la casse ET aux accents, pour que « latecoere » trouve
 * « Latécoère ». Copie assumée, pas un import : `apps/web` ne s'importe pas
 * dans `apps/api`, et la fonction est trop courte pour justifier un paquet
 * partagé qui n'a que ce seul appelant côté API.
 */
function foldSearchText(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/** Le fil d'une personne : la clé du fil, plus la personne. */
/** #4540 — combien de temps une question échouée, pas encore écrite, attend sa création pour naître exonérée. */
const PENDING_RELEASE_TTL_MS = 2 * 60 * 1000

type ThreadTarget = {
  userId: string
  workspaceId: string
  accountId: string | null
  conversationId: string | null
}

type ChatMessageSummary = Pick<
  ChatMessageEntity,
  // #1939 — `voice_object_id` dit à l'écran quels messages ont un enregistrement
  // encore conservé (bouton « réécouter »). Jamais le chemin : seulement l'id.
  | 'id'
  | 'account_id'
  | 'conversation_id'
  | 'role'
  | 'content'
  | 'created_at'
  | 'voice_object_id'
  // #1953.11 / #1953.22 — la provenance de la branche. Sans ces trois-là servis,
  // l'écran repart d'un état neuf à chaque montage et la marque « réponse
  // remplacée » disparaît au rechargement (défaut mesuré en production le
  // 16/09/2026).
  | 'superseded_at'
  | 'branch_of_message_id'
  | 'branch_kind'
  // #1914.14 — `context` est ce qui RE-REND les composants d'une réponse relue.
  | 'context'
  // #2494 — les pièces jointes ENVOYÉES avec ce message ; sans elles servies,
  // la bulle relue ne peut pas montrer ce que le fil de démonstration a vu au
  // moment de l'envoi.
  | 'attachments'
  // #2876 (#2433.4) — les IMAGES de conversation ENVOYÉES avec ce message ;
  // distinct d'`attachments` (rag_documents, cas b) — une image éphémère
  // (cas a) n'y a jamais d'id. Sans cette colonne servie, la preuve visuelle
  // ne survit ni au rechargement du fil ni à la relecture par un collègue.
  | 'image_attachments'
>

/**
 * #1940.4 — un message du fil tel que servi au client : son auteur est un
 * prénom + un avatar, ou `null` (réponse de Laura, compte effacé, personne
 * hors de l'espace). `user_id` n'est jamais servi.
 */
type ChatThreadMessage = ChatMessageSummary & { author: ChatMessageAuthor | null }

type ChatHistoryItem = {
  id: string
  account_id: string | null
  conversation_id: string | null
  title: string
  /** Ouverture du fil (son premier message) — ce qui lui donne son titre. */
  created_at: Date
  /** Dernière activité — ce qui le classe dans la liste. */
  last_message_at: Date
  /** #1911.4 — l'auteur principal : celui qui a OUVERT le fil, ou `null`. */
  author: ChatMessageAuthor | null
  /**
   * #1911.10 — le nom lisible du compte du fil, lu dans l'espace, ou `null`
   * (fil de portefeuille, compte effacé ou d'un autre espace, nom blanc).
   */
  account_name: string | null
  /**
   * #1911.5 — LE RÔLE DU DERNIER MESSAGE DU FIL, et rien d'autre.
   *
   * C'est de LUI que l'écran dérive « en attente / reçu » : `user` = j'ai
   * écrit, Laura n'a pas encore répondu ; `assistant` = elle a répondu. Le
   * statut décrit la CONVERSATION, pas une action à valider — celle-là vit
   * dans le plan d'action, et la faire apparaître ici aussi montrerait deux
   * fois la même chose sous deux noms (loi 4 du tome 7).
   *
   * `null` = la lecture n'a rien rendu (fil vide impossible en théorie, base
   * illisible en pratique). Pas de statut affiché alors, JAMAIS un statut
   * deviné d'une date : `last_message_at` ne dit pas QUI a parlé en dernier —
   * et ici il ne le dirait même pas s'il le voulait, la fenêtre qui le calcule
   * ne voit que les messages `role = 'user'`.
   */
  last_message_role: ChatMessageRole | null
}

/**
 * #1911.5 — la clé de fil, en TypeScript, telle que le SQL la calcule
 * (`COALESCE(message.conversation_id, message.id::text)` dans
 * `threadsBaseQuery`). Une dérivation vit à un seul endroit : elle est écrite
 * ici une fois et les deux lectures s'en servent, plutôt qu'un `?? row.id`
 * recopié qui divergerait au premier fil sans `conversation_id`.
 */
function threadKeyOfRow(row: { id: string; conversation_id: string | null }): string {
  return row.conversation_id ?? row.id
}

/**
 * #2876 (décision Louis 14/10) — le nombre de jours au-delà desquels une image
 * de chat n'est plus lisible, lu au MÊME endroit que la purge du fichier
 * (`STORAGE_RETENTION_DAYS_BY_DOMAIN`, `@bellum/contracts`) — un réglage ne
 * vit qu'à un seul endroit (GA-26).
 */
const CHAT_IMAGE_VISION_RETENTION_DAYS = STORAGE_RETENTION_DAYS_BY_DOMAIN.chat_image_attachment

/**
 * #2876 (décision Louis 14/10) — ARCHIVER, pas supprimer. Une fois
 * `image_vision_archived_at` posé, la LECTURE rend un stub `{id, name}` par
 * image : ses `regions`/`objects` ne sortent plus, ni à l'écran ni vers un
 * futur appelant modèle — la LIGNE, elle, garde tout (`archiveExpiredImageVision`
 * ne touche jamais `image_attachments`).
 */
function stripArchivedImageVision(
  images: PersistedChatImage[] | null,
  archivedAt: Date | null,
): PersistedChatImage[] | null {
  if (!images || !archivedAt) return images
  return images.map(({ id, name }) => ({ id, name }))
}

/**
 * #1911.5 — le DERNIER message de chaque fil, tous rôles confondus.
 *
 * `DISTINCT ON` + `ORDER BY … created_at DESC` garde la ligne la plus récente
 * par fil ; le `id DESC` départage deux messages écrits dans la même
 * milliseconde, pour que la lecture soit la même d'un appel à l'autre.
 */
const LAST_MESSAGE_ROLE_SQL = `SELECT DISTINCT ON (COALESCE(m.conversation_id, m.id::text))
          COALESCE(m.conversation_id, m.id::text) AS "threadKey",
          m.role AS "role"
     FROM chat_messages m
    WHERE m.workspace_id = $1
      AND COALESCE(m.conversation_id, m.id::text) = ANY($2::text[])
    ORDER BY COALESCE(m.conversation_id, m.id::text), m.created_at DESC, m.id DESC`

@Injectable()
export class ChatMessagesService {
  private readonly logger = new Logger(ChatMessagesService.name)

  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
    /**
     * #2494 — RETROUVE le nom d'un document joint, dans l'espace de l'appelant,
     * avant de l'écrire avec le message. `@Optional()` EN FIN, comme les autres
     * dépendances de confort du module (`ia-proxy.controller.ts`) : sans lui,
     * `resolveAttachments` rend `null` et le message part quand même, sans
     * pièce jointe déclarée — jamais un message perdu pour une pièce jointe.
     */
    @Optional()
    @InjectRepository(RagDocumentEntity)
    private readonly docs?: Repository<RagDocumentEntity>,
  ) {}

  /**
   * Multi-user Phase 2: chat threads are a team resource. Reads scope by the
   * caller's active `workspaceId` (resolved in the controller); writes keep
   * `user_id` as created-by attribution and add `workspace_id`.
   *
   * ⚠️ #2703 (22/09/2026) — LA PHRASE « Identical behaviour today (1 user = 1
   * workspace) » QUI TENAIT ICI EST MORTE, et ce lot la retire délibérément.
   * Apricot Labs paie deux sièges dans un même espace : ses deux membres
   * écrivaient dans le même fil par défaut. Depuis, `userId` est REQUIS et
   * {@link threadWhere} en fait un filtre sur le fil par DÉFAUT seulement — une
   * conversation nommée reste partagée par l'espace, elle.
   */
  async listThread(args: {
    /** #2703 — QUI lit. Borne le fil par défaut ; sans effet sur une conversation nommée. */
    userId: string
    accountId: string | null
    conversationId: string | null
    limit: number
    workspaceId: string
    /** #2430.4 — la borne d'une version figée : rien d'écrit APRÈS n'est rendu. */
    upTo?: Date | null
    /**
     * #1944.20 — le curseur de PAGINATION vers le haut d'un fil vivant : rien
     * écrit À CETTE DATE OU APRÈS n'est rendu (strictement AVANT — sinon la
     * page suivante rejouerait le dernier message de la page précédente).
     * Distinct de `upTo` (version figée, inclusive) ; les deux peuvent en
     * principe se combiner, même si ce lot ne les appelle jamais ensemble.
     */
    before?: Date | null
  }): Promise<ChatThreadMessage[]> {
    const cutoff =
      args.upTo && args.before
        ? And(LessThanOrEqual(args.upTo), LessThan(args.before))
        : args.upTo
          ? LessThanOrEqual(args.upTo)
          : args.before
            ? LessThan(args.before)
            : null
    const rows = await this.messages.find({
      where: {
        ...this.threadWhere(args.workspaceId, args.accountId, args.conversationId, args.userId),
        ...(cutoff ? { created_at: cutoff } : {}),
      },
      // #1914.14 — `context` lu ICI : sans cette colonne dans le `select`, la
      // valeur écrite n'atteindrait jamais l'écran (du code juste que personne
      // n'appelle — le défaut n°1 du dépôt).
      select: [
        'id',
        'user_id',
        'account_id',
        'conversation_id',
        'role',
        'content',
        'created_at',
        'voice_object_id',
        // #1953.11 / #1953.22 — la provenance de la branche.
        'superseded_at',
        'branch_of_message_id',
        'branch_kind',
        'context',
        // #2494 — sans cette colonne dans le `select`, la pièce jointe écrite
        // n'atteindrait jamais l'écran à la relecture (du code juste que
        // personne n'appelle).
        'attachments',
        // #2876 (#2433.4) — même raison, pour l'image de conversation.
        'image_attachments',
        // #2876 (décision Louis 14/10) — lue ICI seulement pour trancher le
        // dépouillement ci-dessous ; jamais rendue telle quelle au client.
        'image_vision_archived_at',
      ],
      order: { created_at: 'DESC' },
      take: args.limit,
    })

    // #1940.4 — qui a posé chaque question. Résolu parmi les membres de l'espace
    // LU (jamais celui de l'auteur) ; une réponse de Laura n'a pas d'auteur humain.
    const authors = await resolveChatAuthors(
      this.messages.manager,
      args.workspaceId,
      rows.filter(row => row.role === 'user').map(row => row.user_id),
    )
    return rows.reverse().map(row => ({
      id: row.id,
      account_id: row.account_id,
      conversation_id: row.conversation_id,
      role: row.role,
      content: row.content,
      created_at: row.created_at,
      // #1939 — sans cette ligne, la colonne lue n'atteint jamais l'écran : le
      // bouton « réécouter » n'aurait aucun message à qui s'afficher.
      voice_object_id: row.voice_object_id ?? null,
      // #1953.22 — la réponse REMPLACÉE garde sa marque : « on archive, on ne
      // supprime pas » ne tient que si la marque survit au rechargement.
      superseded_at: row.superseded_at ?? null,
      // #1953.11 — de quelle réponse celle-ci repart, et comment. `null` = elle
      // n'est la réédition de rien, jamais une branche devinée.
      branch_of_message_id: row.branch_of_message_id ?? null,
      branch_kind: row.branch_kind ?? null,
      // #1914.14 — `null` pour tout message d'AVANT la colonne : l'écran rend
      // alors la bulle sans panneau, exactement comme il le fait depuis toujours.
      context: row.context ?? null,
      // #2494 — `null` pour tout message d'AVANT la colonne, ou sans pièce
      // jointe : la bulle ne montre alors aucune puce, exactement comme avant.
      attachments: row.attachments ?? null,
      // #2876 (#2433.4) — même raison, pour l'image de conversation.
      // #2876 (décision Louis 14/10) — une image ARCHIVÉE ne rend que son
      // stub `{id, name}` : ses zones et objets mesurés ne sortent plus.
      image_attachments: stripArchivedImageVision(row.image_attachments ?? null, row.image_vision_archived_at),
      author: row.role === 'user' && row.user_id ? (authors.get(row.user_id) ?? null) : null,
    }))
  }

  /**
   * #1953.22 — ESTAMPILLER la réponse qu'on abandonne, sans jamais la toucher.
   *
   * Appelée par {@link create} au moment où la réponse d'une BRANCHE est écrite
   * — « remplacée » est un fait qui se constate quand le remplacement existe,
   * pas une intention. Elle n'écrit QU'UNE colonne : le texte, l'auteur, les
   * cartes du tour, tout reste — « on archive, on ne supprime pas ».
   *
   * Deux refus, tous deux silencieux (le message s'écrit quand même, sans
   * branche — jamais un lien vers quelque chose qu'on n'a pas lu) :
   *  · la réponse n'est pas dans l'espace de l'appelant → `null`. Les fils sont
   *    une ressource d'ÉQUIPE, jamais d'un autre espace : les espaces sont des
   *    ESN, donc des concurrents ;
   *  · elle porte déjà une heure → on garde la PREMIÈRE. Une seconde branche
   *    prise depuis la même réponse ne réécrit pas l'heure à laquelle elle a
   *    cessé d'être la dernière.
   *
   * Rend l'heure qui fait foi (celle qui vient d'être posée, ou celle d'avant),
   * ou `null` quand rien n'a été trouvé — jamais une heure inventée.
   */
  async markSuperseded(args: { workspaceId: string; messageId: string }): Promise<Date | null> {
    const target = await this.messages.findOne({
      where: { id: args.messageId, workspace_id: args.workspaceId, role: 'assistant' },
      select: ['id', 'superseded_at'],
    })
    if (!target) return null
    if (target.superseded_at) return target.superseded_at
    const supersededAt = new Date()
    await this.messages.update({ id: target.id }, { superseded_at: supersededAt })
    return supersededAt
  }

  /**
   * #2876 (décision Louis 14/10) — LE JOB NOCTURNE D'ARCHIVAGE DES ZONES
   * VISION EXPIRÉES.
   *
   * ARCHIVE, ne supprime jamais : pose `image_vision_archived_at`, jamais un
   * `UPDATE`/`DELETE` sur `image_attachments` — la ligne garde tout, seule la
   * LECTURE change ({@link stripArchivedImageVision}, via {@link listThread}).
   *
   * ⚠️ `created_at` de CE message, pas `retention_until` de l'image en
   * `storage_objects` : l'image peut déjà avoir été purgée par
   * `StorageService.purgeExpired` (même fenêtre de 30 jours) — le calcul doit
   * rester vrai même quand il n'y a plus rien à joindre.
   *
   * Idempotent : `image_vision_archived_at IS NULL` exclut tout ce qui a déjà
   * été archivé, donc un second passage sur la même fenêtre n'en reprend
   * aucun. Borné par passage, comme les autres balayages du dépôt
   * (`StorageService.purgeExpired`) — aucune instruction de ce dépôt n'est une
   * suppression de masse, et ici rien n'est même supprimé.
   */
  async archiveExpiredImageVision(today: string, limit: number): Promise<{ archived: number }> {
    const result: unknown = await this.messages.manager.query(
      `UPDATE chat_messages
          SET image_vision_archived_at = now()
        WHERE id IN (
          SELECT id FROM chat_messages
           WHERE image_vision_archived_at IS NULL
             AND image_attachments IS NOT NULL
             AND (created_at::date + ($2::int * interval '1 day')) < $1::date
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(image_attachments) elem
                WHERE elem ? 'regions' OR elem ? 'objects'
             )
           ORDER BY created_at
           LIMIT $3
        )
        RETURNING id`,
      [today, CHAT_IMAGE_VISION_RETENTION_DAYS, limit],
    )
    return { archived: returnedCount(result) }
  }

  /**
   * Ce que CET utilisateur a envoyé depuis `since` — la mesure du plafond
   * quotidien du copilote, en deux nombres.
   *
   * `total` : ses messages, pas les réponses de Laura — un échange = un appel
   * modèle, et c'est l'appel qu'on borne. `exempt` : ceux d'entre eux qui
   * répondaient à une question de précision de Laura, donc ceux que le plafond
   * ne compte pas (décision Louis 30/08 : « le plafond borne les DEMANDES, pas
   * les allers-retours que Laura provoque elle-même »).
   *
   * Les DEUX sont bornés par `user_id`, sans exception : le plafond protège la
   * marge d'un siège, il ne fait pas payer à un commercial l'usage de son
   * collègue — et une exonération qui traverserait l'espace en ferait payer un
   * autre.
   *
   * ⚠️ Rendre les deux nombres SÉPARÉS, et non un solde déjà fait, est
   * délibéré : la soustraction et son plafond vivent à un seul endroit
   * (`countableMessages`), et un `exempt` illisible ne peut pas s'y déguiser en
   * « rien consommé ».
   */
  async measureUserMessagesSince(userId: string, since: Date): Promise<{ total: number; exempt: number }> {
    const scope = { user_id: userId, role: 'user' as const, created_at: MoreThanOrEqual(since) }
    const [total, exempt] = await Promise.all([
      this.messages.count({ where: scope }),
      this.messages.count({ where: { ...scope, quota_exempt_at: Not(IsNull()) } }),
    ])
    return { total, exempt }
  }

  /**
   * #1957.8 — les HORODATAGES de ce que CET utilisateur a envoyé depuis `since`,
   * du plus ancien au plus récent, avec leur exonération : de quoi calculer
   * l'instant où le plafond se rouvre (`quotaReopensAt`).
   *
   * Même cloisonnement que {@link measureUserMessagesSince} — `user_id`, jamais
   * l'espace. Lue au seul moment où elle sert : quand il ne reste rien.
   *
   * ⚠️ Rend `null` quand la lecture est TRONQUÉE. Au plafond, une personne a au
   * plus quelques dizaines de demandes sur 24 h ; `POST /ia/chat/messages`
   * n'étant pas borné, un volume anormal reste possible — et un instant calculé
   * sur une partie des lignes serait faux, pas approximatif.
   */
  async userMessageStampsSince(userId: string, since: Date): Promise<Array<{ at: Date; exempt: boolean }> | null> {
    const rows = await this.messages.find({
      where: { user_id: userId, role: 'user' as const, created_at: MoreThanOrEqual(since) },
      select: ['created_at', 'quota_exempt_at'],
      order: { created_at: 'ASC' },
      take: QUOTA_STAMPS_READ_LIMIT,
    })
    if (rows.length >= QUOTA_STAMPS_READ_LIMIT) return null
    return rows.map(row => ({ at: new Date(row.created_at), exempt: row.quota_exempt_at != null }))
  }

  /**
   * Laura vient de répondre à une demande par une QUESTION DE PRÉCISION :
   * estampiller le message qui l'a provoquée.
   *
   * ⚠️ C'est le marquage à la SOURCE, et c'est tout l'enjeu du mécanisme.
   * L'appelant ne le déclenche que sur `context.clarification` — c'est-à-dire
   * quand le modèle a appelé `ask_clarification`, seul endroit du produit où
   * « Laura demande » est un fait machine. L'alternative — relire la réponse
   * précédente et y chercher un point d'interrogation — exonérerait aussi ses
   * propositions (« Tu veux analyser quelques comptes ? », `fr/laura.json`),
   * c'est-à-dire à peu près tout.
   *
   * Rend `false` quand il n'y a rien à marquer : fil vide, ou message déjà
   * marqué (une deuxième question sur le MÊME message ne rouvre pas un
   * deuxième saut).
   */
  async markPrecisionRequest(target: ThreadTarget): Promise<boolean> {
    const latest = await this.latestUserMessage(target)
    if (!latest || latest.precision_request_at) return false
    const result = await this.messages.update({ id: latest.id }, { precision_request_at: new Date() })
    return (result.affected ?? 0) > 0
  }

  /**
   * #1953.19 — LE TOUR N'A RIEN RENDU : SA DEMANDE NE SE COMPTE PAS — tranché
   * Louis 16/09/2026, « non facturé si le modèle n'a rien rendu ».
   *
   * Ce qu'un tour de copilote consomme n'est pas un crédit — il n'en débite
   * aucun et n'en réserve aucun — mais UNE DEMANDE du plafond quotidien (« le
   * plafond borne les DEMANDES », décision Louis 30/08). Un flux qui casse
   * consommait donc une demande pour rien, et la relance en consommait une
   * seconde : la même question payée deux fois, sur une seule réponse reçue.
   *
   * ⚠️ C'est une RÉGULARISATION, pas un second compteur : elle pose le même
   * `quota_exempt_at` que le saut de précision, sur le même message, et la
   * soustraction reste la seule qui existe (`countableMessages`). Deux façons
   * d'exonérer une demande divergeraient.
   *
   * La frontière est celle des timeouts, et elle ne se re-litige pas : la
   * requête a-t-elle pu RENDRE quelque chose ? L'APPELANT la tranche (le tour
   * a-t-il produit une réponse lisible ?) ; ici on ne fait qu'écrire. Un message
   * DÉJÀ exonéré n'est pas ré-exonéré — ce n'est pas une anomalie, c'est le cas
   * normal d'une relance sur une question de précision.
   */
  async releaseQuotaForUnrenderedTurn(target: ThreadTarget & { turnStartedAt?: Date }): Promise<boolean> {
    const latest = await this.latestUserMessage(target)
    // #4540 (garde #2650.2) — SYNCHRONE : le navigateur n'écrit la question qu'APRÈS l'acceptation du tour,
    // donc elle peut ne pas exister encore quand le flux casse. `latest` est alors la question D'AVANT (ou
    // rien, au premier tour d'un fil) : l'exonérer ferait payer la question échouée et offrirait la
    // précédente. Un message né avant ce tour n'est jamais touché ; l'exonération attend sa naissance.
    const bornThisTurn = !target.turnStartedAt || (latest && latest.created_at >= target.turnStartedAt)
    if (!latest || !bornThisTurn) {
      if (target.turnStartedAt) this.rememberPendingRelease(target)
      return false
    }
    if (latest.quota_exempt_at) return false
    const result = await this.messages.update({ id: latest.id }, { quota_exempt_at: new Date() })
    return (result.affected ?? 0) > 0
  }

  /**
   * #4540 — les questions dont le tour a échoué AVANT d'être écrites : à leur création, elles naissent
   * exonérées (une seule fois, pour CE fil et CET utilisateur, pendant `PENDING_RELEASE_TTL_MS`).
   * En mémoire du processus : au pire un redémarrage entre l'échec et l'écriture (quelques secondes)
   * laisse la demande comptée — jamais l'inverse, jamais l'exonération d'un autre message.
   */
  private readonly pendingReleases = new Map<string, number>()

  private pendingReleaseKey(target: ThreadTarget): string {
    return [target.userId, target.workspaceId, target.accountId ?? '', target.conversationId ?? ''].join('|')
  }

  private rememberPendingRelease(target: ThreadTarget): void {
    const now = Date.now()
    for (const [key, expiresAt] of this.pendingReleases) if (expiresAt <= now) this.pendingReleases.delete(key)
    this.pendingReleases.set(this.pendingReleaseKey(target), now + PENDING_RELEASE_TTL_MS)
  }

  /** Vrai une seule fois par échec retenu : la question qui naît maintenant est celle du tour échoué. */
  private takePendingRelease(target: ThreadTarget): boolean {
    const key = this.pendingReleaseKey(target)
    const expiresAt = this.pendingReleases.get(key)
    if (expiresAt === undefined) return false
    this.pendingReleases.delete(key)
    return expiresAt > Date.now()
  }

  async create(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    role: ChatMessageRole
    content: string
    /** #1943.1 — le tour annoncé par le `done` (`turn_id`). Absent = `null`, comme tout l'existant. */
    turnId?: string | null
    /**
     * #1939.13 — l'enregistrement d'un message VOCAL, rendu par
     * `POST /ia/chat/voice/transcribe`. Ajouté EN FIN, optionnel : un message tapé
     * ne change en rien. Vérifié AVANT l'écriture ({@link resolveOwnVoiceObject}).
     */
    voiceObjectId?: string | null
    /**
     * #1953.11 — la réponse dont CELLE-CI repart, et la nature de la branche.
     * Absents = message ordinaire, qui n'est la réédition de rien. Le lien n'est
     * écrit que s'il DÉSIGNE une réponse du même espace ({@link resolveBranchOf}) :
     * un identifiant venu du navigateur ne pointe jamais le fil d'une autre ESN.
     */
    branchOfMessageId?: string | null
    branchKind?: ChatBranchKind | null
    /**
     * #1914.14 — le CONTEXTE du tour, tel que l'écran le reçoit. Réduit ICI à la
     * liste blanche (`persistedChatContext`) : c'est la SEULE porte d'écriture,
     * donc le seul endroit où la règle doive tenir. Absent = `null`, l'appel est
     * alors byte-identique à celui d'avant ce lot.
     */
    context?: unknown
    /**
     * #2494 — les documents ENVOYÉS avec ce message (identifiants
     * `rag_documents`), tels que le navigateur les désigne. RETROUVÉS dans
     * l'espace de l'appelant avant écriture ({@link resolveAttachments}) — un
     * identifiant qui ne désigne rien ici n'écrit aucune pièce.
     */
    documentIds?: string[] | null
    /**
     * #2876 (#2433.4) — les images de CONVERSATION ENVOYÉES avec ce message
     * (identifiants `storage_objects`, domaine `chat_image_attachment`), telles
     * que le navigateur les désigne. RETROUVÉES dans l'espace de l'appelant
     * avant écriture ({@link resolveImageAttachments}) — un identifiant qui ne
     * désigne rien ici n'écrit aucune image.
     */
    imageObjectIds?: string[] | null
    /**
     * #2433.4 / #2433.12 (lot W8) — les zones et objets MESURÉS sur ces images
     * (par `id`). Relus et validés ici ({@link persistableImageVision}) ; la vision
     * d'un `id` que {@link resolveImageAttachments} n'a pas retrouvé n'est écrite nulle part.
     */
    imageVision?: { id: string; regions?: unknown; objects?: unknown }[] | null
  }): Promise<ChatMessageSummary> {
    const voiceObjectId = await this.resolveOwnVoiceObject(args)
    const branchOfMessageId = await this.linkBranchOf(args)
    const attachments = await this.resolveAttachments(args)
    const imageAttachments = await this.resolveImageAttachments(args)
    const message = this.messages.create({
      user_id: args.userId,
      workspace_id: args.workspaceId,
      account_id: args.accountId,
      conversation_id: args.conversationId,
      role: args.role,
      content: args.content,
      quota_exempt_at:
        (args.role === 'user' && this.takePendingRelease(args) ? new Date() : null) ??
        (await this.resolvePrecisionHop(args)),
      turn_id: args.turnId ?? null,
      voice_object_id: voiceObjectId,
      // #1953.11 — la branche dont ce message repart. `null` = aucune, l'état de
      // tout message tapé normalement.
      branch_of_message_id: branchOfMessageId,
      branch_kind: branchOfMessageId ? (args.branchKind ?? null) : null,
      // #1914.14 — la liste blanche s'applique ICI, jamais chez l'appelant : un
      // contexte illisible ou trop lourd vaut `null` et le message part quand
      // même. Un panneau manqué ne fait pas perdre une réponse.
      context: persistedChatContext(args.context),
      // #2494 — `null` sans document ENVOYÉ, ou si aucun ne désigne un document
      // de cet espace : chemin byte-identique à celui d'avant ce lot.
      attachments,
      // #2876 (#2433.4) — même discipline, pour l'image de conversation.
      image_attachments: imageAttachments,
    })
    const saved = await this.messages.save(message)
    return {
      id: saved.id,
      account_id: saved.account_id,
      conversation_id: saved.conversation_id,
      role: saved.role,
      content: saved.content,
      created_at: saved.created_at,
      voice_object_id: saved.voice_object_id ?? null,
      superseded_at: saved.superseded_at ?? null,
      branch_of_message_id: saved.branch_of_message_id ?? null,
      branch_kind: saved.branch_kind ?? null,
      // #1914.14 — la réponse rend ce qui a VRAIMENT été gardé, jamais ce que
      // l'appelant a envoyé : l'écran ne doit pas croire persisté un panneau que
      // la liste blanche a refusé.
      context: saved.context ?? null,
      // #2494 — la réponse rend ce qui a VRAIMENT été écrit, jamais ce que le
      // navigateur a envoyé : un identifiant refusé (autre espace) ne doit pas
      // faire croire une pièce jointe qui n'a pas été gardée.
      attachments: saved.attachments ?? null,
      // #2876 (#2433.4) — même discipline, pour l'image de conversation.
      image_attachments: saved.image_attachments ?? null,
    }
  }

  /**
   * #2494 — les pièces jointes d'un message, RETROUVÉES puis ÉCRITES.
   *
   * Même discipline que {@link resolveOwnVoiceObject} et {@link linkBranchOf} :
   * l'identifiant vient du navigateur, il ne rend un NOM qu'après avoir été
   * retrouvé dans l'espace de l'appelant — jamais le nom que le navigateur a
   * proposé, qui pourrait désigner un document d'un autre espace ou avoir été
   * modifié en route. `null` : aucun identifiant envoyé, dépôt introuvable
   * (`@Optional()` non câblé), ou aucun ne désigne un document de CET espace —
   * chemin byte-identique à celui d'avant ce lot.
   */
  private async resolveAttachments(args: {
    workspaceId: string
    documentIds?: string[] | null
  }): Promise<{ id: string; name: string }[] | null> {
    const ids = (args.documentIds ?? []).filter(Boolean)
    if (ids.length === 0 || !this.docs) return null
    const rows = await this.docs.find({
      where: { id: In(ids), workspace_id: args.workspaceId },
      select: ['id', 'title'],
    })
    const attachments = rows
      .filter((row): row is RagDocumentEntity & { title: string } => Boolean(row.title))
      .map(row => ({ id: row.id, name: row.title }))
    return attachments.length > 0 ? attachments : null
  }

  /**
   * #2876 (#2433.4) — les IMAGES de conversation d'un message, RETROUVÉES puis
   * ÉCRITES.
   *
   * Même discipline que {@link resolveAttachments} : l'identifiant vient du
   * navigateur, il ne rend un NOM qu'après avoir été retrouvé — ici dans
   * `storage_objects`, au domaine `chat_image_attachment` (#2876), et jamais
   * pour quelqu'un d'autre que l'appelant (même portée que
   * {@link resolveOwnVoiceObject}, une image de conversation posée pendant la
   * composition d'UN message n'a pas vocation à en rattacher un autre). `null` :
   * aucun identifiant envoyé, ou aucun ne désigne une image de CET appelant
   * dans CET espace — chemin byte-identique à celui d'avant ce lot.
   */
  private async resolveImageAttachments(args: {
    workspaceId: string
    userId: string
    imageObjectIds?: string[] | null
    imageVision?: { id: string; regions?: unknown; objects?: unknown }[] | null
  }): Promise<PersistedChatImage[] | null> {
    const ids = (args.imageObjectIds ?? []).filter(Boolean)
    if (ids.length === 0) return null
    const rows = await this.messages.manager.query<{ id: string; file_name: string }[]>(
      `SELECT id, file_name FROM storage_objects WHERE id = ANY($1) AND workspace_id = $2 AND uploaded_by = $3 AND domain = 'chat_image_attachment'`,
      [ids, args.workspaceId, args.userId],
    )
    const attachments = (Array.isArray(rows) ? rows : [])
      .filter((row): row is { id: string; file_name: string } => Boolean(row.file_name))
      // #2433.4 / #2433.12 — la vision voyage avec l'image RETROUVÉE, jamais seule.
      .map(row => ({
        id: row.id,
        name: row.file_name,
        ...persistableImageVision(args.imageVision?.find(vision => vision.id === row.id) ?? {}),
      }))
    return attachments.length > 0 ? attachments : null
  }

  /**
   * #1953.11 — la réponse dont une branche repart, VÉRIFIÉE PUIS ESTAMPILLÉE.
   *
   * Même discipline que {@link resolveOwnVoiceObject} : l'identifiant vient du
   * navigateur, il ne s'écrit qu'après avoir été retrouvé dans l'espace de
   * l'appelant. Introuvable (autre espace, message effacé, fil dupliqué) →
   * `null` : le message s'écrit sans branche plutôt que de désigner quelque
   * chose qu'on n'a pas lu. Aucune branche demandée → `null` sans requête,
   * chemin byte-identique à celui d'avant ce lot.
   *
   * Les deux gestes sont ICI et pas à deux endroits : « cette réponse repart de
   * celle-là » et « celle-là a été remplacée » sont les deux faces du MÊME
   * fait. Deux chemins qui le poseraient séparément divergeraient le jour où
   * l'un échoue — et l'écran afficherait une réédition sans original remplacé,
   * ou l'inverse.
   */
  private async linkBranchOf(args: {
    workspaceId: string
    branchOfMessageId?: string | null
    branchKind?: ChatBranchKind | null
  }): Promise<string | null> {
    if (!args.branchOfMessageId || !args.branchKind) return null
    const stamped = await this.markSuperseded({
      workspaceId: args.workspaceId,
      messageId: args.branchOfMessageId,
    })
    return stamped ? args.branchOfMessageId : null
  }

  /**
   * #1955.8 — « Un fil dupliqué apparaîtra comme un nouveau fil indépendant. »
   *
   * Copie chaque message sous une `conversation_id` NEUVE (`randomUUID`, le
   * même format que celui posé côté navigateur, `newConversationId`) : rien de
   * partagé avec l'original — l'archiver, le renommer, le supprimer ou lui
   * écrire ensuite ne touche jamais l'autre.
   *
   * L'auteur HUMAIN voyage (qui a posé la question reste vrai dans la copie) ;
   * une réponse de Laura n'en porte jamais. `archived_at`, `precision_request_at`,
   * `quota_exempt_at`, `turn_id` et `voice_object_id` repartent à `null` : ce
   * sont l'état d'un ÉCHANGE EN COURS (un saut de précision, un tour corrélé,
   * un enregistrement conservé), pas un fait qui se recopie avec le texte.
   * `null` retourné quand le fil source n'existe pas dans cet espace.
   */
  async duplicateThread(args: {
    /** #2703 — le fil par défaut qu'on duplique est CELUI DE L'APPELANT, jamais celui d'un collègue. */
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): Promise<{ conversationId: string; accountId: string | null; messages: number } | null> {
    const rows = await this.messages.find({
      where: this.threadWhere(args.workspaceId, args.accountId, args.conversationId, args.userId),
      order: { created_at: 'ASC' },
    })
    if (rows.length === 0) return null

    const newConversationId = randomUUID()
    // Toutes « maintenant » (à la milliseconde près, pour garder l'ORDRE des
    // messages) : le fil dupliqué vient d'être créé, il doit apparaître en
    // tête de liste — pas enterré à la date du fil d'origine.
    const base = Date.now()
    const copies = rows.map((row, index) =>
      this.messages.create({
        workspace_id: args.workspaceId,
        account_id: row.account_id,
        conversation_id: newConversationId,
        role: row.role,
        content: row.content,
        user_id: row.role === 'user' ? row.user_id : null,
        // #1914.14 — le contexte voyage AVEC le texte : il dit d'où vient CETTE
        // réponse, ce qui reste vrai dans la copie. Ce n'est pas l'état d'un
        // échange en cours, contrairement aux champs remis à `null` ci-dessus.
        context: row.context ?? null,
        created_at: new Date(base + index),
      }),
    )
    await this.messages.save(copies)
    return { conversationId: newConversationId, accountId: rows[0]?.account_id ?? null, messages: copies.length }
  }

  /**
   * Les fils du workspace, un par `conversation_id` — la source de la liste
   * « Conversations » du copilote, qui en groupe désormais PLUSIEURS par compte.
   *
   * Deux dates par fil, et elles ne servent pas à la même chose :
   *  - `created_at` = son premier message, donc son TITRE (une question
   *    d'ouverture ne bouge plus ; titrer par le dernier message renommait le
   *    fil à chaque échange) ;
   *  - `last_message_at` = sa dernière activité, donc son RANG dans la liste.
   * D'où le `DISTINCT ON` qui garde la première ligne (ORDER BY … ASC) pendant
   * qu'une fenêtre `MAX(…) OVER (PARTITION BY …)` — évaluée AVANT le DISTINCT —
   * ramène le maximum de la partition sur cette même ligne.
   */
  async listHistory(
    workspaceId: string,
    /** #2703 — QUI lit : ses fils par défaut, plus les conversations nommées de l'espace. */
    readerUserId: string,
    limit: number,
    archived = false,
  ): Promise<ChatHistoryItem[]> {
    const threads = this.threadsBaseQuery(workspaceId, readerUserId, archived)

    // #1901.12 — vérification 13/09 : LE RANG AVANT LA COUPE. `DISTINCT ON` impose
    // que son ORDER BY commence par la clé de fil — un UUID, donc un ordre sans
    // rapport avec le temps. La coupe à `limit` était posée à CE niveau : elle
    // gardait les N plus petites clés, et le tri par récence (en mémoire) n'arrivait
    // qu'après. Au-delà de 20 fils, celui qu'on venait d'écrire pouvait disparaître
    // de la colonne. La requête des fils est désormais ENVELOPPÉE : c'est la
    // requête extérieure qui range par dernière activité, PUIS coupe.
    const rows = await this.messages.manager
      .createQueryBuilder()
      .select('thread.*')
      .from(`(${threads.getQuery()})`, 'thread')
      .setParameters(threads.getParameters())
      .orderBy('thread.last_message_at', 'DESC')
      .limit(limit)
      .getRawMany<{
        id: string
        user_id: string | null
        account_id: string | null
        conversation_id: string | null
        content: string
        created_at: Date
        last_message_at: Date | null
      }>()

    // #1911.4 — l'auteur principal de chaque fil ; #1911.10 — le nom de son
    // compte. Les deux résolus dans l'espace LU, en parallèle, et chacun rend une
    // carte vide plutôt que de faire tomber la liste.
    const [authors, accountNames, lastRoles] = await Promise.all([
      resolveChatAuthors(
        this.messages.manager,
        workspaceId,
        rows.map(row => row.user_id),
      ),
      resolveThreadAccountNames(
        this.messages.manager,
        workspaceId,
        rows.map(row => row.account_id),
      ),
      // #1911.5 — qui a parlé en DERNIER dans chacun de ces fils.
      this.resolveLastMessageRoles(workspaceId, rows),
    ])
    // #1901.12 — le RANG des fils vit dans la requête extérieure, AVANT la coupe.
    // Le tri par récence EN MÉMOIRE que portait ce lot est exactement la
    // dérivation qu'elle remplace : deux chemins qui la refont divergent.
    return rows.map(row => ({
      id: row.id,
      account_id: row.account_id,
      conversation_id: row.conversation_id,
      title: row.content,
      created_at: row.created_at,
      // Une base qui ne remonterait pas la fenêtre ne doit pas produire un fil
      // sans date : l'ouverture est alors la seule activité connue.
      last_message_at: row.last_message_at ?? row.created_at,
      author: row.user_id ? (authors.get(row.user_id) ?? null) : null,
      account_name: row.account_id ? (accountNames.get(row.account_id) ?? null) : null,
      last_message_role: lastRoles.get(threadKeyOfRow(row)) ?? null,
    }))
  }

  /**
   * #1911.5 — LE RÔLE DU DERNIER MESSAGE DE CHAQUE FIL.
   *
   * Requête séparée, et elle ne pouvait pas ne pas l'être : `threadsBaseQuery`
   * filtre `role = 'user'`, donc TOUT ce qu'elle calcule — la fenêtre
   * `MAX(created_at)` comprise — ne voit jamais une réponse de Laura. Y ajouter
   * une colonne aurait rendu `'user'` pour tous les fils du monde : un prédicat
   * comparé à une valeur que la requête ne produit pas, toujours vrai, invisible
   * aux tests dont les fixtures inventent la donnée.
   *
   * Une lecture qui échoue rend une carte VIDE : la liste s'affiche sans
   * statuts plutôt que de ne pas s'afficher — et un fil sans rôle connu
   * n'affiche AUCUN statut, jamais un statut deviné.
   */
  private async resolveLastMessageRoles(
    workspaceId: string,
    rows: ReadonlyArray<{ id: string; conversation_id: string | null }>,
  ): Promise<Map<string, ChatMessageRole>> {
    const byThread = new Map<string, ChatMessageRole>()
    const keys = [...new Set(rows.map(threadKeyOfRow))]
    if (keys.length === 0) return byThread

    try {
      const found = await this.messages.manager.query(LAST_MESSAGE_ROLE_SQL, [workspaceId, keys])
      for (const row of (found as { threadKey: string | null; role: string | null }[] | null) ?? []) {
        if (!row?.threadKey) continue
        // #1911.5 — un rôle que le produit ne connaît PAS est écarté, pas rendu.
        // Le champ est typé `ChatMessageRole | null` jusqu'à l'écran ; laisser
        // passer une troisième valeur la ferait voyager comme un fait, et
        // l'écran chercherait un libellé de statut qui n'existe pas. « Écarté »
        // vaut `null`, donc AUCUNE pastille — « non mesuré », jamais deviné.
        if (row.role !== 'user' && row.role !== 'assistant') continue
        byThread.set(row.threadKey, row.role)
      }
    } catch (error) {
      // Le NOM de l'erreur seulement : un message SQL peut recopier des valeurs liées.
      this.logger.warn(
        `Rôle du dernier message illisible, la liste est rendue sans statuts (${error instanceof Error ? error.name : typeof error})`,
      )
    }
    return byThread
  }

  /**
   * La requête des FILS eux-mêmes — un par `conversation_id` — sans tri ni
   * coupe : `listHistory` l'enveloppe pour classer par récence et couper à
   * `limit`, `searchThreads` (#1955.2) pour la parcourir en entier avant de
   * filtrer. Extraite pour que les deux lisent la MÊME requête — deux copies
   * du `COALESCE`/`DISTINCT ON` divergeraient au premier correctif.
   */
  private threadsBaseQuery(workspaceId: string, readerUserId: string, archived: boolean) {
    // `conversation_id` est TEXT (migration 1786600000000), `id` est UUID :
    // COALESCE(text, uuid) est rejeté par Postgres et faisait 500 cet endpoint.
    // On aligne les deux types en castant l'id en texte, ici ET dans le ORDER BY
    // (DISTINCT ON exige que l'expression matche le premier ORDER BY).
    const threadKey = 'COALESCE(message.conversation_id, message.id::text)'
    return (
      this.messages
        .createQueryBuilder('message')
        .distinctOn([threadKey])
        .select([
          'message.id AS id',
          // #1911.4 — la ligne gardée est le PREMIER message utilisateur du fil :
          // son auteur est celui qui a ouvert le fil.
          'message.user_id AS user_id',
          'message.account_id AS account_id',
          'message.conversation_id AS conversation_id',
          'message.content AS content',
          'message.created_at AS created_at',
          `MAX(message.created_at) OVER (PARTITION BY ${threadKey}) AS last_message_at`,
        ])
        .where('message.workspace_id = :workspaceId', { workspaceId })
        .andWhere('message.role = :role', { role: 'user' })
        // #2703 — LA LISTE DES FILS SUIT LA MÊME LIGNE DE PARTAGE QUE `threadWhere`.
        // Une conversation NOMMÉE appartient à l'espace : elle est listée quel
        // que soit son auteur. Un fil par DÉFAUT appartient à son auteur : il
        // n'apparaît QUE chez lui — sans cette borne, la colonne de gauche
        // remettait sous les yeux de chacun les brouillons de l'autre, ce que
        // le fil lui-même ne fait plus.
        .andWhere('(message.conversation_id IS NOT NULL OR message.user_id = :readerUserId)', { readerUserId })
        // #1120 — un fil rangé sort de la liste. `archived` le rouvre : ranger
        // n'est pas supprimer, et un tiroir dont on ne peut pas ouvrir le fond
        // n'est pas un tiroir.
        .andWhere(archived ? 'message.archived_at IS NOT NULL' : 'message.archived_at IS NULL')
        .orderBy(threadKey, 'ASC')
        .addOrderBy('message.created_at', 'ASC')
    )
  }

  /**
   * #1955.2 — LA RECHERCHE PORTE SUR TOUT L'HISTORIQUE, pas seulement la page
   * chargée.
   *
   * `filterThreads` (web, `conversation.ts`) ne voit que les fils déjà rendus
   * par `GET chat/history` (20 par défaut) : chercher « PAYFIT » ne trouvait
   * rien sur le 21e fil. Cette route parcourt jusqu'à `THREAD_SEARCH_SCAN_LIMIT`
   * fils — classés par récence, comme `listHistory` — PUIS filtre, sur le MÊME
   * triplet que l'écran (titre, nom du compte, prénom de l'auteur), replié sur
   * la casse et les accents. Au-delà de la borne de lecture, une recherche ne
   * VOIT plus les fils les plus anciens — c'est une lecture TRONQUÉE, jamais une
   * absence de résultat rendue comme si le fil n'existait pas.
   */
  async searchThreads(
    workspaceId: string,
    /** #2703 — même périmètre que {@link listHistory} : on ne cherche pas dans le fil d'un collègue. */
    readerUserId: string,
    query: string,
    limit: number,
    archived = false,
  ): Promise<ChatHistoryItem[]> {
    const threads = this.threadsBaseQuery(workspaceId, readerUserId, archived)
    const rows = await this.messages.manager
      .createQueryBuilder()
      .select('thread.*')
      .from(`(${threads.getQuery()})`, 'thread')
      .setParameters(threads.getParameters())
      .orderBy('thread.last_message_at', 'DESC')
      .limit(THREAD_SEARCH_SCAN_LIMIT)
      .getRawMany<{
        id: string
        user_id: string | null
        account_id: string | null
        conversation_id: string | null
        content: string
        created_at: Date
        last_message_at: Date | null
      }>()

    const [authors, accountNames, lastRoles] = await Promise.all([
      resolveChatAuthors(
        this.messages.manager,
        workspaceId,
        rows.map(row => row.user_id),
      ),
      resolveThreadAccountNames(
        this.messages.manager,
        workspaceId,
        rows.map(row => row.account_id),
      ),
      // #1911.5 — la recherche rend les MÊMES fils que la liste : elle porte
      // donc le même statut. Un fil trouvé par la recherche et affiché sans
      // statut à côté du même fil affiché avec en serait deux objets.
      this.resolveLastMessageRoles(workspaceId, rows),
    ])

    const items = rows.map(row => ({
      id: row.id,
      account_id: row.account_id,
      conversation_id: row.conversation_id,
      title: row.content,
      created_at: row.created_at,
      last_message_at: row.last_message_at ?? row.created_at,
      author: row.user_id ? (authors.get(row.user_id) ?? null) : null,
      account_name: row.account_id ? (accountNames.get(row.account_id) ?? null) : null,
      last_message_role: lastRoles.get(threadKeyOfRow(row)) ?? null,
    }))

    const needle = foldSearchText(query)
    if (!needle) return items.slice(0, limit)
    return items
      .filter(item =>
        foldSearchText([item.title, item.account_name ?? '', item.author?.firstName ?? ''].join(' ')).includes(needle),
      )
      .slice(0, limit)
  }

  /**
   * Ranger un fil, ou le ressortir (#1120).
   *
   * « Faudrait pouvoir archiver ou supprimer les conversations. Là j'ai fait un
   * test et ça me le ressort direct alors qu'en vrai je m'en fiche un peu. »
   *
   * L'estampille est posée sur TOUS les messages du fil : il n'existe pas de
   * table de fils, un fil EST sa clé et ses lignes. Rend le nombre de messages
   * touchés — zéro veut dire « ce fil n'existe pas dans cet espace », et
   * l'appelant en fait un refus explicite plutôt qu'un succès qui n'a rien fait.
   */
  async setThreadArchived(args: {
    /** #2703 — on range SON fil par défaut, jamais celui d'un collègue du même espace. */
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    archived: boolean
  }): Promise<number> {
    const result = await this.messages.update(
      this.threadWhere(args.workspaceId, args.accountId, args.conversationId, args.userId),
      {
        archived_at: args.archived ? new Date() : null,
      },
    )
    return result.affected ?? 0
  }

  // #2430.9 — une conversation s'archive, elle ne disparaît pas
  /**
   * #2430.9 — « Supprimer » un fil ARCHIVE désormais, il ne disparaît pas.
   *
   * Jusqu'au 20/09/2026, cette méthode faisait un DELETE SQL : les messages
   * disparaissaient pour de bon, sans trace — contre la doctrine du dépôt
   * (« on archive, on ne supprime pas »). L'ancienne justification (« ce sont
   * les mots de quelqu'un, pouvoir les retirer est un droit ») tenait pour le
   * retrait de la VUE, pas pour leur destruction : décision de Louis du 20/09
   * (QCM), ce geste réutilise `setThreadArchived` (#1120), le mécanisme
   * d'archivage EXISTANT — même estampille `archived_at`, même clé de fil
   * (GA-26 : pas un second mécanisme).
   *
   * Le nom `deleteThread` reste : c'est le nom du geste appelant côté route
   * (`ia-proxy.controller.ts`, `deleteChatThread` — bouton « Retirer »/« Remove »
   * côté écran, `sidebarThreads.delete`), pas une promesse de ce qui se passe
   * en base. Une conversation n'est le parent de RIEN (aucun objet métier ne
   * s'y accroche) ; ranger ses messages ne fait donc disparaître ni contacts,
   * ni projets, ni facturation. Ce qui avait de la valeur dans le fil reste,
   * de toute façon, doublement disponible : « Sauvegarder cette réponse » l'a
   * déjà sorti vers la mémoire longue, qui vit dans une autre table et survit.
   *
   * ⚠️ N'EST PAS le chemin RGPD (`c69`, `doctrine-registry.ts`) : l'effacement
   * d'une PERSONNE prospectée à sa demande supprime réellement, ailleurs.
   */
  async deleteThread(args: {
    /** #2703 — comme {@link setThreadArchived} : le fil par défaut visé est celui de l'appelant. */
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
  }): Promise<number> {
    return this.setThreadArchived({ ...args, archived: true })
  }

  /**
   * #1911.15 — QUI a OUVERT ce fil : le `user_id` de son PREMIER message
   * 'user', même repère que `listHistory` (#1911.4 — « la ligne gardée est le
   * premier message utilisateur du fil : son auteur est celui qui a ouvert le
   * fil »). Sert la décision « auteur du fil OU gérant de l'espace » de la
   * suppression (`ia-proxy.controller.ts`, `deleteChatThread`) — jamais une
   * lecture par `workspace_id` seul, la faille qu'elle corrige.
   *
   * `null` : aucun message 'user' dans cet espace (le fil n'existe pas ici),
   * OU le compte de l'ouvreur a été supprimé (`user_id` devenu `NULL` par
   * anonymisation RGPD) — dans les deux cas, personne à comparer à l'appelant,
   * donc seul un gérant de l'espace peut agir.
   */
  async threadAuthor(target: ThreadTarget): Promise<string | null> {
    const row = await this.messages.findOne({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        role: 'user',
      },
      select: ['user_id'],
      order: { created_at: 'ASC' },
    })
    return row?.user_id ?? null
  }

  /**
   * #1911.12 — ce fil existe-t-il DANS CET ESPACE ? Même désignation que
   * l'archivage et la suppression (`threadWhere`) : un fil est sa clé et ses
   * lignes, donc il existe s'il y porte au moins un message.
   */
  async threadExists(target: ThreadTarget): Promise<boolean> {
    const count = await this.messages.count({
      where: this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
    })
    return count > 0
  }

  /**
   * #2430.2 — ce message appartient-il à CE fil, dans cet espace ? Ce que la
   * branche vérifie avant de noter d'où elle repart : jamais un lien vers une
   * réponse d'un autre fil ou d'un autre espace.
   */
  async messageInThread(target: ThreadTarget, messageId: string): Promise<boolean> {
    const count = await this.messages.count({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        id: messageId,
      },
    })
    return count > 0
  }

  /**
   * #1955.12 — les comptes que les messages de ce fil CITENT (leur portée),
   * dédoublonnés. Borné comme le reste du fil (`threadWhere`) et en nombre de
   * lignes lues : un fil ne change de compte qu'une poignée de fois.
   */
  async threadAccountIds(target: ThreadTarget): Promise<string[]> {
    const rows = await this.messages.find({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        account_id: Not(IsNull()),
      },
      select: ['account_id'],
      take: 500,
    })
    return [...new Set(rows.map(row => row.account_id).filter((id): id is string => id !== null))]
  }

  /**
   * #2430.4 — le DERNIER message du fil, ce qu'une version figée borne. Une
   * réponse remplacée (`superseded_at`) n'est pas la dernière lue à l'écran :
   * elle ne borne pas.
   */
  async lastThreadMessage(target: ThreadTarget): Promise<Pick<ChatMessageEntity, 'id' | 'created_at'> | null> {
    return this.messages.findOne({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        superseded_at: IsNull(),
      },
      select: ['id', 'created_at'],
      order: { created_at: 'DESC' },
    })
  }

  /**
   * #1911.1 — combien de questions et de réponses porte ce fil. C'est ce qui
   * décide qu'un fil en est à son 2e échange, donc qu'il est temps de le titrer.
   * Tout le fil, tous auteurs confondus : les fils sont une ressource d'équipe.
   */
  async exchangeCounts(target: ThreadTarget): Promise<{ user: number; assistant: number }> {
    const where = this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId)
    const [user, assistant] = await Promise.all([
      this.messages.count({ where: { ...where, role: 'user' } }),
      this.messages.count({ where: { ...where, role: 'assistant' } }),
    ])
    return { user, assistant }
  }

  /**
   * #1911.1 — l'OUVERTURE d'un fil, dans l'ordre : ce qui part au modèle pour le
   * titrer. Le début et non la fin, parce que c'est la question d'ouverture qui
   * dit de quoi un fil parle.
   */
  async threadOpening(target: ThreadTarget, limit: number): Promise<Pick<ChatMessageEntity, 'role' | 'content'>[]> {
    const rows = await this.messages.find({
      where: this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
      select: ['role', 'content'],
      order: { created_at: 'ASC' },
      take: limit,
    })
    return rows.map(row => ({ role: row.role, content: row.content }))
  }

  /**
   * #1954 — ce fil est-il RANGÉ ? Un fil rangé masque ses documents « fil
   * seul » à la récupération ; le ressortir les rend (Louis, 12/09/2026).
   *
   * Lu sur la MÊME clé que `setThreadArchived` : deux lectures du même fil qui
   * divergeraient diraient « rangé » à l'écran et « vivant » à Laura.
   */
  async isThreadArchived(target: ThreadTarget): Promise<boolean> {
    const stamped = await this.messages.count({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        archived_at: Not(IsNull()),
      },
    })
    return stamped > 0
  }

  /**
   * Ce message répond-il à une question de précision de Laura ? La règle vit
   * ICI, et nulle part ailleurs — le client ne la déclare pas, il ne peut pas
   * la déclarer, et rien dans le corps du message n'est lu pour la trancher.
   *
   * Deux conditions, et les deux comptent :
   *
   *  1. **le message précédent de cette personne dans ce fil porte le marquage
   *     de Laura.** C'est le saut, et il est unique par question : le message
   *     d'après aura pour précédent celui-ci, qui n'est pas marqué.
   *
   *  2. **aucun saut n'a encore été accordé dans ce fil sur la fenêtre.**
   *     Sans elle, « Laura demande → je réponds → Laura redemande » serait
   *     gratuit indéfiniment : une conversation qui tourne en rond ne
   *     consommerait rien. C'est le jumeau serveur de la borne du modèle — une
   *     clarification par conversation (`chat_orchestrator.py`) —, sauf que
   *     celle-ci ne dépend d'aucun état conservé par le navigateur.
   *
   * ⚠️ Une lecture qui échoue ne donne JAMAIS le saut : le message compte. Une
   * base muette ne doit pas ouvrir le plafond, et « on n'a pas pu vérifier »
   * n'est pas « c'était une réponse ».
   */
  private async resolvePrecisionHop(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    conversationId: string | null
    role: ChatMessageRole
  }): Promise<Date | null> {
    if (args.role !== 'user') return null
    try {
      const previous = await this.latestUserMessage(args)
      if (!previous?.precision_request_at) return null
      const since = new Date(Date.now() - QUOTA_WINDOW_MS)
      const alreadyHopped = await this.messages.count({
        where: {
          ...this.threadWhere(args.workspaceId, args.accountId, args.conversationId, args.userId),
          user_id: args.userId,
          quota_exempt_at: MoreThanOrEqual(since),
        },
      })
      return alreadyHopped > 0 ? null : new Date()
    } catch (error) {
      this.logger.warn(`Saut de précision non vérifiable, le message est compté: ${String(error)}`)
      return null
    }
  }

  /** Le dernier message de CETTE personne dans CE fil. */
  private latestUserMessage(target: ThreadTarget): Promise<ChatMessageEntity | null> {
    return this.messages.findOne({
      where: {
        ...this.threadWhere(target.workspaceId, target.accountId, target.conversationId, target.userId),
        user_id: target.userId,
        role: 'user',
      },
      order: { created_at: 'DESC' },
    })
  }

  /**
   * #1943.2 — le TOUR de chacun de ces messages, quand il en porte un : ce qui
   * rattache à un message les cartes que ce tour a proposées, à la relecture.
   *
   * Fonction SÉPARÉE de `listThread` (que d'autres lots enrichissent) : une
   * lecture de plus, bornée à l'espace et aux identifiants déjà lus.
   */
  async turnIdsOf(workspaceId: string, messageIds: readonly string[]): Promise<Map<string, string>> {
    if (messageIds.length === 0) return new Map()
    const rows = await this.messages.find({
      where: { workspace_id: workspaceId, id: In([...messageIds]), turn_id: Not(IsNull()) },
      select: ['id', 'turn_id'],
    })
    return new Map(rows.flatMap(row => (row.turn_id ? [[row.id, row.turn_id] as [string, string]] : [])))
  }

  /**
   * #2703 — LA CLÉ D'UN FIL, ET SON PROPRIÉTAIRE QUAND IL EN A UN.
   *
   * Deux régimes, et c'est tout le contrat (décision Louis du 22/09/2026, née du
   * retour d'Apricot Labs — deux sièges payés dans un même espace) :
   *
   *  · une conversation NOMMÉE (`conversationId`) est PARTAGÉE par l'espace.
   *    C'est un travail qu'on veut pouvoir reprendre à plusieurs, et chaque
   *    message y porte déjà son auteur (#1940.4). Lecture inchangée.
   *
   *  · le fil PAR DÉFAUT (pas de `conversationId` — le fil de portefeuille ou
   *    celui d'un compte) est PRIVÉ : il appartient à son auteur. C'est un
   *    brouillon personnel, et c'est là que la collision était CERTAINE : deux
   *    membres du même espace y écrivaient littéralement dans le même fil
   *    (« si nous sommes 2 dans les messages, ils se superposent et se
   *    mélangent », Bedros Astourian, 22/09/2026).
   *
   * ⚠️ `ownerUserId` est REQUIS, jamais optionnel : c'est ce qui force chaque
   * appelant à répondre à la question « de qui est ce fil ? » à la compilation,
   * plutôt qu'à laisser un `undefined` rouvrir le mélange en silence.
   *
   * ⚠️ `workspace_id` reste dans LES DEUX branches : ajouter le propriétaire
   * n'affaiblit pas le cloisonnement d'espace — les espaces sont des ESN, donc
   * des concurrents.
   */
  private threadWhere(
    workspaceId: string,
    accountId: string | null,
    conversationId: string | null,
    ownerUserId: string,
  ) {
    if (conversationId) return { workspace_id: workspaceId, conversation_id: conversationId }
    return {
      workspace_id: workspaceId,
      account_id: accountId ?? IsNull(),
      conversation_id: IsNull(),
      // #2703 — le fil par défaut est celui de SON auteur. `user_id` porte
      // l'auteur de chaque ligne depuis l'origine (`create`, depuis le JWT, y
      // compris sur les réponses de Laura) : rien ne se migre, chaque membre
      // RETROUVE ses messages et personne n'en perd.
      user_id: ownerUserId,
    }
  }

  /* ──────────────────────────────────────────────────────────────────────── */
  /*  #1939 — LE MESSAGE VOCAL. À part, et à dessein : rien ici ne touche aux  */
  /*  titres, aux auteurs ni aux pièces jointes du fil.                        */
  /* ──────────────────────────────────────────────────────────────────────── */

  /**
   * #1939 — l'enregistrement conservé d'un message, lu avec la MÊME portée que
   * son texte (décision Louis du 12/09 : « même portée que le texte du fil »).
   *
   * `listThread` lit un fil par `workspace_id` : quiconque lit le message dans
   * son espace peut le réécouter, personne d'autre. La borne d'espace est DANS
   * la requête — un identifiant de message deviné dans un autre espace ne trouve
   * rien, et rien ne dit qu'il existe ailleurs. `null` = pas de message ici, ou
   * pas d'enregistrement conservé (message tapé, 30 jours passés, compte effacé).
   */
  async voiceObjectIdInWorkspace(workspaceId: string, messageId: string): Promise<string | null> {
    const row = await this.messages.findOne({
      where: { id: messageId, workspace_id: workspaceId },
      select: ['id', 'voice_object_id'],
    })
    return row?.voice_object_id ?? null
  }

  /**
   * #1939.13 — un identifiant d'enregistrement reçu du CLIENT ne vaut rien tant
   * qu'on n'a pas vérifié qu'il désigne SON enregistrement.
   *
   * Trois conditions, toutes DANS la requête :
   *  · `uploaded_by` = l'auteur — un collègue du même espace ne rattache pas la
   *    voix d'un autre à son propre message ;
   *  · `workspace_id` = l'espace du message — un identifiant deviné ailleurs ne
   *    trouve rien ;
   *  · `domain = 'chat_voice_message'` — un justificatif de note de frais ne
   *    devient pas un « message vocal » réécoutable depuis le fil.
   *
   * Et seul un message de l'UTILISATEUR en porte un : une réponse de Laura n'a
   * pas de voix enregistrée.
   */
  private async resolveOwnVoiceObject(args: {
    userId: string
    workspaceId: string
    role: ChatMessageRole
    voiceObjectId?: string | null
  }): Promise<string | null> {
    const voiceObjectId = args.voiceObjectId ?? null
    if (!voiceObjectId) return null
    if (args.role !== 'user') {
      throw new BadRequestException('Seul un message de l’utilisateur porte un enregistrement vocal.')
    }
    const rows = await this.messages.manager.query<{ id: string }[]>(
      `SELECT id FROM storage_objects WHERE id = $1 AND workspace_id = $2 AND uploaded_by = $3 AND domain = 'chat_voice_message'`,
      [voiceObjectId, args.workspaceId, args.userId],
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new NotFoundException('Enregistrement vocal introuvable dans cet espace.')
    }
    return voiceObjectId
  }
}
