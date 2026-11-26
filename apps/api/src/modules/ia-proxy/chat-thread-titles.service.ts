import { chatThreadTitleSchema, type ChatThreadTitleSource } from '@bellum/contracts'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { In, MoreThanOrEqual, Repository } from 'typeorm'
import { killSwitchCut } from '../../common/kill-switches'
import { ChatThreadTitleEntity } from '../../database/entities/chat-thread-title.entity'
import { IA_COST_HEADER, IaClient } from '../ia/ia.client'
import { ChatMessagesService } from './chat-messages.service'
import { QUOTA_WINDOW_MS, chatTitleDailyCap } from './chat-quota'

/**
 * Le fil visé — la même désignation que l'archivage (`threadWhere`).
 *
 * #2703 — `userId` fait partie de la désignation depuis le 22/09/2026 : le fil
 * par DÉFAUT appartient à son auteur, donc son titre aussi.
 */
type ThreadRef = { userId: string; workspaceId: string; accountId: string | null; conversationId: string | null }

/** Ce que la rédaction a fait. Rendu pour les tests ; l'appelant ne l'attend pas. */
type TitleOutcome = 'cut' | 'already_titled' | 'not_second_exchange' | 'capped' | 'no_title' | 'written' | 'failed'

/** La ligne d'historique telle que `listHistory` la sert. */
type HistoryRow = { account_id: string | null; conversation_id: string | null; title: string }

/**
 * Le délai d'un titre. Borné et sans reprise : un titre qui n'arrive pas ne
 * vaut pas un second appel facturé — le fil garde son premier message, et c'est
 * un titre honnête.
 */
const TITLE_CALL = { timeoutMs: 15_000, maxAttempts: 1 } as const

/** L'OUVERTURE du fil part au modèle : c'est elle qui dit de quoi il parle. */
const OPENING_MESSAGES = 6

/**
 * Le fil est titré à son 2e ÉCHANGE : deux questions de la personne, et au
 * moins deux réponses de Laura. « Au moins » parce que l'amorce de Laura (#1947)
 * est écrite AVANT la première question — au 2e échange, un fil amorcé porte
 * trois réponses pour deux questions. Compter les QUESTIONS rend le déclenchement
 * unique : au 3e échange il y en a trois, et un fil qui n'a pas pu être titré
 * n'est pas re-tenté à chaque réponse suivante.
 */
const TITLED_AT_EXCHANGE = 2

/**
 * #2703 — LA CLÉ DU TITRE SUIT LA CLÉ DU FIL.
 *
 * Une conversation NOMMÉE est partagée par l'espace : son titre l'est aussi,
 * clé inchangée (`c:<conversation>`). Le fil par DÉFAUT est privé à son auteur
 * depuis le 22/09/2026 : son titre porte donc le propriétaire, sans quoi deux
 * membres du même espace se renommeraient mutuellement leur fil personnel — et
 * un titre est DÉRIVÉ des messages, donc en montrer un d'un collègue remettrait
 * à l'écran exactement le mélange que #2703 supprime.
 *
 * ⚠️ Conséquence assumée sur l'existant : un titre écrit AVANT ce lot pour un
 * fil par défaut porte l'ancienne clé (`a:<compte>`) et n'est plus retrouvé. La
 * ligne n'est ni supprimée ni réécrite (« on archive, on ne supprime pas ») ; le
 * fil reprend son premier message pour titre — l'état exact d'un fil pas encore
 * titré — et le prochain 2e échange lui en écrit un sous la nouvelle clé.
 */
function threadKey(conversationId: string | null, accountId: string | null, ownerUserId: string): string {
  return conversationId ? `c:${conversationId}` : `a:${accountId ?? ''}|u:${ownerUserId}`
}

/** Le NOM d'une erreur, jamais son message : il peut recopier la conversation. */
function failureName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error
}

/**
 * #1911.1 / #1911.12 / #1911.17 / #1955.1 — le titre des fils de Laura.
 *
 * Décision de Louis (12/09/2026) : **« Rédigé par Laura, sans quota »** — un
 * titre court écrit par un petit modèle après le 2e échange, hors des 50
 * messages du jour, modifiable à la main.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HORS QUOTA, ET POURQUOI C'EST VRAI PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Le plafond quotidien (`assertChatQuota`) compte des lignes `chat_messages` de
 * rôle `user` (`measureUserMessagesSince`). Ce service n'y écrit RIEN : il lit
 * le fil et écrit dans `chat_thread_titles`. Prouvé sur le vrai compteur,
 * `chat-thread-titles.service.spec.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MAIS BORNÉ QUAND MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * La route qui déclenche (`POST /ia/chat/messages`) est écrite par le
 * navigateur : des fils fabriqués à la chaîne feraient autant d'appels de
 * modèle. Les titres rédigés par une personne sur 24 h sont donc bornés par le
 * MÊME nombre que le plafond du copilote (un fil titré en coûte deux messages :
 * la borne laisse deux fois la marge d'un usage réel). Plafond à 0 ⇒ pas de
 * borne, comme pour le chat. Aucune variable nouvelle : un réglage vit à un seul
 * endroit (GA-26).
 *
 * ⚠️ Ce service ne sait pas si l'espace est une salle de DÉMONSTRATION : c'est
 * le contrôleur qui la refuse avant de l'appeler (zéro appel de modèle en démo).
 * L'importer ici ferait lire à un service le service d'un autre module (GA-07).
 */
@Injectable()
export class ChatThreadTitlesService {
  private readonly logger = new Logger(ChatThreadTitlesService.name)

  constructor(
    @InjectRepository(ChatThreadTitleEntity)
    private readonly titles: Repository<ChatThreadTitleEntity>,
    private readonly messages: ChatMessagesService,
    private readonly ia: IaClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * La liste des fils, chacun avec son titre STOCKÉ quand il en a un.
   *
   * Sans titre stocké, la ligne garde son premier message et `title_source`
   * vaut `null` — « aucun titre écrit », pas « titre vide ». Une lecture qui
   * échoue ne fait pas tomber la liste : elle retombe sur les premiers messages.
   */
  async withStoredTitles<T extends HistoryRow>(
    workspaceId: string,
    /** #2703 — QUI lit : la liste ne porte que SES fils par défaut, dont les titres sont les siens. */
    userId: string,
    items: T[],
  ): Promise<(T & { title_source: ChatThreadTitleSource | null })[]> {
    if (items.length === 0) return []
    const keys = [...new Set(items.map(item => threadKey(item.conversation_id, item.account_id, userId)))]
    let stored: Pick<ChatThreadTitleEntity, 'thread_key' | 'title' | 'title_source'>[] = []
    try {
      stored = await this.titles.find({
        where: { workspace_id: workspaceId, thread_key: In(keys) },
        select: ['thread_key', 'title', 'title_source'],
      })
    } catch (error) {
      this.logger.warn(`Titres des fils illisibles, la liste garde les premiers messages (${failureName(error)})`)
    }
    const byKey = new Map(stored.map(row => [row.thread_key, row]))
    return items.map(item => {
      const found = byKey.get(threadKey(item.conversation_id, item.account_id, userId))
      return found ? { ...item, title: found.title, title_source: found.title_source } : { ...item, title_source: null }
    })
  }

  /**
   * #1911.12 / #1955.1 — renommer un fil. Écrase tout titre existant, y compris
   * celui de Laura : une correction humaine gagne toujours.
   *
   * `null` quand le fil n'existe pas DANS CET ESPACE — même lecture que
   * l'archivage (`threadWhere`), jamais une clé seule.
   */
  async rename(args: ThreadRef & { title: string }): Promise<{ title: string; title_source: 'user' } | null> {
    const ref = {
      // #2703 — on renomme SON fil par défaut, jamais celui d'un collègue.
      userId: args.userId,
      workspaceId: args.workspaceId,
      accountId: args.accountId,
      conversationId: args.conversationId,
    }
    if (!(await this.messages.threadExists(ref))) return null
    await this.titles.upsert(
      {
        workspace_id: args.workspaceId,
        thread_key: threadKey(args.conversationId, args.accountId, args.userId),
        title: args.title,
        title_source: 'user',
        set_by: args.userId,
      },
      { conflictPaths: ['workspace_id', 'thread_key'] },
    )
    return { title: args.title, title_source: 'user' }
  }

  /**
   * Un fil « supprimé » emporte son titre : c'est un texte DÉRIVÉ de ses
   * messages. ⚠️ #2430.9 (20/09/2026) : les messages, eux, survivent
   * désormais (archivés) — le titre continue de partir pour de bon, à dessein
   * (dérivé, regénérable ; hors périmètre de la décision du 20/09).
   */
  async forget(ref: ThreadRef): Promise<void> {
    await this.titles.delete({
      workspace_id: ref.workspaceId,
      thread_key: threadKey(ref.conversationId, ref.accountId, ref.userId),
    })
  }

  /**
   * #1911.1 — Laura vient de répondre : faut-il titrer le fil, et le titrer.
   *
   * Appelé EN TÂCHE DE FOND par le contrôleur, jamais attendu dans le tour de la
   * personne. Ne lève jamais : un échec rend `failed`, le fil garde son premier
   * message, et le journal ne porte que le NOM de l'erreur.
   */
  async titleAfterReply(
    args: ThreadRef & {
      /**
       * #1911.1 — reçoit l'en-tête `x-bellum-costs` que le service IA remplit avec
       * l'usage MESURÉ de l'appel. Ce service le transmet sans le lire : le
       * contrôleur l'enregistre dans `provider_costs` (GA-07).
       */
      onCostHeader?: (value: string) => void
    },
  ): Promise<TitleOutcome> {
    // #1911.1 — l'interrupteur d'incident : posé, zéro lecture et zéro appel.
    if (killSwitchCut('copilot.thread_titles')) return 'cut'
    const ref = {
      // #2703 — le fil titré est celui de la personne qui vient de parler.
      userId: args.userId,
      workspaceId: args.workspaceId,
      accountId: args.accountId,
      conversationId: args.conversationId,
    }
    const key = threadKey(args.conversationId, args.accountId, args.userId)
    try {
      // Un titre existe déjà — celui de la personne, ou celui de Laura : on ne
      // lit même pas le fil. C'est la première moitié de « l'humain gagne ».
      const existing = await this.titles.findOne({ where: { workspace_id: args.workspaceId, thread_key: key } })
      if (existing) return 'already_titled'

      const { user, assistant } = await this.messages.exchangeCounts(ref)
      if (user !== TITLED_AT_EXCHANGE || assistant < TITLED_AT_EXCHANGE) return 'not_second_exchange'
      if (await this.capReached(args.workspaceId, args.userId)) return 'capped'

      const opening = await this.messages.threadOpening(ref, OPENING_MESSAGES)
      const proposed = await this.ia.chatThreadTitle(
        { messages: opening, locale: 'fr' },
        {
          ...TITLE_CALL,
          // #1911.1 — le coût RÉEL de l'appel, tel que l'IA l'a mesuré.
          responseHeaderName: IA_COST_HEADER,
          // Un en-tête absent n'est pas une mesure : rien n'est transmis.
          onResponseHeader: (_name, value) => {
            if (value !== null) args.onCostHeader?.(value)
          },
        },
      )
      const title = chatThreadTitleSchema.safeParse(proposed ?? '')
      if (!title.success) return 'no_title'

      // La seconde moitié : insérer SI ABSENT. Si la personne a renommé pendant
      // l'appel au modèle, sa ligne reste — ce chemin ne sait pas écraser.
      const result = await this.titles
        .createQueryBuilder()
        .insert()
        .values({
          workspace_id: args.workspaceId,
          thread_key: key,
          title: title.data,
          title_source: 'laura',
          set_by: args.userId,
        })
        .orIgnore()
        .execute()
      return Array.isArray(result.raw) && result.raw.length > 0 ? 'written' : 'already_titled'
    } catch (error) {
      this.logger.error('Titre de fil non rédigé, le fil garde son premier message', {
        error: { name: failureName(error) },
        tags: { feature: 'chat_thread_title' },
      })
      return 'failed'
    }
  }

  private async capReached(workspaceId: string, userId: string): Promise<boolean> {
    // #4016 L7 — plafond opérateur optionnel : absent, la borne reste (le plus
    // haut plafond de la grille), jamais l'illimité ; `0` posé = aucune borne.
    const limit = chatTitleDailyCap(this.config.get<number | undefined>('chatDailyMessageLimit'))
    if (limit === null) return false
    const since = new Date(Date.now() - QUOTA_WINDOW_MS)
    const written = await this.titles.count({
      where: { workspace_id: workspaceId, set_by: userId, title_source: 'laura', created_at: MoreThanOrEqual(since) },
    })
    return written >= limit
  }
}
