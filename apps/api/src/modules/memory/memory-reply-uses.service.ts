import { randomUUID } from 'node:crypto'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  MemoryConsultations,
  MemoryItemKind,
  MemoryItemOrigin,
  MemoryItemScope,
  MemorySurface,
  ReplyMemoryUses,
} from '@bellum/contracts'
import { ChatMessageEntity } from '../../database/entities/chat-message.entity'
import { ChatReplyMemoryUseEntity } from '../../database/entities/chat-reply-memory-use.entity'
import { isNearDuplicateReading } from './memory-near-duplicates'
import { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'

/**
 * Un tour du chat jamais rattaché à une réponse enregistrée (onglet fermé, écriture
 * du fil ratée, bulle flottante qui ne persiste pas) ne se compte nulle part. Au-delà
 * de ce délai, il est purgé au tour suivant de la même personne.
 */
const UNATTACHED_TURN_TTL = "interval '1 day'"

/** Une ligne de trace jointe à l'élément vivant — ce que la lecture sous une réponse relit. */
type TraceRow = {
  fact_id: string | null
  fact: string | null
  scope: MemoryItemScope | null
  kind: MemoryItemKind | null
  origin: MemoryItemOrigin | null
  account_id: string | null
  expires_at: Date | string | null
  owner_id: string | null
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function toConsulted(row: TraceRow, scope: MemoryItemScope): ReplyMemoryUses['consulted'][number] {
  return {
    id: row.fact_id ?? '',
    text: row.fact ?? '',
    scope,
    kind: row.kind ?? 'fact',
    origin: row.origin ?? 'manual',
    accountId: row.account_id,
    expiresAt: isoOrNull(row.expires_at),
  }
}

/**
 * #1916.18 / #1916.24 — LA TRACE DES ÉLÉMENTS DE MÉMOIRE ENVOYÉS À LAURA.
 *
 * ⚠️ ENVOYÉ, PAS « UTILISÉ ». On capture la liste des éléments PARTIS dans le
 * prompt d'un tour (`ChatContext.pinnedFactIds`, après portée, échéance et borne
 * du prompt). Rien ne prouve que le modèle s'en est servi, et rien ici ne le dit.
 *
 * Aucun contenu n'est écrit : des identifiants. Toute lecture est bornée par
 * l'espace, et par la portée du LECTEUR — un élément « Toi uniquement » d'un
 * collègue n'est qu'un compte.
 *
 * Coût : aucun appel de modèle. Un tour = une insertion (et une purge bornée) ;
 * le rattachement = une mise à jour ; un fil relu = un compte groupé ; la lecture
 * sous une réponse n'a lieu qu'à l'ouverture du panneau.
 */
@Injectable()
export class MemoryReplyUsesService {
  private readonly logger = new Logger(MemoryReplyUsesService.name)

  constructor(
    @InjectRepository(ChatReplyMemoryUseEntity)
    private readonly uses: Repository<ChatReplyMemoryUseEntity>,
  ) {}

  /**
   * Capture les éléments envoyés pour UN tour réussi, et rend l'identifiant du
   * tour (émis ici, jamais par le navigateur) — ou `null` quand rien n'est écrit.
   *
   * Best-effort : une écriture ratée ne casse jamais la réponse, et ne rend pas
   * de tour — le web n'annoncera donc aucune trace qui n'existe pas.
   */
  async captureTurn(args: {
    userId: string
    workspaceId: string
    surface: MemorySurface
    factIds: readonly string[]
  }): Promise<string | null> {
    const factIds = [...new Set(args.factIds)]
    if (factIds.length === 0) return null
    if (args.surface === 'chat') await this.purgeUnattachedTurns(args.userId)
    const turnId = randomUUID()
    try {
      await this.uses.insert(
        factIds.map(factId => ({
          workspace_id: args.workspaceId,
          user_id: args.userId,
          turn_id: turnId,
          surface: args.surface,
          message_id: null,
          fact_id: factId,
        })),
      )
      return turnId
    } catch (error) {
      // Le NOM de l'erreur seulement : son message pourrait recopier une valeur.
      this.logger.warn(`Trace de mémoire non écrite pour ce tour : ${error instanceof Error ? error.name : 'erreur'}`)
      return null
    }
  }

  /** Les tours du chat de CETTE personne jamais rattachés, au-delà du délai. */
  private async purgeUnattachedTurns(userId: string): Promise<void> {
    try {
      await this.uses
        .createQueryBuilder()
        .delete()
        .where('user_id = :user', { user: userId })
        .andWhere('surface = :surface', { surface: 'chat' })
        .andWhere('message_id IS NULL')
        .andWhere(`created_at < now() - ${UNATTACHED_TURN_TTL}`)
        .execute()
    } catch {
      // Une purge ratée laisse des lignes que rien ne compte : elle ne bloque pas le tour.
    }
  }

  /**
   * Rattache un tour du chat à la réponse que l'appelant vient d'enregistrer.
   *
   * Le critère est entier dans la requête : SON tour, dans SON espace, du chat,
   * encore libre. Un identifiant de tour deviné ou celui d'un collègue ne
   * rattache rien. Rend le nombre de lignes rattachées, ou `null` quand le pilote
   * ne le dit pas (« je ne sais pas » n'est pas « aucune »).
   */
  async attachTurn(args: {
    turnId: string
    messageId: string
    userId: string
    workspaceId: string
  }): Promise<number | null> {
    const result = await this.uses
      .createQueryBuilder()
      .update()
      .set({ message_id: args.messageId })
      .where('turn_id = :turn', { turn: args.turnId })
      .andWhere('user_id = :user', { user: args.userId })
      .andWhere('workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('surface = :surface', { surface: 'chat' })
      .andWhere('message_id IS NULL')
      .execute()
    return typeof result.affected === 'number' ? result.affected : null
  }

  /**
   * Combien d'éléments étaient dans le contexte de chaque réponse lue — en UNE
   * requête pour tout le fil. Un message interrogé sans ligne vaut 0 MESURÉ.
   */
  async countsForMessages(args: { workspaceId: string; messageIds: readonly string[] }): Promise<Map<string, number>> {
    const counts = new Map<string, number>()
    if (args.messageIds.length === 0) return counts
    const rows = await this.uses
      .createQueryBuilder('u')
      .select('u.message_id', 'message_id')
      .addSelect('COUNT(*)', 'uses')
      .where('u.workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('u.message_id IN (:...ids)', { ids: [...args.messageIds] })
      .groupBy('u.message_id')
      .getRawMany<{ message_id: string; uses: string | number }>()
    for (const id of args.messageIds) counts.set(id, 0)
    for (const row of rows) counts.set(row.message_id, Number(row.uses))
    return counts
  }

  /**
   * Sous une réponse : les éléments que le LECTEUR peut voir (texte relu sur
   * l'élément vivant), le COMPTE des éléments « Toi uniquement » d'un autre
   * membre, et le compte des éléments supprimés depuis.
   *
   * La portée est tranchée ICI, sur chaque ligne : un élément privé d'un collègue
   * ne produit qu'un incrément — ni texte, ni identifiant, ni auteur ne sortent.
   */
  async readForMessage(args: { messageId: string; workspaceId: string; viewerId: string }): Promise<ReplyMemoryUses> {
    const rows = await this.uses
      .createQueryBuilder('u')
      // #2439.10 — on archive, on ne supprime pas (décision Louis 21/09/2026) :
      // une mémoire OUBLIÉE se joint comme ABSENTE, donc elle compte comme
      // « retirée depuis » exactement comme une ligne détruite le faisait, et
      // son texte ne ressort pas sous la réponse. La borne est DANS la condition
      // de jointure : un `where` éliminerait la ligne de trace elle-même, et
      // l'élément oublié ne serait plus compté du tout.
      .leftJoin(
        MemoryPinnedFactEntity,
        'f',
        'f.id = u.fact_id AND f.workspace_id = u.workspace_id AND f.archived_at IS NULL',
      )
      .select('u.fact_id', 'fact_id')
      .addSelect('f.fact', 'fact')
      .addSelect('f.scope', 'scope')
      .addSelect('f.kind', 'kind')
      .addSelect('f.origin', 'origin')
      .addSelect('f.account_id', 'account_id')
      .addSelect('f.expires_at', 'expires_at')
      .addSelect('f.user_id', 'owner_id')
      .where('u.message_id = :message', { message: args.messageId })
      .andWhere('u.workspace_id = :ws', { ws: args.workspaceId })
      // L'ordre du prompt : `listFacts` lit du plus récent au plus ancien.
      .orderBy('f.created_at', 'DESC', 'NULLS LAST')
      .getRawMany<TraceRow>()

    // #3229 (recette prod 30/09) — « Mémoire consultée » affichait deux fois
    // le même fait. `captureTurn` déduplique déjà `factIds` PAR TOUR (`new
    // Set`), mais rien n'empêche deux tours distincts (turn_id différents —
    // ex. une relance) de s'être vu ATTACHER au même `message_id`, chacun
    // avec sa propre ligne pour le MÊME `fact_id`. Ce n'est jamais une
    // fusion de deux faits DIFFÉRENTS (interdite, doctrine « on propose, on
    // ne fusionne jamais ») : une seule ligne compte pour un `fact_id` déjà
    // vu sous CETTE réponse, exactement comme `captureTurn` le fait déjà
    // pour un seul tour.
    const seenFactIds = new Set<string>()
    // #3229 (passe B) — le MÊME texte saisi deux fois donne deux `fact_id` : à
    // l'écran, sous UNE réponse, il ne se lit qu'une fois (texte normalisé,
    // même niveau, même compte). Affichage seulement — les deux éléments
    // restent dans Réglages › Mémoire, rien n'est fusionné.
    const seenReadings = new Set<string>()
    const read: ReplyMemoryUses = { consulted: [], privateCount: 0, removedCount: 0 }
    for (const row of rows) {
      if (!row.fact_id || !row.fact) {
        read.removedCount += 1
        continue
      }
      if (seenFactIds.has(row.fact_id)) continue
      seenFactIds.add(row.fact_id)
      const scope: MemoryItemScope = row.scope ?? 'workspace'
      // #1918.2 / #1918.5 — même prudence que `user` : cette trace ne rejoue
      // PAS ici la logique de membre d'une BU ni le filtre de conversation de
      // `MemoryService` (elle vit dans la lecture PRINCIPALE, pas ce compte
      // secondaire). Par défaut fermé, comme `user` : seul l'auteur voit le
      // texte d'un élément « ma BU » ou « cette conversation » sous une
      // réponse ; un collègue de la même BU n'y perd rien d'observable — la
      // réponse elle-même reste lisible, seul CE compte de consultation reste
      // discret sur son contenu.
      if (
        (scope === 'user' || scope === 'business_unit' || scope === 'conversation') &&
        row.owner_id !== args.viewerId
      ) {
        read.privateCount += 1
        continue
      }
      const reading = `${row.fact.trim().replace(/\s+/g, ' ').toLowerCase()}|${scope}|${row.account_id ?? ''}`
      if (seenReadings.has(reading)) continue
      seenReadings.add(reading)
      // #3229 (01/10) — quasi-doublon d'un élément déjà lu au même niveau, sur le
      // même compte : le PLUS LONG des deux reste (il porte la phrase entière),
      // à la place du premier.
      const nearIndex = read.consulted.findIndex(
        seen =>
          seen.scope === scope &&
          seen.accountId === row.account_id &&
          isNearDuplicateReading(seen.text, row.fact ?? ''),
      )
      if (nearIndex >= 0) {
        if (row.fact.length > read.consulted[nearIndex].text.length) {
          read.consulted[nearIndex] = toConsulted(row, scope)
        }
        continue
      }
      read.consulted.push(toConsulted(row, scope))
    }
    return read
  }

  /**
   * Dans Réglages › Mémoire : pour chaque élément, dans combien de réponses que
   * le LECTEUR peut relire il était dans le contexte, la dernière quand, et la
   * conversation la plus récente qu'il peut ouvrir.
   *
   * Ce qui compte : une réponse du chat enregistrée dans un fil de SON espace
   * (les fils sont une ressource d'équipe) ; une réponse d'assistant externe
   * seulement si c'est LA SIENNE — celle d'un collègue n'est pas un fil qu'il
   * peut relire. Un tour jamais rattaché ne compte pas. Un élément sans trace
   * vaut `replies: 0` MESURÉ.
   */
  async consultationsFor(args: {
    workspaceId: string
    viewerId: string
    factIds: readonly string[]
  }): Promise<Map<string, MemoryConsultations>> {
    const map = new Map<string, MemoryConsultations>()
    if (args.factIds.length === 0) return map
    const ids = [...args.factIds]

    const stats = await this.uses
      .createQueryBuilder('u')
      .leftJoin(ChatMessageEntity, 'm', 'm.id = u.message_id')
      .select('u.fact_id', 'fact_id')
      .addSelect('COUNT(*)', 'replies')
      .addSelect('MAX(u.created_at)', 'last_at')
      .where('u.workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('u.fact_id IN (:...ids)', { ids })
      .andWhere(
        "((u.surface = 'chat' AND m.id IS NOT NULL AND m.workspace_id = :ws) OR (u.surface = 'externalAssistant' AND u.user_id = :viewer))",
        { ws: args.workspaceId, viewer: args.viewerId },
      )
      .groupBy('u.fact_id')
      .getRawMany<{ fact_id: string; replies: string | number; last_at: Date | string | null }>()

    const latest = await this.uses
      .createQueryBuilder('u')
      .innerJoin(ChatMessageEntity, 'm', 'm.id = u.message_id')
      .distinctOn(['u.fact_id'])
      .select('u.fact_id', 'fact_id')
      .addSelect('m.account_id', 'account_id')
      .addSelect('m.conversation_id', 'conversation_id')
      .where('u.workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('m.workspace_id = :ws', { ws: args.workspaceId })
      .andWhere('u.fact_id IN (:...ids)', { ids })
      .andWhere('u.surface = :surface', { surface: 'chat' })
      .orderBy('u.fact_id', 'ASC')
      .addOrderBy('u.created_at', 'DESC')
      .getRawMany<{ fact_id: string; account_id: string | null; conversation_id: string | null }>()

    const conversations = new Map(latest.map(row => [row.fact_id, row]))
    for (const id of ids) map.set(id, { replies: 0, lastAt: null, lastConversation: null })
    for (const row of stats) {
      const replies = Number(row.replies)
      if (!Number.isFinite(replies) || replies <= 0) continue
      const conversation = conversations.get(row.fact_id)
      map.set(row.fact_id, {
        replies,
        lastAt: isoOrNull(row.last_at),
        lastConversation: conversation
          ? { accountId: conversation.account_id, conversationId: conversation.conversation_id }
          : null,
      })
    }
    return map
  }

  /** « Tout oublier » : les traces de CETTE personne dans CET espace. */
  async forgetForUser(args: { userId: string; workspaceId: string }): Promise<void> {
    await this.uses.delete({ user_id: args.userId, workspace_id: args.workspaceId })
  }
}
