import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, type FindOptionsWhere, type ObjectLiteral, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import type {
  HandoverAllocation,
  HandoverPlan,
  HandoverPlanLine,
  HandoverPlanResult,
  MemberPortfolio,
  PortfolioHandoverKind,
  PortfolioHandoverResult,
  PortfolioHolding,
  WorkspaceTeamMember,
} from '@bellum/contracts'
import { PORTFOLIO_HANDOVER_KINDS, PORTFOLIO_PERSONAL_KINDS, can } from '@bellum/contracts'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { WorkspaceContextService } from './workspace-context.service'

/** La colonne qui porte le RESPONSABLE d'un objet. Deux noms historiques, une
 *  seule notion — les unifier demanderait une migration sur six tables. */
type OwnerColumn = 'assigned_to' | 'owner_id'

/**
 * La colonne de porteur, PAR NATURE — la seule table de correspondance.
 *
 * Typée `Record<PortfolioHandoverKind, …>` exprès : une nature ajoutée au
 * contrat et oubliée ici ne compile pas. C'est la forme la plus forte de garde,
 * celle qui n'a besoin d'aucun test pour dire NON.
 *
 * ⚠️ Chaque table nommée ici porte AUSSI une colonne `workspace_id` — sans elle,
 * l'écriture ne pourrait pas être bornée à l'espace. `action_plan_items` porte
 * un `assigned_to` et n'y est PAS pour cette raison exacte : la table se
 * rattache à un compte, pas à un espace, et un `UPDATE` non bornable est un
 * défaut d'isolation, pas un raccourci.
 */
export const PORTFOLIO_HOLDING_COLUMNS: Readonly<Record<PortfolioHandoverKind, OwnerColumn>> = {
  accounts: 'assigned_to',
  contacts: 'assigned_to',
  tasks: 'owner_id',
  opportunities: 'owner_id',
  needs: 'owner_id',
  missions: 'owner_id',
  // #4158.29 — action_plan_items : bornée par le COMPTE (voir `actionHolding`).
  actions: 'assigned_to',
  followups: 'assigned_to',
}

/** Une nature d'objet portable : comment la compter, comment la transmettre. */
type Holding = {
  kind: PortfolioHandoverKind
  column: OwnerColumn
  count: (workspaceId: string, userId: string, ids?: readonly string[]) => Promise<number | null>
  transfer: (workspaceId: string, from: string, to: string, ids?: readonly string[]) => Promise<number | null>
}

/**
 * LA SORTIE D'UN UTILISATEUR — reprendre un portefeuille (tome 8 §33, n°2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT AVANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `WorkspaceTeamService.removeMember` supprimait la ligne d'appartenance et
 * **libérait** le portefeuille : `assigned_to = NULL` sur les comptes et les
 * contacts, rien sur les tâches, les opportunités, les besoins et les missions.
 * C'était le geste honnête faute de mieux — mais un espace qui perd un
 * commercial se retrouvait avec quarante comptes sans porteur dans une file, et
 * personne pour dire lesquels reviennent à qui. « Le produit a-t-il capturé le
 * travail, ou était-il dans la tête du parti ? » : la réponse était « la moitié ».
 *
 * Ce service ajoute le geste qui manquait — **désigner un successeur** — sans
 * retirer l'autre : libérer reste ce que fait un retrait sans reprise.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA LIGNE, ET POURQUOI ELLE EST LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce service ne touche QUE la colonne de porteur de six tables. Il ne touche :
 *
 *  - **ni ce qui a été APPRIS** (angles, notes, historique, faits d'accès,
 *    mémoire épinglée de Laura) : ces lignes sont lues par `workspace_id`,
 *    `user_id` n'y est que l'AUTEUR. Elles survivent au départ sans qu'aucune
 *    écriture ne soit nécessaire — et réécrire leur auteur mentirait sur qui a
 *    appris quoi ;
 *  - **ni ce qui est PERSONNEL** : la messagerie et l'agenda connectés, les
 *    conversations avec le copilote, les préférences. **Une boîte mail est
 *    PERSONNELLE (D58)** et **le corps des messages ne sort jamais vers un
 *    humain ni vers le modèle (D65)**. Transmettre la boîte du partant à son
 *    successeur serait l'inverse exact de ces deux arbitrages.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS DISCIPLINES DE MISE EN ŒUVRE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **L'espace borne TOUT.** Les critères sont construits à UN seul endroit
 *    ({@link countIn} / {@link moveIn}), et cet endroit écrit toujours
 *    `workspace_id`. On ne peut donc pas l'oublier sur une nature : c'est une
 *    propriété de la structure, pas une consigne.
 * 2. **`null` n'est pas `0`.** Un comptage tombé, ou un pilote qui ne rend pas
 *    son nombre de lignes, rend `null`. Sur le geste le plus irréversible de
 *    l'écran Équipe, « ce membre ne porte rien » et « je n'ai pas su compter »
 *    ne peuvent pas s'écrire pareil.
 * 3. **Aucun `DELETE`.** On archive, on ne supprime pas : un transfert change un
 *    porteur, il n'efface aucune ligne.
 */
@Injectable()
export class WorkspacePortfolioHandoverService {
  private readonly logger = new Logger(WorkspacePortfolioHandoverService.name)

  constructor(
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    // Les six tables qui portent un RESPONSABLE. Ce sont des ENTITÉS partagées,
    // pas des services d'un autre module : la frontière de la règle #7 tient —
    // retirer ce service retire la reprise de portefeuille et rien d'autre.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(ProjectEntity)
    private readonly opportunities: Repository<ProjectEntity>,
    @InjectRepository(ProjectNeedEntity)
    private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(MissionEntity)
    private readonly missions: Repository<MissionEntity>,
    // #4158.29 — les étapes de plan déléguées et les relances de cadence. Pas de
    // `workspace_id` sur cette table : l'espace borne PAR LE COMPTE.
    @InjectRepository(ActionPlanItemEntity)
    private readonly actionItems: Repository<ActionPlanItemEntity>,
    // Journal d'activité — best-effort, `@Optional()` comme partout ailleurs
    // dans ce module : une ligne d'audit qui tombe ne défait pas un transfert
    // déjà écrit.
    @Optional() private readonly analytics?: ProductAnalyticsService,
  ) {}

  /**
   * `GET /workspaces/members/:userId/portfolio` — ce que ce membre porte.
   *
   * Elle existe pour une raison précise : le transfert déplace des dizaines
   * d'objets en un clic. **Un geste irréversible sans prévisualisation de ce
   * qu'il déplace est un piège**, et l'écran montre ce tableau avant de demander
   * confirmation.
   */
  async preview(userId: string, targetUserId: string): Promise<MemberPortfolio> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const target = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: targetUserId } })
    if (!target) throw new NotFoundException('Membre introuvable')

    const profile = await this.profiles.findOne({ where: { user_id: targetUserId } })
    const holdings: PortfolioHolding[] = []
    for (const holding of this.holdings()) {
      holdings.push({ kind: holding.kind, count: await holding.count(workspaceId, targetUserId) })
    }

    return {
      userId: targetUserId,
      email: profile?.email ?? null,
      fullName: fullNameOf(profile),
      holdings,
      personal: [...PORTFOLIO_PERSONAL_KINDS],
      eligibleSuccessors: await this.eligibleSuccessors(workspaceId, targetUserId),
    }
  }

  /**
   * `POST /workspaces/members/:userId/handover` — le geste explicite.
   *
   * Trois refus, tous AVANT la moindre écriture : un successeur hors de
   * l'espace, le porteur lui-même, un rôle qui ne porte aucun portefeuille. Un
   * transfert à moitié écrit puis refusé serait pire que refusé d'emblée.
   *
   * Le membre sortant n'est PAS retiré ici. Reprendre un portefeuille et retirer
   * un siège sont deux décisions : on reprend souvent AVANT le départ (préavis),
   * et on retire parfois sans reprendre (le portefeuille retourne alors dans la
   * file des non-attribués, ce que fait déjà `removeMember`).
   */
  async handOver(userId: string, fromUserId: string, toUserId: string): Promise<PortfolioHandoverResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const from = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: fromUserId } })
    if (!from) throw new NotFoundException('Membre introuvable')
    if (fromUserId === toUserId) {
      throw new BadRequestException('Un portefeuille ne peut pas être transféré à son propre porteur')
    }

    const to = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: toUserId } })
    if (!to) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
    if (!(await this.carriesAPortfolio(workspaceId, to.user_id, to.role))) {
      throw new BadRequestException('Ce membre ne peut pas porter de portefeuille')
    }

    const transferred: PortfolioHolding[] = []
    for (const holding of this.holdings()) {
      transferred.push({ kind: holding.kind, count: await holding.transfer(workspaceId, fromUserId, toUserId) })
    }

    // Journal d'activité — le geste le plus lourd de l'écran Équipe, et le seul
    // dont on ait besoin de retrouver l'auteur six mois plus tard. Best-effort :
    // le transfert est déjà écrit, une ligne d'audit qui tombe ne le défait pas.
    try {
      void this.analytics?.track('portfolio_handed_over', {
        userId,
        workspaceId,
        properties: {
          target: toUserId,
          fromUserId,
          toUserId,
          // Les comptes par nature, pour que le journal dise ce qui a bougé.
          moved: transferred.reduce<Record<string, number | null>>((acc, holding) => {
            acc[holding.kind] = holding.count
            return acc
          }, {}),
        },
      })
    } catch (error) {
      this.logger.warn(`portfolio_handed_over journal write skipped (${(error as Error).message})`)
    }

    return { fromUserId, toUserId, transferred }
  }

  /**
   * #4158.29 — `POST /workspaces/members/:userId/handover-plan` : répartir le
   * portefeuille d'un partant entre UN OU PLUSIEURS collègues, par lots.
   *
   * `confirm: false` → récapitulatif : on COMPTE ce qui bougerait, par nature et
   * par destinataire, sans rien écrire. `confirm: true` → la validation. Toutes
   * les vérifications (membre, destinataire éligible, lots qui se marchent
   * dessus) passent AVANT la première écriture. Rien n'est supprimé.
   */
  async plan(userId: string, fromUserId: string, plan: HandoverPlan): Promise<HandoverPlanResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertPermission(userId, workspaceId, 'team:manage')

    const from = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: fromUserId } })
    if (!from) throw new NotFoundException('Membre introuvable')

    this.assertAllocationsDoNotOverlap(plan.allocations)

    const recipients = new Set(plan.allocations.map(allocation => allocation.toUserId))
    for (const recipient of recipients) {
      if (recipient === fromUserId) {
        throw new BadRequestException('Un portefeuille ne peut pas être transféré à son propre porteur')
      }
      const member = await this.members.findOne({ where: { workspace_id: workspaceId, user_id: recipient } })
      if (!member) throw new BadRequestException("Ce membre n'appartient pas à l'espace de travail")
      if (!(await this.carriesAPortfolio(workspaceId, member.user_id, member.role))) {
        throw new BadRequestException('Ce membre ne peut pas porter de portefeuille')
      }
    }

    const lines: HandoverPlanLine[] = []
    for (const allocation of plan.allocations) {
      const holding = this.holdingFor(allocation.kind)
      const count = plan.confirm
        ? await holding.transfer(workspaceId, fromUserId, allocation.toUserId, allocation.ids)
        : await holding.count(workspaceId, fromUserId, allocation.ids)
      lines.push({ kind: allocation.kind, toUserId: allocation.toUserId, count })
    }

    if (plan.confirm) {
      try {
        void this.analytics?.track('portfolio_handed_over', {
          userId,
          workspaceId,
          properties: {
            target: fromUserId,
            fromUserId,
            batched: true,
            moved: lines.map(line => ({ kind: line.kind, toUserId: line.toUserId, count: line.count })),
          },
        })
      } catch (error) {
        this.logger.warn(`portfolio_handed_over journal write skipped (${(error as Error).message})`)
      }
    }

    return { fromUserId, confirmed: plan.confirm, lines }
  }

  /** Pour une nature : un seul lot « tout », OU plusieurs lots à identifiants disjoints — jamais les deux. */
  private assertAllocationsDoNotOverlap(allocations: readonly HandoverAllocation[]): void {
    const byKind = new Map<string, HandoverAllocation[]>()
    for (const allocation of allocations) {
      byKind.set(allocation.kind, [...(byKind.get(allocation.kind) ?? []), allocation])
    }
    for (const group of byKind.values()) {
      const whole = group.filter(allocation => !allocation.ids)
      if (whole.length > 1 || (whole.length === 1 && group.length > 1)) {
        throw new BadRequestException('Une nature ne peut pas être attribuée deux fois')
      }
      const seen = new Set<string>()
      for (const allocation of group) {
        for (const id of allocation.ids ?? []) {
          if (seen.has(id)) throw new BadRequestException('Un même objet ne peut pas avoir deux destinataires')
          seen.add(id)
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Internals                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Les natures portables, et comment chacune se compte et se transmet.
   *
   * ⚠️ La liste est DÉRIVÉE de `PORTFOLIO_HANDOVER_KINDS`, jamais recopiée : une
   * nature déclarée au contrat mais absente ici s'afficherait comme un trou, et
   * une nature ici absente du contrat ne voyagerait pas. Le `switch` exhaustif
   * de {@link holdingFor} fait échouer la COMPILATION dans le premier cas.
   */
  private holdings(): readonly Holding[] {
    return PORTFOLIO_HANDOVER_KINDS.map(kind => this.holdingFor(kind))
  }

  private holdingFor(kind: PortfolioHandoverKind): Holding {
    const column = PORTFOLIO_HOLDING_COLUMNS[kind]
    switch (kind) {
      case 'accounts':
        return this.holding(kind, this.accounts, column)
      case 'contacts':
        return this.holding(kind, this.contacts, column)
      case 'tasks':
        return this.holding(kind, this.tasks, column)
      case 'opportunities':
        return this.holding(kind, this.opportunities, column)
      case 'needs':
        return this.holding(kind, this.needs, column)
      case 'missions':
        return this.holding(kind, this.missions, column)
      case 'actions':
      case 'followups':
        return this.actionHolding(kind)
    }
  }

  private holding<T extends ObjectLiteral>(
    kind: PortfolioHandoverKind,
    repository: Repository<T>,
    column: OwnerColumn,
  ): Holding {
    return {
      kind,
      column,
      count: (workspaceId, userId, ids) => this.countIn(repository, column, workspaceId, userId, ids),
      transfer: (workspaceId, from, to, ids) => this.moveIn(repository, column, workspaceId, from, to, ids),
    }
  }

  /**
   * #4158.29 — les étapes de plan déléguées (`actions`) et les relances de
   * cadence (`followups`), ENCORE OUVERTES.
   *
   * `action_plan_items` n'a pas de colonne `workspace_id` : l'espace borne PAR LE
   * COMPTE (`account_id IN (comptes de l'espace)`), jamais par le seul porteur —
   * sinon l'`UPDATE` toucherait le portefeuille d'un homonyme d'une autre ESN.
   * Ouverte = ni faite ni obsolète. Une action déjà faite garde son délégataire :
   * c'est de l'historique, on n'y touche pas.
   */
  private actionHolding(kind: 'actions' | 'followups'): Holding {
    const cadence = kind === 'followups' ? 'cadence_step IS NOT NULL' : 'cadence_step IS NULL'
    // Les clauses sont écrites SANS alias : le même jeu sert au `SELECT COUNT` et à l'`UPDATE`.
    const bound = (workspaceId: string, owner: string, ids?: readonly string[]) => ({
      clauses: [
        ['assigned_to = :owner', { owner }],
        ['account_id IN (SELECT a.id FROM accounts a WHERE a.workspace_id = :workspaceId)', { workspaceId }],
        ["done = false AND execution_status NOT IN ('done', 'obsolete')", {}],
        [cadence, {}],
        ...(ids ? [['id IN (:...ids)', { ids: [...ids] }] as const] : []),
      ] as ReadonlyArray<readonly [string, Record<string, unknown>]>,
    })
    return {
      kind,
      column: 'assigned_to',
      count: async (workspaceId, userId, ids) => {
        try {
          const qb = this.actionItems.createQueryBuilder('i')
          for (const [clause, params] of bound(workspaceId, userId, ids).clauses) qb.andWhere(clause, params)
          return await qb.getCount()
        } catch (error) {
          this.logger.error(`Portefeuille non comptable sur ${kind} (${(error as Error).message})`, { error })
          return null
        }
      },
      transfer: async (workspaceId, from, to, ids) => {
        try {
          // UN seul UPDATE, borné par le compte de l'espace ET par le porteur sortant.
          const qb = this.actionItems.createQueryBuilder().update().set({ assigned_to: to })
          for (const [clause, params] of bound(workspaceId, from, ids).clauses) qb.andWhere(clause, params)
          const result = await qb.execute()
          return typeof result?.affected === 'number' ? result.affected : null
        } catch (error) {
          this.logger.error(`Reprise de portefeuille échouée sur ${kind} (${(error as Error).message})`, { error })
          return null
        }
      },
    }
  }

  /**
   * Combien d'objets de cette table ce membre porte, DANS CET ESPACE.
   *
   * ⚠️ `null` sur échec, jamais `0`. Un `catch` qui rendrait `0` ferait lire
   * « ce membre ne porte rien, on peut le retirer sans risque » à une base
   * indisponible — et l'administrateur cliquerait. `error` et non `warn` : un
   * comptage qui tombe sur cet écran doit remonter à la supervision.
   */
  private async countIn<T extends ObjectLiteral>(
    repository: Repository<T>,
    column: OwnerColumn,
    workspaceId: string,
    userId: string,
    ids?: readonly string[],
  ): Promise<number | null> {
    try {
      return await repository.count({
        where: {
          workspace_id: workspaceId,
          [column]: userId,
          ...(ids ? { id: In([...ids]) } : {}),
        } as unknown as FindOptionsWhere<T>,
      })
    } catch (error) {
      this.logger.error(`Portefeuille non comptable sur ${column} (${(error as Error).message})`, { error })
      return null
    }
  }

  /**
   * Réattribue les objets de cette table, DANS CET ESPACE et pour CE porteur.
   *
   * Deux `null` distincts, tous deux honnêtes : l'écriture a échoué, ou le
   * pilote n'a pas rendu son nombre de lignes. Dans les deux cas on ignore
   * combien ont bougé — et l'annoncer « 0 » ferait croire qu'il n'y avait rien
   * à transférer. Les autres natures continuent : un transfert partiel se DIT,
   * il ne s'annule pas en silence.
   */
  private async moveIn<T extends ObjectLiteral>(
    repository: Repository<T>,
    column: OwnerColumn,
    workspaceId: string,
    from: string,
    to: string,
    ids?: readonly string[],
  ): Promise<number | null> {
    try {
      // Les deux conversions portent sur un objet dont la CLÉ est dynamique
      // (`column`) : TypeScript ne peut pas prouver qu'elle appartient à `T`,
      // et la garde de doctrine vérifie à sa place que `workspace_id` y est
      // toujours. Elles sont ici et nulle part ailleurs, exprès.
      const where = {
        workspace_id: workspaceId,
        [column]: from,
        ...(ids ? { id: In([...ids]) } : {}),
      } as unknown as FindOptionsWhere<T>
      const patch = { [column]: to } as unknown as QueryDeepPartialEntity<T>
      const result = await repository.update(where, patch)
      return typeof result?.affected === 'number' ? result.affected : null
    } catch (error) {
      this.logger.error(`Reprise de portefeuille échouée sur ${column} (${(error as Error).message})`, { error })
      return null
    }
  }

  /**
   * Qui peut recevoir ce portefeuille.
   *
   * `analysis:run` est le témoin de « porte un portefeuille du tout » — c'est le
   * même que celui d'`AccountAssignmentService`, délibérément : deux chemins qui
   * refont la même dérivation divergent. Il est tenu par tous les rôles
   * opérationnels, par aucun `viewer` (aucune permission) ni `tech_admin`
   * (intégrations seulement).
   *
   * Lu par `can()` — le rôle PLUS les accords nominatifs — et non par
   * `hasPermission()` seul : sinon l'écran ne proposerait pas un membre que
   * l'API accepterait, ce qui est la divergence exacte qu'on veut éviter.
   */
  private async eligibleSuccessors(workspaceId: string, excludeUserId: string): Promise<WorkspaceTeamMember[]> {
    const rows = await this.members.find({ where: { workspace_id: workspaceId }, order: { created_at: 'ASC' } })
    const candidates: WorkspaceMemberEntity[] = []
    for (const row of rows) {
      if (row.user_id === excludeUserId) continue
      if (await this.carriesAPortfolio(workspaceId, row.user_id, row.role)) candidates.push(row)
    }
    if (candidates.length === 0) return []

    const profiles = await this.profiles.find({ where: { user_id: In(candidates.map(row => row.user_id)) } })
    const byUser = new Map(profiles.map(profile => [profile.user_id, profile]))
    return candidates.map(row => {
      const profile = byUser.get(row.user_id)
      return {
        userId: row.user_id,
        email: profile?.email ?? null,
        fullName: fullNameOf(profile),
        role: row.role,
        joinedAt: toIso(row.created_at),
      }
    })
  }

  private async carriesAPortfolio(
    workspaceId: string,
    userId: string,
    role: WorkspaceMemberEntity['role'],
  ): Promise<boolean> {
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    return can(role, extra, 'analysis:run')
  }
}

/** `first last`, trimmed, ou `null` quand ni l'un ni l'autre n'est renseigné. */
function fullNameOf(
  profile: { first_name?: string | null; last_name?: string | null } | null | undefined,
): string | null {
  const full = [profile?.first_name, profile?.last_name]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(' ')
    .trim()
  return full.length > 0 ? full : null
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date(0).toISOString()
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}
