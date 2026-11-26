import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { In, IsNull, Repository } from 'typeorm'
import {
  canEditAccountTeam,
  hasPermission,
  orderAssigneeCandidates,
  planScopeDistribution,
  type ContactAssignmentResult,
  type DistributeApplyResponse,
  type DistributePreviewResponse,
  type DistributionPlan,
  type DistributionScope,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * « Qui traite ce contact » — attribution en masse d'une sélection de contacts
 * à un membre de l'espace de travail.
 *
 * Mêmes droits que le portefeuille compte ({@link AccountAssignmentService}),
 * lus dans {@link hasPermission} et jamais dans des chaînes de rôle :
 *  - un **manager** (`team:manage`) répartit : n'importe quel contact vers
 *    n'importe quel membre, et peut retirer une attribution ;
 *  - un **commercial** se sert : il PREND ce que personne ne porte et LIBÈRE ce
 *    qu'il porte, mais ne prend rien à un collègue et n'attribue à personne.
 *
 * Une seule différence avec le geste unitaire, et elle est délibérée : ici on
 * traite un LOT. Une ligne que le commercial n'a pas le droit de bouger est
 * ignorée et RAPPORTÉE (`skipped`) au lieu de faire échouer les neuf autres —
 * l'appelant annonce alors « N attribués, M ignorés » avec de vrais compteurs.
 * En revanche une violation catégorique (attribuer à quelqu'un d'autre sans
 * `team:manage`) reste un refus franc : ce n'est pas une ligne qui pose
 * problème, c'est le geste.
 */
@Injectable()
export class ContactAssignmentService {
  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AccountTeamScopeEntity)
    private readonly scopes: Repository<AccountTeamScopeEntity>,
    @InjectRepository(AccountTeamMemberEntity)
    private readonly teamMembers: Repository<AccountTeamMemberEntity>,
  ) {}

  async assignMany(
    userId: string,
    contactIds: readonly string[],
    assignedTo: string | null,
  ): Promise<ContactAssignmentResult> {
    // #2160.9 — même doctrine que le signalement (`feedback.controller.ts`) et
    // le dépôt RAG (`rag.controller.ts`) : le refus vient AVANT toute lecture.
    // La salle de démonstration n'a — délibérément — qu'un seul occupant
    // (`DEMO_OWNER`) : il n'y a jamais personne d'autre à qui attribuer, ni de
    // qui retirer, et écrire ici écrirait pour de vrai dans le jeu partagé.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException(
        "L'attribution est désactivée dans l'espace de démonstration : la salle n'a qu'un seul occupant, il n'y a personne d'autre à qui attribuer un contact ou de qui le retirer.",
      )
    }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const requestedIds = [...new Set(contactIds)]
    const isManager = hasPermission(role, 'team:manage')

    if (!isManager) this.assertSelfServeGesture(role, userId, assignedTo)

    // Le scoping workspace EST la barrière de sécurité : l'API se connecte en
    // `postgres` (BYPASSRLS), la policy RLS n'est qu'un filet. On ne cherche
    // JAMAIS un contact par son id seul.
    const rows = await this.contacts.find({
      where: { id: In(requestedIds), workspace_id: workspaceId },
      select: ['id', 'assigned_to'],
    })
    if (rows.length === 0) throw new NotFoundException('Aucun contact de cette sélection dans cet espace de travail')

    // Seulement quand on désigne réellement quelqu'un. Libérer n'a pas de cible
    // à valider.
    if (assignedTo !== null) {
      const membership = await this.workspaceContext.getMembership(assignedTo, workspaceId)
      if (!membership) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
    }

    const known = new Map(rows.map(row => [row.id, row.assigned_to ?? null]))
    const assigned: string[] = []
    const skipped: string[] = []
    for (const id of requestedIds) {
      // Hors workspace (ou inexistant) : rapporté, jamais écrit ni révélé.
      if (!known.has(id)) {
        skipped.push(id)
        continue
      }
      if (isManager || this.selfServeAllows(userId, known.get(id) ?? null, assignedTo)) assigned.push(id)
      else skipped.push(id)
    }

    if (assigned.length > 0) {
      await this.contacts.update({ id: In(assigned) }, { assigned_to: assignedTo })
    }

    return { assigned_to: assignedTo, assigned, skipped }
  }

  /**
   * Le geste lui-même, indépendamment des lignes : un non-manager ne peut que
   * se servir (prendre pour lui) ou libérer. Attribuer à un tiers est un acte de
   * management — refusé franchement, avant toute lecture.
   */
  private assertSelfServeGesture(
    role: Parameters<typeof hasPermission>[0],
    userId: string,
    assignedTo: string | null,
  ): void {
    if (!hasPermission(role, 'analysis:run')) {
      throw new ForbiddenException('Votre rôle ne permet pas de porter un contact')
    }
    if (assignedTo !== null && assignedTo !== userId) {
      throw new ForbiddenException("Seul un manager peut attribuer un contact à quelqu'un d'autre")
    }
  }

  /** Ligne par ligne : on ne prend pas et on ne libère pas celui d'un collègue. */
  private selfServeAllows(userId: string, currentHolder: string | null, assignedTo: string | null): boolean {
    if (assignedTo === null) return currentHolder === userId
    return currentHolder === null || currentHolder === userId
  }

  /* ------------------- #4996 L5 — pré-assignation selon les zones ------------------- */

  /**
   * Ordre du sélecteur de porteur d'un contact : les membres dont une zone couvre SON entité, ou (#4996.4) la BU de
   * SON compte, d'abord (avec le libellé « couvre … »), tous les autres ensuite — l'union des deux. Personne n'est
   * caché ; rien n'est présélectionné ni écrit.
   */
  async assigneeCandidates(userId: string, contactId: string) {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspace_id: workspaceId },
      select: ['id', 'entity_id', 'account_id'],
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace de travail')
    const members = await this.workspaceContext.listMembers(userId)
    const named = members.map(m => ({ user_id: m.userId, name: m.fullName ?? m.email ?? m.userId }))
    const account = contact.account_id
      ? await this.accounts.findOne({
          where: { id: contact.account_id, workspace_id: workspaceId },
          select: ['id', 'business_unit_id'],
        })
      : null
    const businessUnitId = account?.business_unit_id ?? null
    const scopes =
      contact.account_id && (contact.entity_id || businessUnitId)
        ? await this.activeScopes(workspaceId, contact.account_id)
        : []
    return { items: orderAssigneeCandidates(named, scopes, contact.entity_id ?? null, businessUnitId) }
  }

  /** Aperçu figé : qui recevrait quoi. N'écrit rien. L'empreinte couvre l'état lu (contacts libres + zones). */
  async distributePreview(userId: string, accountId: string): Promise<DistributePreviewResponse> {
    const { scopes, plan } = await this.planFor(userId, accountId)
    const members = await this.workspaceContext.listMembers(userId)
    const names = new Map(members.map(m => [m.userId, m.fullName ?? m.email ?? null]))
    const byUser = new Map<string, number>()
    for (const a of plan.assignments) byUser.set(a.user_id, (byUser.get(a.user_id) ?? 0) + 1)
    const groups = [...byUser].map(([user_id, count]) => ({
      user_id,
      name: names.get(user_id) ?? null,
      labels: [...new Set(scopes.filter(s => s.user_id === user_id && s.entity_id !== null).map(s => s.label))],
      count,
    }))
    groups.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'fr'))
    return { fingerprint: fingerprintOf(plan), groups, unchanged_count: plan.unchanged.length }
  }

  /**
   * Applique l'aperçu validé. L'état est RELU : si l'empreinte a changé, 409, rien n'est écrit. L'écriture porte
   * `assigned_to IS NULL` : on ne retire jamais un contact à quelqu'un, même en course.
   */
  async distributeApply(userId: string, accountId: string, fingerprint: string): Promise<DistributeApplyResponse> {
    const { workspaceId, plan } = await this.planFor(userId, accountId)
    if (fingerprintOf(plan) !== fingerprint) {
      throw new ConflictException("L'aperçu n'est plus à jour : relancez « Répartir selon les périmètres ».")
    }
    const byUser = new Map<string, string[]>()
    for (const a of plan.assignments) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a.contact_id])
    let applied = 0
    for (const [holder, ids] of byUser) {
      const res = await this.contacts.update(
        { id: In(ids), workspace_id: workspaceId, account_id: accountId, assigned_to: IsNull() },
        { assigned_to: holder },
      )
      applied += res.affected ?? 0
    }
    return { applied }
  }

  private async planFor(userId: string, accountId: string) {
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      throw new BadRequestException("La répartition est désactivée dans l'espace de démonstration.")
    }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({
      where: { id: accountId, workspace_id: workspaceId },
      select: ['id', 'assigned_to'],
    })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace de travail')
    if (!canEditAccountTeam(role, userId, account)) {
      throw new ForbiddenException('Seul le responsable du compte ou un manager peut répartir ses contacts')
    }
    const [contacts, allScopes, team] = await Promise.all([
      this.contacts.find({
        where: { workspace_id: workspaceId, account_id: accountId, assigned_to: IsNull(), deleted_at: IsNull() },
        select: ['id', 'entity_id', 'assigned_to'],
      }),
      this.activeScopes(workspaceId, accountId),
      this.teamMembers.find({
        where: { workspace_id: workspaceId, account_id: accountId, removed_at: IsNull() },
        select: ['user_id'],
      }),
    ])
    // Une zone ne compte que si son porteur est encore du compte (responsable ou co-équipier actif).
    const onTeam = new Set([...team.map(t => t.user_id), ...(account.assigned_to ? [account.assigned_to] : [])])
    const scopes = allScopes.filter(s => onTeam.has(s.user_id))
    const plan = planScopeDistribution(
      contacts.map(c => ({ id: c.id, entity_id: c.entity_id ?? null, assigned_to: c.assigned_to ?? null })),
      scopes,
    )
    return { workspaceId, scopes, plan }
  }

  private async activeScopes(workspaceId: string, accountId: string): Promise<DistributionScope[]> {
    const rows = await this.scopes.find({
      where: { workspace_id: workspaceId, account_id: accountId, removed_at: IsNull() },
      select: ['user_id', 'entity_id', 'business_unit_id', 'label'],
    })
    return rows.map(r => ({
      user_id: r.user_id,
      entity_id: r.entity_id ?? null,
      business_unit_id: r.business_unit_id ?? null,
      label: r.label,
    }))
  }
}

/** Empreinte d'un plan : change dès qu'un contact libre, une zone ou un porteur change. */
function fingerprintOf(plan: DistributionPlan): string {
  const lines = [
    ...plan.assignments.map(a => `${a.contact_id}>${a.user_id}`),
    ...plan.unchanged.map(id => `${id}=`),
  ].sort()
  return createHash('sha256').update(lines.join('\n')).digest('hex')
}
