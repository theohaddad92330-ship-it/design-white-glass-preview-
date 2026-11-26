import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateTeamComment, TeamComment } from '@bellum/contracts'
import { isInPortfolio, portfolioScopeFor } from '@bellum/contracts'
import { activeTeammateAccountIds } from '../../common/account-team-membership'
import { TeamCommentEntity } from '../../database/entities/team-comment.entity'
import { ChatConversationEntity } from '../../database/entities/chat-conversation.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { TeamNotificationsService } from '../notifications/team/team-notifier.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Combien de commentaires on ramène en tête de fil (le cockpit affiche le récent). */
const TEAM_COMMENTS_LIMIT = 50

/** #1940.6 — combien de commentaires on ramène d'un fil (lecture chronologique). */
const THREAD_COMMENTS_LIMIT = 200

/** Une ligne du fil telle que renvoyée par la jointure profil + compte. */
type CommentRow = {
  id: string
  workspaceId: string
  authorUserId: string
  firstName: string | null
  lastName: string | null
  email: string | null
  body: string
  accountId: string | null
  companyName: string | null
  conversationId: string | null
  messageId: string | null
  mentionedUserIds: string[] | null
  parentCommentId: string | null
  resolvedAt: Date | string | null
  resolvedBy: string | null
  createdAt: Date | string
}

const SELECT_COMMENT_ROW = `
  SELECT c.id, c.workspace_id AS "workspaceId", c.author_user_id AS "authorUserId",
         p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email",
         c.body, c.account_id AS "accountId", a.company_name AS "companyName",
         c.conversation_id AS "conversationId", c.message_id AS "messageId",
         c.mentioned_user_ids AS "mentionedUserIds",
         c.parent_comment_id AS "parentCommentId", c.resolved_at AS "resolvedAt", c.resolved_by AS "resolvedBy",
         c.created_at AS "createdAt"
  FROM team_comments c
  LEFT JOIN profiles p ON p.user_id = c.author_user_id
  LEFT JOIN accounts a ON a.id = c.account_id
`

/**
 * Commentaire d'équipe (cockpit manager §10 — « Capitalisation & collaboration »).
 * Un fil workspace-scopé, avec cible compte optionnelle. Rien d'inventé : que du
 * texte réellement écrit par un membre, l'identité de l'auteur résolue côté serveur.
 *
 * #1940.6 — LE MÊME fil sert aussi un commentaire sur une conversation `/chat`
 * précise (`conversation_id`) ou une réponse (`message_id`). Visible des seuls
 * membres autorisés à OUVRIR ce fil : même mécanisme que #1955.12
 * (`ia-proxy.controller.ts#assertCitedAccountsReadable`) — portefeuille
 * cloisonné (`portfolioScopeFor`, D5) appliqué au compte attaché de la
 * conversation (`chat_conversations.attached_account_id`), sans dépendre du
 * module `ia-proxy` (GA-07 : éviter un import de service en plus).
 */
@Injectable()
export class TeamCommentsService {
  private readonly logger = new Logger(TeamCommentsService.name)

  constructor(
    @InjectRepository(TeamCommentEntity)
    private readonly repo: Repository<TeamCommentEntity>,
    @InjectRepository(ChatConversationEntity)
    private readonly conversations: Repository<ChatConversationEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // #4158.17 — EN DERNIER et optionnel : absent, le commentaire est byte-identique.
    @Optional() private readonly teamNotifications?: TeamNotificationsService,
  ) {}

  /**
   * La tête du fil de l'espace de travail, plus récent d'abord — SANS les
   * commentaires de conversation (#1940.6), qui encombreraient un fil général.
   *
   * `conversationId` fourni : bascule sur la lecture chronologique (le plus
   * ancien d'abord, comme un fil se lit) d'UN fil `/chat`, après vérification
   * d'accès.
   *
   * #2914 (#2128.10) — `accountId` fourni : même bascule chronologique, pour
   * LE FIL D'UN COMPTE — la fiche compte n'avait jusqu'ici AUCUN moyen de
   * retrouver ses propres commentaires : `create` savait déjà les rattacher
   * (`account_id`), mais ils se noyaient dans le fil général de l'espace, sans
   * appelant qui les isole. Même contrôle d'accès portefeuille que le fil de
   * conversation, appliqué directement au compte plutôt qu'au fil attaché.
   */
  async list(userId: string, conversationId?: string, accountId?: string, openMine = false): Promise<TeamComment[]> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // #4158.31 — « mes fils ouverts » : les fils NON résolus où je suis l'auteur de la racine, mentionné,
    // ou déjà intervenu. Racines seulement, plus récent d'abord ; toujours borné à l'espace actif, et un
    // fil de conversation `/chat` n'y figure pas (il reste soumis à l'accès du fil qui le porte).
    if (openMine) {
      const rows = await this.repo.manager.query<CommentRow[]>(
        `${SELECT_COMMENT_ROW}
         WHERE c.workspace_id = $1 AND c.conversation_id IS NULL
           AND c.parent_comment_id IS NULL AND c.resolved_at IS NULL
           AND (c.author_user_id = $2 OR $2 = ANY(c.mentioned_user_ids)
                OR EXISTS (SELECT 1 FROM team_comments r
                           WHERE r.workspace_id = $1 AND r.parent_comment_id = c.id AND r.author_user_id = $2))
         ORDER BY c.created_at DESC
         LIMIT $3`,
        [workspaceId, userId, TEAM_COMMENTS_LIMIT],
      )
      return rows.map(toWire)
    }

    if (conversationId) {
      await this.assertConversationCommentable(userId, workspaceId, role, conversationId)
      const rows = await this.repo.manager.query<CommentRow[]>(
        `${SELECT_COMMENT_ROW}
         WHERE c.workspace_id = $1 AND c.conversation_id = $2
         ORDER BY c.created_at ASC
         LIMIT ${THREAD_COMMENTS_LIMIT}`,
        [workspaceId, conversationId],
      )
      return rows.map(toWire)
    }

    if (accountId) {
      await this.assertAccountCommentable(userId, workspaceId, role, accountId)
      const rows = await this.repo.manager.query<CommentRow[]>(
        `${SELECT_COMMENT_ROW}
         WHERE c.workspace_id = $1 AND c.account_id = $2
         ORDER BY c.created_at ASC
         LIMIT ${THREAD_COMMENTS_LIMIT}`,
        [workspaceId, accountId],
      )
      return rows.map(toWire)
    }

    const rows = await this.repo.manager.query<CommentRow[]>(
      `${SELECT_COMMENT_ROW}
       WHERE c.workspace_id = $1 AND c.conversation_id IS NULL
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [workspaceId, TEAM_COMMENTS_LIMIT],
    )
    return rows.map(toWire)
  }

  /**
   * Poster un commentaire dans le fil de l'espace. Membership prouvé avant écriture.
   * Une cible compte (`account_id`) est re-vérifiée comme appartenant au workspace —
   * un id d'une autre équipe est un 404, jamais un lien silencieux inter-espaces.
   *
   * #1940.6 — une cible `conversation_id` est re-vérifiée par le même contrôle
   * d'accès que la lecture (`assertConversationCommentable`) : commenter un fil
   * qu'on ne pourrait pas ouvrir soi-même reste refusé.
   */
  async create(userId: string, body: CreateTeamComment): Promise<TeamComment> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertMember(userId, workspaceId)

    const accountId = body.account_id ?? null
    if (accountId) {
      const owned = await this.repo.manager.query<{ id: string }[]>(
        `SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2 AND status <> 'deleted' LIMIT 1`,
        [accountId, workspaceId],
      )
      if (owned.length === 0) throw new NotFoundException('Compte introuvable')
    }

    const conversationId = body.conversation_id ?? null
    if (conversationId) {
      await this.assertConversationCommentable(userId, workspaceId, role, conversationId)
    }

    const mentionedUserIds = await this.assertMentionsAreMembers(userId, body.mentioned_user_ids ?? [])

    // #4158.31 — une réponse se rattache à la RACINE de son fil (jamais plus bas) et hérite de sa cible.
    let parentCommentId: string | null = null
    let target = { accountId, conversationId }
    if (body.parent_comment_id) {
      const parents = await this.repo.manager.query<
        { id: string; parent: string | null; account_id: string | null; conversation_id: string | null }[]
      >(
        `SELECT id, parent_comment_id AS parent, account_id, conversation_id
         FROM team_comments WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [body.parent_comment_id, workspaceId],
      )
      const parent = parents[0]
      if (!parent) throw new NotFoundException('Fil introuvable')
      parentCommentId = parent.parent ?? parent.id
      target = { accountId: parent.account_id, conversationId: parent.conversation_id }
      if (target.conversationId) {
        await this.assertConversationCommentable(userId, workspaceId, role, target.conversationId)
      } else if (target.accountId) {
        await this.assertAccountCommentable(userId, workspaceId, role, target.accountId)
      }
    }

    const saved = await this.repo.save(
      this.repo.create({
        workspace_id: workspaceId,
        author_user_id: userId,
        body: body.body.trim(),
        account_id: target.accountId,
        conversation_id: target.conversationId,
        // #1940.6 — une réponse précise n'a de sens QUE rattachée à un fil.
        message_id: target.conversationId ? (body.message_id ?? null) : null,
        mentioned_user_ids: mentionedUserIds,
        parent_comment_id: parentCommentId,
      }),
    )

    // #4158.17 — la mention PRODUIT enfin sa notification : une par personne
    // mentionnée, seulement si elle est membre de l'espace et a accès à l'objet
    // (le service d'équipe tranche), jamais l'auteur. Le commentaire est déjà
    // écrit : le service ne lève pas.
    if (mentionedUserIds.length > 0) {
      await this.teamNotifications?.notifyMentions({
        workspaceId,
        actorUserId: userId,
        mentionedUserIds,
        accountId,
        conversationId,
      })
    }

    const rows = await this.repo.manager.query<CommentRow[]>(
      `${SELECT_COMMENT_ROW}
       WHERE c.id = $1
       LIMIT 1`,
      [saved.id],
    )
    // La ligne vient d'être insérée ; le repli protège d'une lecture qui raterait.
    return rows[0] ? toWire(rows[0]) : fallbackWire(saved)
  }

  /**
   * #4158.31 — marquer un fil résolu, ou le rouvrir. Le « résolu » est porté par la RACINE du fil ;
   * toute réponse est refusée (400) : on résout un fil, pas un message. Un fil d'un autre espace
   * est un 404, et un compte hors du portefeuille du lecteur n'ouvre pas son fil (même garde que
   * la lecture). Rien n'est supprimé : rouvrir efface seulement la marque.
   */
  async setResolution(userId: string, commentId: string, resolved: boolean): Promise<TeamComment> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertMember(userId, workspaceId)

    const found = await this.repo.manager.query<CommentRow[]>(
      `${SELECT_COMMENT_ROW}
       WHERE c.id = $1 AND c.workspace_id = $2
       LIMIT 1`,
      [commentId, workspaceId],
    )
    const root = found[0]
    if (!root) throw new NotFoundException('Fil introuvable')
    if (root.parentCommentId) throw new BadRequestException('Seule la racine d’un fil peut être résolue')
    if (root.conversationId) {
      await this.assertConversationCommentable(userId, workspaceId, role, root.conversationId)
    } else if (root.accountId) {
      await this.assertAccountCommentable(userId, workspaceId, role, root.accountId)
    }

    await this.repo.manager.query(
      `UPDATE team_comments
       SET resolved_at = ${resolved ? 'now()' : 'NULL'}, resolved_by = $3
       WHERE id = $1 AND workspace_id = $2`,
      [commentId, workspaceId, resolved ? userId : null],
    )
    const reread = await this.repo.manager.query<CommentRow[]>(
      `${SELECT_COMMENT_ROW}
       WHERE c.id = $1 AND c.workspace_id = $2
       LIMIT 1`,
      [commentId, workspaceId],
    )
    return toWire(reread[0] ?? root)
  }

  /**
   * #1940.6 / réutilise #1955.12 — le fil cite-t-il un compte que ce lecteur
   * ne voit pas ?
   *
   * En portefeuille OUVERT, ou pour un rôle qui gère l'équipe
   * (`portfolioScopeFor` rend `null`), rien à vérifier. Sinon : le fil par
   * défaut (sans ligne `chat_conversations`, `conversationRow` = `null`) n'a
   * aucun compte attaché — commentable. Un fil NOMMÉ dont le compte attaché
   * est porté par un AUTRE membre dont le lecteur n'est pas co-équipier est refusé, exactement comme son ouverture
   * dans `/chat` le serait (D5).
   */
  private async assertConversationCommentable(
    userId: string,
    workspaceId: string,
    role: Parameters<typeof portfolioScopeFor>[0],
    conversationId: string,
  ): Promise<void> {
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, userId)
    if (!scope) return

    const conversationRow = await this.conversations.findOne({
      where: { workspace_id: workspaceId, conversation_id: conversationId },
    })
    const attachedAccountId = conversationRow?.attached_account_id
    if (!attachedAccountId) return

    const account = await this.accounts.findOne({ where: { id: attachedAccountId, workspace_id: workspaceId } })
    if (
      account &&
      !isInPortfolio(
        scope,
        account,
        (await activeTeammateAccountIds(this.accounts.manager, workspaceId, userId, [account.id])).has(account.id),
      )
    ) {
      throw new ForbiddenException(
        'Cette conversation porte sur un compte hors de ton portefeuille : elle ne peut pas être commentée ici.',
      )
    }
  }

  /**
   * #2914 (#2128.9) — un id mentionné n'est retenu QUE s'il désigne un membre
   * de l'espace de l'auteur : mentionner « quelqu'un » qui n'existe pas ici
   * romprait le lien que la mention promet (ouvrir sa fiche, le notifier un
   * jour) sans jamais le dire à l'écran. Refusé en bloc — jamais un tri
   * silencieux qui garderait les valides et jetterait le reste.
   */
  private async assertMentionsAreMembers(userId: string, mentionedUserIds: readonly string[]): Promise<string[]> {
    if (mentionedUserIds.length === 0) return []
    const members = await this.workspaceContext.listMembers(userId)
    const memberIds = new Set(members.map(member => member.userId))
    const unknown = mentionedUserIds.find(id => !memberIds.has(id))
    if (unknown) throw new NotFoundException('Collègue introuvable dans cet espace')
    return [...mentionedUserIds]
  }

  /**
   * #2914 (#2128.10) — le fil d'UN compte est-il lisible/commentable par ce
   * membre ? Même garde que `assertConversationCommentable`, appliquée
   * directement au compte visé plutôt qu'au compte attaché d'une conversation
   * — un compte HORS du portefeuille du lecteur n'ouvre pas son fil, exactement
   * comme il n'ouvrirait pas sa fiche.
   *
   * Un compte INTROUVABLE dans cet espace est un 404, jamais un fil vide qui
   * se lirait « personne n'a encore commenté » — les deux phrases mentent
   * différemment, et confondre un id qui n'existe pas avec un fil neuf serait
   * exactement la fausse absence que ce dépôt refuse ailleurs.
   */
  private async assertAccountCommentable(
    userId: string,
    workspaceId: string,
    role: Parameters<typeof portfolioScopeFor>[0],
    accountId: string,
  ): Promise<void> {
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    const scope = portfolioScopeFor(role, visibility, userId)
    if (!scope) return

    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')
    const teammate = (await activeTeammateAccountIds(this.accounts.manager, workspaceId, userId, [account.id])).has(
      account.id,
    )
    if (!isInPortfolio(scope, account, teammate)) {
      throw new ForbiddenException(
        'Ce compte est hors de ton portefeuille : son fil de commentaires ne peut pas être ouvert ici.',
      )
    }
  }
}

/** `first last` trimmé, sinon la partie locale de l'email, sinon `null`. */
function displayName(firstName: string | null, lastName: string | null, email: string | null): string | null {
  const full = [firstName, lastName]
    .filter(part => part && part.trim())
    .join(' ')
    .trim()
  if (full) return full
  return email?.split('@')[0] || null
}

function toWire(row: CommentRow): TeamComment {
  return {
    id: row.id,
    workspace_id: row.workspaceId,
    author_user_id: row.authorUserId,
    author_name: displayName(row.firstName, row.lastName, row.email),
    body: row.body,
    account_id: row.accountId,
    company_name: row.companyName,
    conversation_id: row.conversationId,
    message_id: row.messageId,
    mentioned_user_ids: row.mentionedUserIds ?? [],
    parent_comment_id: row.parentCommentId ?? null,
    resolved_at: row.resolvedAt ? new Date(row.resolvedAt).toISOString() : null,
    resolved_by: row.resolvedBy ?? null,
    created_at: new Date(row.createdAt).toISOString(),
  }
}

/** Repli si la relecture jointe échoue : le commentaire existe, sans noms résolus. */
function fallbackWire(entity: TeamCommentEntity): TeamComment {
  return {
    id: entity.id,
    workspace_id: entity.workspace_id,
    author_user_id: entity.author_user_id,
    author_name: null,
    body: entity.body,
    account_id: entity.account_id,
    company_name: null,
    conversation_id: entity.conversation_id,
    message_id: entity.message_id,
    mentioned_user_ids: entity.mentioned_user_ids ?? [],
    parent_comment_id: entity.parent_comment_id ?? null,
    resolved_at: entity.resolved_at ? new Date(entity.resolved_at).toISOString() : null,
    resolved_by: entity.resolved_by ?? null,
    created_at: new Date(entity.created_at).toISOString(),
  }
}
