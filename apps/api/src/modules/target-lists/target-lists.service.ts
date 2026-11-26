import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import {
  countTargetListItems,
  recentAccountFacts,
  type AccountFactBrief,
  deriveTargetListType,
  portfolioScopeFor,
  type AddTargetListItem,
  type CreateTargetList,
  type RemoveTargetListItem,
  type TargetCandidate,
  type TargetCandidatesResponse,
  type TargetList,
  type TargetListCounts,
  type TargetListItem,
  type TargetListsResponse,
  type SellerHypotheses,
  type TargetPriority,
  type TargetProvenance,
  type TargetTierLabel,
  type TargetWorkStatus,
  type UpdateTargetList,
  type UpdateTargetListItem,
} from '@bellum/contracts'
import { TargetListEntity } from '../../database/entities/target-list.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

type ItemRow = {
  id: string
  target_list_id: string
  account_id: string | null
  contact_id: string | null
  account_name: string | null
  contact_name: string | null
  contact_company: string | null
  selection_reason: string | null
  priority: TargetPriority | null
  tier_label?: TargetTierLabel | null
  seller_hypotheses?: SellerHypotheses | null
  owner_user_id: string | null
  work_status: TargetWorkStatus
  provenance: TargetProvenance
  refreshed_at: Date | string | null
  removed_at: Date | string | null
  removal_reason: string | null
  next_action: string | null
  notes: string | null
  created_at: Date | string
  updated_at: Date | string
}

/** #4072.5 — bornes de la lecture des faits : comptes distincts par réponse, lectures simultanées. */
const FACTS_MAX_ACCOUNTS = 60
const FACTS_BATCH = 5

type Scope = { ownerId: string; includeUnassigned: true } | null

/**
 * #2155.15 — le libellé d'un élément est LU sur la fiche canonique, jamais
 * recopié : la jointure est la seule source du nom affiché.
 */
const ITEM_SELECT = `
  SELECT i.id, i.target_list_id, i.account_id, i.contact_id, i.selection_reason, i.priority, i.tier_label, i.seller_hypotheses, i.owner_user_id,
         i.work_status, i.provenance, i.refreshed_at, i.removed_at, i.removal_reason,
         i.next_action, i.notes, i.created_at, i.updated_at,
         a.company_name AS account_name, c.full_name AS contact_name, ca.company_name AS contact_company
    FROM target_list_items i
    LEFT JOIN accounts a ON a.id = i.account_id
    LEFT JOIN contacts c ON c.id = i.contact_id
    LEFT JOIN accounts ca ON ca.id = c.account_id`

const CANDIDATE_LIMIT = 8

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

/** `null` reste `null` : une date absente n'est pas une date d'aujourd'hui. */
function isoOrNull(value: Date | string | null): string | null {
  return value == null ? null : iso(value)
}

function toItemWire(row: ItemRow): TargetListItem {
  const isAccount = row.account_id != null
  return {
    id: row.id,
    target_list_id: row.target_list_id,
    kind: isAccount ? 'account' : 'contact',
    ref_id: (isAccount ? row.account_id : row.contact_id) ?? '',
    label: isAccount ? row.account_name : row.contact_name,
    sublabel: isAccount ? null : row.contact_company,
    selection_reason: row.selection_reason ?? null,
    priority: row.priority ?? null,
    tier_label: row.tier_label ?? null,
    seller_hypotheses: row.seller_hypotheses ?? null,
    owner_user_id: row.owner_user_id ?? null,
    work_status: row.work_status,
    provenance: row.provenance,
    refreshed_at: isoOrNull(row.refreshed_at ?? null),
    removed_at: isoOrNull(row.removed_at ?? null),
    removal_reason: row.removal_reason ?? null,
    next_action: row.next_action ?? null,
    notes: row.notes ?? null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  }
}

/**
 * #2156.8 / .17 à .19 — le type et les compteurs sont DÉRIVÉS, jamais stockés.
 *
 * `counts` est la réponse honnête à « si on ne sait pas, est-ce que 0 est
 * VRAI ? » : quand le cloisonnement de portefeuille masque une partie des
 * comptes d'une liste partagée, on ne compte plus la liste — on compte ce qu'on
 * voit, ce qui n'est pas la même chose. Le `type` reste dérivé de ce que
 * l'appelant voit : une liste dont il voit trois comptes EST une liste de
 * comptes pour lui, et `counts` porte l'aveu de ce qui manque.
 */
function toListWire(list: TargetListEntity, items: TargetListItem[], counts: TargetListCounts): TargetList {
  return {
    id: list.id,
    name: list.name,
    objective: list.objective ?? null,
    type: deriveTargetListType(items),
    owner_user_id: list.owner_user_id ?? null,
    team: list.team ?? null,
    visibility: list.visibility,
    source: list.source,
    source_query: list.source_query ?? null,
    status: list.status,
    counts,
    next_action: list.next_action ?? null,
    sequence_id: list.sequence_id ?? null,
    prospecting_session_id: list.prospecting_session_id ?? null,
    created_by: list.created_by,
    created_at: iso(list.created_at),
    updated_at: iso(list.updated_at),
    items,
  }
}

/**
 * #2156.11 — la visibilité est une AUTORISATION.
 *
 * Deux branches, et seulement deux : ce que l'espace partage, et ce que
 * l'appelant a créé. Une liste `private` d'un collègue ne remonte d'AUCUNE
 * requête — pas même par son identifiant, où elle répond 404 comme si elle
 * n'existait pas (on ne confirme pas son existence).
 */
function visibleListWhere(workspaceId: string, userId: string): Record<string, unknown>[] {
  return [
    { workspace_id: workspaceId, visibility: 'workspace' },
    { workspace_id: workspaceId, created_by: userId },
  ]
}

/** Le joker tapé par l'utilisateur est un caractère, pas un motif. */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, char => `\\${char}`)}%`
}

/**
 * #2155.13 à .21 — « Mes cibles ».
 *
 * Tout passe par l'espace ACTIF de l'appelant : une liste, un élément ou une
 * fiche d'un autre espace répond 404, jamais 403 (on ne confirme pas qu'elle
 * existe). Le cloisonnement de portefeuille (D5) s'applique aux comptes, par la
 * même fonction pure que la liste des comptes (`portfolioScopeFor`).
 */
@Injectable()
export class TargetListsService {
  constructor(
    @InjectRepository(TargetListEntity)
    private readonly lists: Repository<TargetListEntity>,
    @InjectRepository(TargetListItemEntity)
    private readonly items: Repository<TargetListItemEntity>,
    private readonly dataSource: DataSource,
    private readonly workspaceContext: WorkspaceContextService,
    // #4072.5 — le lecteur UNIQUE des faits du compte (#4069.1), jamais un second.
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
  ) {}

  private readonly logger = new Logger(TargetListsService.name)

  /**
   * #4072.5 — les 3 faits les plus récents de chaque compte de la réponse.
   * Bornée (comptes distincts, par lots) : la liste ne doit pas attendre un
   * dossier entier. Un compte sans fait, ou dont la lecture échoue, n'a PAS de
   * clé — une absence ne fait aucune ligne.
   */
  private async recentFactsByAccount(
    workspaceId: string,
    userId: string,
    accountIds: readonly string[],
  ): Promise<Map<string, AccountFactBrief[]>> {
    const out = new Map<string, AccountFactBrief[]>()
    const reader = this.accountFacts
    if (!reader) return out
    const ids = [...new Set(accountIds)].slice(0, FACTS_MAX_ACCOUNTS)
    // Lecture groupée quand le lecteur la porte : la mémoire marché se lit en un `IN` par
    // table, pas trois requêtes par compte (N+1 mesuré sur GET /target-lists).
    if (reader.forAccounts) {
      try {
        const many = await reader.forAccounts({ workspaceId, userId, accountIds: ids })
        for (const [accountId, read] of many) {
          const recent = recentAccountFacts(read?.facts ?? [], 3)
          if (recent.length > 0) out.set(accountId, recent)
        }
      } catch (error) {
        this.logger.warn('faits récents illisibles pour les cibles', { error })
      }
      return out
    }
    for (let i = 0; i < ids.length; i += FACTS_BATCH) {
      await Promise.all(
        ids.slice(i, i + FACTS_BATCH).map(async accountId => {
          try {
            const read = await reader.forAccount({ workspaceId, userId, accountId })
            const recent = recentAccountFacts(read?.facts ?? [], 3)
            if (recent.length > 0) out.set(accountId, recent)
          } catch (error) {
            this.logger.warn('faits récents illisibles pour une cible', { error })
          }
        }),
      )
    }
    return out
  }

  async list(userId: string): Promise<TargetListsResponse> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const lists = await this.lists.find({
      where: visibleListWhere(workspaceId, userId),
      order: { created_at: 'ASC' },
    })
    if (lists.length === 0) return { lists: [] }
    const scope = await this.scopeFor(workspaceId, role, userId)
    const params: unknown[] = [workspaceId]
    // #2156.31 — un élément retiré garde sa trace en base, il ne revient pas
    // dans la liste de travail.
    let sql = `${ITEM_SELECT} WHERE i.workspace_id = $1 AND i.removed_at IS NULL`
    if (scope) {
      // Un compte hors du portefeuille visible ne s'affiche pas dans une liste
      // partagée — sans quoi la liste contournerait le cloisonnement.
      sql += ' AND (i.account_id IS NULL OR a.assigned_to = $2 OR a.assigned_to IS NULL)'
      params.push(scope.ownerId)
    }
    const rows = (await this.dataSource.query(`${sql} ORDER BY i.created_at ASC`, params)) as ItemRow[]
    const factsByAccount = await this.recentFactsByAccount(
      workspaceId,
      userId,
      rows.flatMap(row => (row.account_id ? [row.account_id] : [])),
    )
    const byList = new Map<string, TargetListItem[]>()
    for (const row of rows) {
      const bucket = byList.get(row.target_list_id) ?? []
      const recent = row.account_id ? factsByAccount.get(row.account_id) : undefined
      bucket.push(recent ? { ...toItemWire(row), recent_facts: recent } : toItemWire(row))
      byList.set(row.target_list_id, bucket)
    }
    return {
      lists: lists.map(list => {
        const items = byList.get(list.id) ?? []
        // GA-18 / GA-19 — sous cloisonnement, ce qu'on a lu n'est PAS la liste :
        // annoncer « 0 prêt à traiter » serait un chiffre faux, pas une absence.
        const counts: TargetListCounts = scope
          ? { measured: false, gap: 'portfolio_restricted' }
          : countTargetListItems(items)
        return toListWire(list, items, counts)
      }),
    }
  }

  async createList(userId: string, body: CreateTargetList): Promise<TargetList> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertMember(userId, workspaceId)
    if (body.owner_user_id) await this.assertOwner(body.owner_user_id, workspaceId)
    const saved = await this.lists.save(
      this.lists.create({
        workspace_id: workspaceId,
        created_by: userId,
        name: body.name,
        objective: body.objective ?? null,
        owner_user_id: body.owner_user_id ?? null,
        team: body.team ?? null,
        // #2156.11 / .12 / .16 — une liste neuve est un BROUILLON, visible de
        // l'espace, saisie à la main : les trois défauts de la migration.
        visibility: body.visibility ?? 'workspace',
        source: body.source ?? 'manual',
        source_query: body.source_query ?? null,
        status: body.status ?? 'draft',
        next_action: body.next_action ?? null,
        sequence_id: body.sequence_id ?? null,
        prospecting_session_id: body.prospecting_session_id ?? null,
      }),
    )
    // Une liste neuve n'a aucun élément : le compte est VRAIMENT zéro ici.
    return toListWire(saved, [], countTargetListItems([]))
  }

  async updateList(userId: string, listId: string, body: UpdateTargetList): Promise<{ id: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const list = await this.findList(listId, workspaceId, userId)
    if (body.owner_user_id) await this.assertOwner(body.owner_user_id, workspaceId)
    if (body.name !== undefined) list.name = body.name
    if (body.objective !== undefined) list.objective = body.objective
    if (body.owner_user_id !== undefined) list.owner_user_id = body.owner_user_id
    if (body.team !== undefined) list.team = body.team
    if (body.visibility !== undefined) list.visibility = body.visibility
    if (body.status !== undefined) list.status = body.status
    if (body.next_action !== undefined) list.next_action = body.next_action
    if (body.sequence_id !== undefined) list.sequence_id = body.sequence_id
    if (body.prospecting_session_id !== undefined) list.prospecting_session_id = body.prospecting_session_id
    await this.lists.save(list)
    return { id: list.id }
  }

  /**
   * Supprime la liste et ses éléments (cascade) — jamais les fiches qu'ils
   * référencent. C'est un geste EXPLICITE de l'utilisateur ; ranger une liste
   * sans la perdre se fait par le statut `archived` (#2156.40).
   */
  async deleteList(userId: string, listId: string): Promise<{ id: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const list = await this.findList(listId, workspaceId, userId)
    await this.lists.delete({ id: list.id, workspace_id: workspaceId })
    return { id: list.id }
  }

  async addItem(userId: string, listId: string, body: AddTargetListItem): Promise<TargetListItem> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const list = await this.findList(listId, workspaceId, userId)

    const isAccount = body.kind === 'account'
    let rows: unknown[]
    if (isAccount) {
      const scope = await this.scopeFor(workspaceId, role, userId)
      const params: unknown[] = [body.ref_id, workspaceId]
      let sql = 'SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2'
      if (scope) {
        sql += ' AND (assigned_to = $3 OR assigned_to IS NULL)'
        params.push(scope.ownerId)
      }
      rows = (await this.dataSource.query(sql, params)) as unknown[]
    } else {
      rows = (await this.dataSource.query('SELECT id FROM contacts WHERE id = $1 AND workspace_id = $2', [
        body.ref_id,
        workspaceId,
      ])) as unknown[]
    }
    if (rows.length === 0) throw new NotFoundException('Fiche introuvable dans cet espace.')

    // #2156.31 — un élément RETIRÉ reste en base : il ne doit pas interdire à la
    // fiche de revenir dans la liste dont on l'avait sortie.
    const duplicate = await this.items.findOne({
      where: isAccount
        ? { target_list_id: list.id, account_id: body.ref_id, removed_at: IsNull() }
        : { target_list_id: list.id, contact_id: body.ref_id, removed_at: IsNull() },
    })
    if (duplicate) throw new ConflictException('Cette fiche est déjà dans la liste.')

    if (body.owner_user_id) await this.assertOwner(body.owner_user_id, workspaceId)

    let saved: TargetListItemEntity
    try {
      saved = await this.items.save(
        this.items.create({
          target_list_id: list.id,
          workspace_id: workspaceId,
          account_id: isAccount ? body.ref_id : null,
          contact_id: isAccount ? null : body.ref_id,
          selection_reason: body.selection_reason ?? null,
          priority: body.priority ?? null,
          // #3753 — la lettre du tier et les hypothèses du vendeur, telles que fournies.
          tier_label: body.tier_label ?? null,
          seller_hypotheses: body.seller_hypotheses ?? null,
          owner_user_id: body.owner_user_id ?? null,
          // #2155.19 / .20 — un élément entre « à vérifier », par un ajout manuel
          // tant que l'appelant ne dit pas d'où vient la sélection.
          work_status: body.work_status ?? 'to_review',
          provenance: body.provenance ?? 'manual',
          next_action: body.next_action ?? null,
          notes: body.notes ?? null,
          // #2156.29 — rien n'a encore été revérifié : `null`, pas « maintenant ».
          refreshed_at: null,
          removed_at: null,
          removal_reason: null,
        }),
      )
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Cette fiche est déjà dans la liste.')
      }
      throw error
    }
    return this.readItem(saved.id, workspaceId)
  }

  async updateItem(
    userId: string,
    listId: string,
    itemId: string,
    body: UpdateTargetListItem,
  ): Promise<TargetListItem> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const list = await this.findList(listId, workspaceId, userId)
    const item = await this.findItem(itemId, list.id, workspaceId)
    if (body.owner_user_id) await this.assertOwner(body.owner_user_id, workspaceId)
    if (body.selection_reason !== undefined) item.selection_reason = body.selection_reason
    if (body.priority !== undefined) item.priority = body.priority
    if (body.owner_user_id !== undefined) item.owner_user_id = body.owner_user_id
    if (body.work_status !== undefined) item.work_status = body.work_status
    if (body.next_action !== undefined) item.next_action = body.next_action
    if (body.notes !== undefined) item.notes = body.notes
    await this.items.save(item)
    return this.readItem(item.id, workspaceId)
  }

  /**
   * #2155.14 / #2156.31 — retire l'élément de la liste. La fiche canonique ne
   * bouge pas, et l'élément ne disparaît pas non plus : il porte désormais sa
   * date de retrait et son motif. On archive, on ne supprime pas — sans quoi
   * « pourquoi ce compte n'est plus dans la liste ? » n'a plus de réponse.
   */
  async removeItem(
    userId: string,
    listId: string,
    itemId: string,
    body: RemoveTargetListItem = {},
  ): Promise<{ id: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const list = await this.findList(listId, workspaceId, userId)
    const item = await this.findItem(itemId, list.id, workspaceId)
    item.removed_at = item.removed_at ?? new Date()
    if (body.reason !== undefined) item.removal_reason = body.reason
    await this.items.save(item)
    return { id: item.id }
  }

  /**
   * Les comptes et contacts DÉJÀ dans l'espace dont le nom contient `q`. Jamais
   * le marché : chercher de nouvelles entreprises, c'est Découvrir.
   */
  async candidates(userId: string, q: string | undefined): Promise<TargetCandidatesResponse> {
    const term = (q ?? '').trim()
    if (term.length < 2) return { candidates: [] }
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const scope = await this.scopeFor(workspaceId, role, userId)
    const pattern = likePattern(term)

    const accountParams: unknown[] = [workspaceId, pattern]
    let accountSql = 'SELECT id, company_name FROM accounts WHERE workspace_id = $1 AND company_name ILIKE $2'
    if (scope) {
      accountSql += ' AND (assigned_to = $3 OR assigned_to IS NULL)'
      accountParams.push(scope.ownerId)
    }
    const [accounts, contacts] = await Promise.all([
      this.dataSource.query(
        `${accountSql} ORDER BY company_name ASC LIMIT ${CANDIDATE_LIMIT}`,
        accountParams,
      ) as Promise<{ id: string; company_name: string | null }[]>,
      this.dataSource.query(
        `SELECT c.id, c.full_name, a.company_name FROM contacts c LEFT JOIN accounts a ON a.id = c.account_id
          WHERE c.workspace_id = $1 AND c.full_name ILIKE $2 ORDER BY c.full_name ASC LIMIT ${CANDIDATE_LIMIT}`,
        [workspaceId, pattern],
      ) as Promise<{ id: string; full_name: string | null; company_name: string | null }[]>,
    ])
    const candidates: TargetCandidate[] = [
      ...(accounts ?? []).map(row => ({
        kind: 'account' as const,
        id: row.id,
        label: row.company_name ?? null,
        sublabel: null,
      })),
      ...(contacts ?? []).map(row => ({
        kind: 'contact' as const,
        id: row.id,
        label: row.full_name ?? null,
        sublabel: row.company_name ?? null,
      })),
    ]
    return { candidates }
  }

  private async scopeFor(
    workspaceId: string,
    role: Parameters<typeof portfolioScopeFor>[0],
    userId: string,
  ): Promise<Scope> {
    const visibility = await this.workspaceContext.portfolioVisibilityOf(workspaceId)
    return portfolioScopeFor(role, visibility, userId)
  }

  /**
   * #2156.11 — TOUT accès par identifiant passe ici, et la visibilité y est une
   * autorisation : une liste `private` d'un autre membre répond 404, jamais 403.
   */
  private async findList(listId: string, workspaceId: string, userId: string): Promise<TargetListEntity> {
    const list = await this.lists.findOne({
      where: visibleListWhere(workspaceId, userId).map(clause => ({ id: listId, ...clause })),
    })
    if (!list) throw new NotFoundException('Liste introuvable.')
    return list
  }

  private async findItem(itemId: string, listId: string, workspaceId: string): Promise<TargetListItemEntity> {
    const item = await this.items.findOne({ where: { id: itemId, target_list_id: listId, workspace_id: workspaceId } })
    if (!item) throw new NotFoundException('Élément introuvable.')
    return item
  }

  /** #2155.18 — l'owner d'un élément est un membre de l'espace, ou il n'y en a pas. */
  private async assertOwner(ownerId: string, workspaceId: string): Promise<void> {
    try {
      await this.workspaceContext.assertMember(ownerId, workspaceId)
    } catch {
      throw new BadRequestException("L'owner choisi n'est pas membre de cet espace.")
    }
  }

  private async readItem(itemId: string, workspaceId: string): Promise<TargetListItem> {
    const rows = (await this.dataSource.query(`${ITEM_SELECT} WHERE i.id = $1 AND i.workspace_id = $2`, [
      itemId,
      workspaceId,
    ])) as ItemRow[]
    const row = rows[0]
    if (!row) throw new NotFoundException('Élément introuvable.')
    return toItemWire(row)
  }
}
