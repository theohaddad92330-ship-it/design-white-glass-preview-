import type {
  ResendWorkspaceInvitationResult,
  AcceptWorkspaceInvitationResult,
  ActiveWorkspace,
  CreateWorkspaceInvitation,
  HandOverPortfolio,
  HandoverPlan,
  HandoverPlanResult,
  MemberPortfolio,
  PortfolioHandoverResult,
  PortfolioVisibility,
  SetCrossTeamSupport,
  SetPortfolioVisibility,
  SwitchWorkspace,
  UpdateWorkspaceMemberRole,
  WorkspaceActivityPage,
  WorkspaceActivityQuery,
  WorkspaceMarket,
  WorkspaceMarketResolution,
  WorkspacePermission,
  WorkspaceSummary,
  WorkspaceTeam,
  WorkspaceTeamInvitation,
  WorkspaceTeamMember,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Thin client over the NestJS workspace/team module (`/workspaces/*`). */
export const teamApi = {
  getTeam(): Promise<WorkspaceTeam> {
    return apiFetch<WorkspaceTeam>({ path: '/workspaces/me' })
  },
  /** Every workspace the caller belongs to — the switcher's list, active flagged. */
  listWorkspaces(): Promise<WorkspaceSummary[]> {
    return apiFetch<WorkspaceSummary[]>({ path: '/workspaces' })
  },
  /** Switch the active workspace. 403 when the caller is not a member of the
   *  target — membership is proven server-side, never assumed from this call. */
  switchWorkspace(body: SwitchWorkspace): Promise<ActiveWorkspace> {
    return apiFetch<ActiveWorkspace>({ path: '/workspaces/active', method: 'POST', body })
  },
  /** Journal d'activité — ADMIN/MANAGER only (`team:manage`), 403 otherwise. */
  getActivity(query: WorkspaceActivityQuery): Promise<WorkspaceActivityPage> {
    const params = new URLSearchParams()
    if (query.actorId) params.set('actorId', query.actorId)
    if (query.event) params.set('event', query.event)
    if (query.period) params.set('period', query.period)
    if (query.offset !== undefined) params.set('offset', String(query.offset))
    if (query.limit !== undefined) params.set('limit', String(query.limit))
    const qs = params.toString()
    return apiFetch<WorkspaceActivityPage>({ path: `/workspaces/activity${qs ? `?${qs}` : ''}` })
  },
  getMarket(): Promise<WorkspaceMarketResolution> {
    return apiFetch<WorkspaceMarketResolution>({ path: '/workspaces/market' })
  },
  setMarket(market: WorkspaceMarket): Promise<WorkspaceMarketResolution> {
    return apiFetch<WorkspaceMarketResolution>({ path: '/workspaces/market', method: 'PATCH', body: { market } })
  },
  /**
   * Qui voit quels comptes (décision D5) — PROPRIÉTAIRE uniquement côté serveur
   * (`assertRole(['owner'])`), 403 sinon.
   *
   * Une seule porte d'écriture, ici, dans le module d'API de l'espace : c'est
   * la loi 1 du tome 7 (GA-26), et `/workspaces/portfolio-visibility` est
   * inscrit au registre de la garde. Le corps est typé par le schéma du
   * contrat, celui-là même dont le DTO NestJS est dérivé — les deux moitiés ne
   * peuvent pas diverger en silence.
   */
  setPortfolioVisibility(visibility: PortfolioVisibility): Promise<{ visibility: PortfolioVisibility }> {
    return apiFetch<{ visibility: PortfolioVisibility }, SetPortfolioVisibility>({
      path: '/workspaces/portfolio-visibility',
      method: 'PATCH',
      body: { visibility },
    })
  },
  invite(body: CreateWorkspaceInvitation): Promise<WorkspaceTeamInvitation> {
    return apiFetch<WorkspaceTeamInvitation>({ path: '/workspaces/invitations', method: 'POST', body })
  },
  /** #4158.2 — renvoie l'invitation (nouveau lien, +7 j) ; dit si l'e-mail est réellement parti. */
  resendInvitation(id: string): Promise<ResendWorkspaceInvitationResult> {
    return apiFetch<ResendWorkspaceInvitationResult>({ path: `/workspaces/invitations/${id}/resend`, method: 'POST' })
  },
  revokeInvitation(id: string): Promise<{ revoked: true }> {
    return apiFetch<{ revoked: true }>({ path: `/workspaces/invitations/${id}`, method: 'DELETE' })
  },
  removeMember(userId: string): Promise<{ removed: true }> {
    return apiFetch<{ removed: true }>({ path: `/workspaces/members/${userId}`, method: 'DELETE' })
  },
  /**
   * Ce qu'un membre PORTE — la prévisualisation d'un départ (tome 8 §33, angle
   * mort n°2). `team:manage` côté serveur, 403 sinon.
   *
   * Elle précède toujours le transfert et le retrait : un geste irréversible
   * sans prévisualisation de ce qu'il déplace est un piège.
   */
  getMemberPortfolio(userId: string): Promise<MemberPortfolio> {
    return apiFetch<MemberPortfolio>({ path: `/workspaces/members/${userId}/portfolio` })
  },
  /** Transférer le portefeuille d'un membre à un autre. Le sortant n'est PAS
   *  retiré : reprendre et retirer sont deux décisions. */
  handOverPortfolio(fromUserId: string, toUserId: string): Promise<PortfolioHandoverResult> {
    return apiFetch<PortfolioHandoverResult, HandOverPortfolio>({
      path: `/workspaces/members/${fromUserId}/handover`,
      method: 'POST',
      body: { toUserId },
    })
  },
  /** #4158.29 — répartir le portefeuille par lots. `confirm: false` = récapitulatif sans écriture. */
  planHandover(fromUserId: string, body: HandoverPlan): Promise<HandoverPlanResult> {
    return apiFetch<HandoverPlanResult, HandoverPlan>({
      path: `/workspaces/members/${fromUserId}/handover-plan`,
      method: 'POST',
      body,
    })
  },
  /** Désigne (ou retire) le « renfort transversal » d'un membre (#3387.10) — `team:manage`. */
  setCrossTeamSupport(userId: string, body: SetCrossTeamSupport): Promise<WorkspaceTeamMember> {
    return apiFetch<WorkspaceTeamMember, SetCrossTeamSupport>({
      path: `/workspaces/members/${userId}/cross-team-support`,
      method: 'PATCH',
      body,
    })
  },
  updateMemberRole(userId: string, body: UpdateWorkspaceMemberRole): Promise<WorkspaceTeamMember> {
    return apiFetch<WorkspaceTeamMember>({ path: `/workspaces/members/${userId}/role`, method: 'PATCH', body })
  },
  /**
   * Les permissions accordées EN PROPRE — la liste COMPLÈTE, jamais un delta.
   *
   * Le serveur efface puis réécrit : un tableau vide les retire toutes. C'est
   * pour ça que l'écran doit d'abord LIRE celles en place (`extraPermissions`
   * sur le membre) — envoyer une liste partielle effacerait en silence des
   * accords qu'on n'a pas vus.
   */
  setMemberPermissions(
    userId: string,
    permissions: WorkspacePermission[],
  ): Promise<{ permissions: WorkspacePermission[] }> {
    return apiFetch<{ permissions: WorkspacePermission[] }, { permissions: WorkspacePermission[] }>({
      path: `/workspaces/members/${userId}/permissions`,
      method: 'PUT',
      body: { permissions },
    })
  },
  acceptInvitation(token: string): Promise<AcceptWorkspaceInvitationResult> {
    return apiFetch<AcceptWorkspaceInvitationResult>({
      path: `/workspaces/invitations/${encodeURIComponent(token)}/accept`,
      method: 'POST',
    })
  },
}
