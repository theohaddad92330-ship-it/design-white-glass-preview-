import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, In, Repository } from 'typeorm'
import {
  canCreateOwnWorkspace,
  pendingWorkspaceJoinRequestSchema,
  workspaceJoinOverviewSchema,
  type MyWorkspaceJoinRequest,
  type PendingWorkspaceJoinRequest,
  type WorkspaceJoinAdmin,
  type WorkspaceJoinCandidate,
  type WorkspaceJoinOverview,
  type WorkspaceJoinRequestStatus,
} from '@bellum/contracts'
import { EsnProfileEntity } from '../../database/entities/esn-profile.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkspaceJoinRequestEntity } from '../../database/entities/workspace-join-request.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
// La liste des domaines grand public existe déjà : une seconde divergerait.
import { emailDomain, isPublicEmailDomain } from '../activities/activity-linking'

/** Au-delà, la liste n'aide plus à choisir (#2016.6 — plusieurs espaces). */
const MAX_CANDIDATES = 3

/** Les rôles qu'un nouveau venu voit NOMMÉS comme administrateurs. */
const NAMED_ADMIN_ROLES = ['owner', 'admin'] as const

export type JoinDecision = 'accept' | 'refuse'

/** Faire entrer le demandeur — fourni par le contrôleur (l'équipe, GA-07). */
type AdmitRequester = (requesterUserId: string) => Promise<unknown>

/** `%` et `_` sont des jokers de `LIKE` : un domaine ne doit pas en fabriquer. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, ch => `\\${ch}`)
}

/**
 * #2016.5 — un PRÉNOM et une INITIALE, rien d'autre. Sans prénom, personne
 * n'est nommé : on ne remplace jamais un nom absent par une adresse.
 */
function toNamedAdmin(profile: Pick<ProfileEntity, 'first_name' | 'last_name'>): WorkspaceJoinAdmin | null {
  const firstName = profile.first_name?.trim()
  if (!firstName) return null
  const initial = profile.last_name?.trim().charAt(0).toLocaleUpperCase('fr-FR') ?? ''
  return { firstName, lastInitial: /^\p{Lu}$/u.test(initial) ? initial : null }
}

function toMine(row: WorkspaceJoinRequestEntity): MyWorkspaceJoinRequest {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  }
}

/**
 * #2016 — REJOINDRE UN ESPACE EXISTANT (décision Louis 15/09/2026).
 *
 * ⚠️ L'appelant de `overview`, `requestAccess` et `dismiss` n'est PAS membre de
 * l'espace qu'il regarde. Tout ce qui sort passe par un schéma `.strict()` du
 * contrat : un champ de trop (une adresse, un téléphone) fait échouer la
 * réponse au lieu de partir.
 *
 * ⚠️ Un espace n'est demandable QUE s'il a été détecté pour le domaine de
 * l'appelant : l'identifiant seul n'ouvre rien, et un espace non détecté
 * répond 404 — la même réponse qu'un espace inexistant, donc aucun oracle.
 *
 * La décision est un GESTE D'UTILISATEUR d'un administrateur (`team:manage`,
 * la même permission que l'invitation, posée par le guard de la route) : le
 * clic est la décision. L'entrée dans l'équipe est orchestrée par le
 * contrôleur (GA-07 : un service ne va pas chercher celui d'un autre module).
 */
@Injectable()
export class WorkspaceJoinService {
  constructor(
    @InjectRepository(WorkspaceJoinRequestEntity)
    private readonly requests: Repository<WorkspaceJoinRequestEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(EsnProfileEntity)
    private readonly esnProfiles: Repository<EsnProfileEntity>,
  ) {}

  /** `GET /workspace-join-requests/overview` — les espaces détectés et la règle des 72 h. */
  async overview(userId: string, userEmail: string, now: Date = new Date()): Promise<WorkspaceJoinOverview> {
    const workspaceIds = await this.detectWorkspaceIds(userId, userEmail)
    const candidates: WorkspaceJoinCandidate[] = []
    for (const workspaceId of workspaceIds) {
      const described = await this.describe(workspaceId)
      if (!described) continue
      const latest = await this.latestRequest(userId, workspaceId)
      candidates.push({ ...described, request: latest ? toMine(latest) : null })
    }
    return workspaceJoinOverviewSchema.parse({
      candidates,
      canCreateOwnWorkspace: canCreateOwnWorkspace(candidates, now),
    })
  }

  /**
   * `POST /workspace-join-requests` — idempotent : une seule demande en cours.
   *
   * #2086.34 — l'espace existant se dit avant qu'un doublon naisse.
   * #2086.35 — CTA « Demander à rejoindre l'espace » : cette méthode n'écrit
   * QUE dans `workspace_join_requests`, jamais dans `workspace_members` — une
   * demande n'accorde AUCUN accès avant la décision d'un administrateur
   * (`decide`), et n'ouvre jamais un second espace pour la même entreprise.
   */
  async requestAccess(userId: string, userEmail: string, workspaceId: string): Promise<MyWorkspaceJoinRequest> {
    await this.assertDetected(userId, userEmail, workspaceId)
    const pending = await this.requests.findOne({
      where: { workspace_id: workspaceId, user_id: userId, status: 'pending' },
    })
    if (pending) return toMine(pending)
    const saved = await this.requests.save(
      this.requests.create({
        workspace_id: workspaceId,
        user_id: userId,
        status: 'pending',
        decided_at: null,
        decided_by: null,
      }),
    )
    return toMine(saved)
  }

  /** `POST /workspace-join-requests/dismiss` — « ce n'est pas mon entreprise » (#2016.10). */
  async dismiss(userId: string, userEmail: string, workspaceId: string): Promise<MyWorkspaceJoinRequest> {
    await this.assertDetected(userId, userEmail, workspaceId)
    const pending = await this.requests.findOne({
      where: { workspace_id: workspaceId, user_id: userId, status: 'pending' },
    })
    const row =
      pending ??
      this.requests.create({ workspace_id: workspaceId, user_id: userId, status: 'pending', decided_by: null })
    row.status = 'dismissed'
    row.decided_at = new Date()
    row.decided_by = null
    return toMine(await this.requests.save(row))
  }

  /** `GET /workspace-join-requests/pending` — l'espace ACTIF de l'administrateur. */
  async listPending(workspaceId: string): Promise<PendingWorkspaceJoinRequest[]> {
    const rows = await this.requests.find({
      where: { workspace_id: workspaceId, status: 'pending' },
      order: { created_at: 'ASC' },
    })
    if (rows.length === 0) return []
    const profiles = await this.profiles.find({ where: { user_id: In(rows.map(r => r.user_id)) } })
    const byUser = new Map(profiles.map(p => [p.user_id, p]))
    return rows.map(row => {
      const profile = byUser.get(row.user_id)
      const name = [profile?.first_name, profile?.last_name]
        .map(part => part?.trim())
        .filter(Boolean)
        .join(' ')
      return pendingWorkspaceJoinRequestSchema.parse({
        id: row.id,
        requesterName: name || null,
        requesterEmail: profile?.email ?? null,
        createdAt: row.created_at.toISOString(),
      })
    })
  }

  /**
   * `POST /workspace-join-requests/:id/accept|refuse`.
   *
   * ⚠️ La demande se cherche AVEC l'espace de l'administrateur dans le `where` :
   * un identifiant d'un autre espace est introuvable, pas « interdit ».
   */
  async decide(
    adminUserId: string,
    workspaceId: string,
    requestId: string,
    decision: JoinDecision,
    admit: AdmitRequester,
  ): Promise<{ id: string; status: WorkspaceJoinRequestStatus }> {
    const row = await this.requests.findOne({ where: { id: requestId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Demande introuvable')
    if (row.status !== 'pending') throw new ConflictException('Cette demande a déjà été traitée')

    // #2016.7 — l'entrée dans l'espace passe par l'équipe (sièges, bascule
    // d'espace actif) : le profil de l'entreprise est ensuite HÉRITÉ par la
    // résolution existante (`inherited_answer_keys`), sans rien recopier.
    if (decision === 'accept') await admit(row.user_id)

    row.status = decision === 'accept' ? 'accepted' : 'refused'
    row.decided_at = new Date()
    row.decided_by = adminUserId
    await this.requests.save(row)
    return { id: row.id, status: row.status }
  }

  private async assertDetected(userId: string, userEmail: string, workspaceId: string): Promise<void> {
    const detected = await this.detectWorkspaceIds(userId, userEmail)
    if (!detected.includes(workspaceId)) throw new NotFoundException('Espace introuvable')
  }

  /**
   * #2016.1 — les espaces d'ENTREPRISE où travaillent déjà des personnes du
   * même domaine professionnel, hors ceux dont l'appelant est membre.
   *
   * « D'entreprise » = un profil d'entreprise courant y existe : l'espace
   * personnel encore vide d'un collègue n'est pas « l'espace de l'entreprise ».
   */
  private async detectWorkspaceIds(userId: string, userEmail: string): Promise<string[]> {
    const domain = emailDomain(userEmail)
    if (!domain || isPublicEmailDomain(domain)) return []

    const colleagues = (await this.profiles.find({ where: { email: ILike(`%@${escapeLike(domain)}`) } }))
      .map(p => p.user_id)
      .filter(id => id !== userId)
    if (colleagues.length === 0) return []

    const mine = new Set((await this.members.find({ where: { user_id: userId } })).map(m => m.workspace_id))
    const memberships = await this.members.find({ where: { user_id: In(colleagues) } })
    const counts = new Map<string, number>()
    for (const m of memberships) {
      if (!mine.has(m.workspace_id)) counts.set(m.workspace_id, (counts.get(m.workspace_id) ?? 0) + 1)
    }
    if (counts.size === 0) return []

    const withCompany = await this.esnProfiles.find({
      where: { workspace_id: In([...counts.keys()]), is_workspace_canonical: true, is_current: true },
    })
    const companyIds = new Set(withCompany.map(row => row.workspace_id))
    return [...counts.entries()]
      .filter(([id]) => companyIds.has(id))
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_CANDIDATES)
      .map(([id]) => id)
  }

  private async describe(workspaceId: string): Promise<Omit<WorkspaceJoinCandidate, 'request'> | null> {
    const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    if (!workspace) return null
    const canonical = await this.esnProfiles.findOne({
      where: { workspace_id: workspaceId, is_workspace_canonical: true, is_current: true },
    })
    const workspaceName = canonical?.esn_name?.trim() || workspace.brand_name?.trim() || workspace.name

    const adminRows = await this.members.find({
      where: { workspace_id: workspaceId, role: In([...NAMED_ADMIN_ROLES]) },
      order: { created_at: 'ASC' },
    })
    const adminProfiles =
      adminRows.length > 0 ? await this.profiles.find({ where: { user_id: In(adminRows.map(r => r.user_id)) } }) : []
    const byUser = new Map(adminProfiles.map(p => [p.user_id, p]))
    const admins = adminRows.flatMap(row => {
      const profile = byUser.get(row.user_id)
      const named = profile ? toNamedAdmin(profile) : null
      return named ? [named] : []
    })
    return { workspaceId, workspaceName, admins }
  }

  private async latestRequest(userId: string, workspaceId: string): Promise<WorkspaceJoinRequestEntity | null> {
    const rows = await this.requests.find({ where: { workspace_id: workspaceId, user_id: userId } })
    return [...rows].sort((a, b) => b.created_at.getTime() - a.created_at.getTime())[0] ?? null
  }
}
