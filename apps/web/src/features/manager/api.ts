import {
  type CreateObjectiveProposal,
  type ManagerMember,
  type ManagerTeamBusiness,
  type ManagerTeamPlans,
  type ObjectiveProposal,
  type ObjectiveProposalsResponse,
  type CreateTeamComment,
  type SavedTeamReview,
  type SaveTeamReview,
  type MemberObjective,
  type MyObjectiveResponse,
  type TeamComment,
  type TeamCommentsResponse,
  type TeamObjectives,
  type UpsertMemberObjective,
  type ManagerPeriodDays,
  type ManagerTeamStats,
  DEFAULT_MANAGER_PERIOD_DAYS,
  managerMemberSchema,
  managerTeamBusinessSchema,
  managerTeamPlansSchema,
  managerTeamStatsSchema,
  objectiveProposalSchema,
  objectiveProposalsResponseSchema,
  memberObjectiveSchema,
  myObjectiveResponseSchema,
  savedTeamReviewSchema,
  teamCommentSchema,
  teamCommentsResponseSchema,
  teamObjectivesSchema,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export const managerApi = {
  /**
   * Owner/admin-only consolidated team stats (403 for members).
   *
   * Parsed at the boundary on purpose. This payload used to be trusted on the
   * strength of its TypeScript type alone, which says nothing about what the
   * wire actually carries: during a deploy window the API is a few commits
   * behind the web, the newest fields are simply missing, and the screen died
   * with `TypeError: Cannot read properties of undefined` inside a render —
   * i.e. as a dead page under the root error boundary, with no clue as to which
   * field was missing.
   *
   * A parse here converts that class of drift into a normal, named query
   * failure that `useManagerStats` already renders as "impossible de charger" —
   * the screen degrades instead of the app falling over. Same reasoning as the
   * IA→API event boundary: validate where the data enters, not where it is used.
   */
  async teamStats(periodDays: ManagerPeriodDays = DEFAULT_MANAGER_PERIOD_DAYS): Promise<ManagerTeamStats> {
    // #4158.37 — UNE période pour tout l'écran, passée telle quelle à l'API.
    return managerTeamStatsSchema.parse(await apiFetch<unknown>({ path: `/manager/team-stats?periode=${periodDays}` }))
  },

  /** Théo D team-business — objectifs du mois, affaires ouvertes, portefeuille de comptes (direction). */
  async teamBusiness(): Promise<ManagerTeamBusiness> {
    return managerTeamBusinessSchema.parse(await apiFetch<unknown>({ path: '/manager/team-business' }))
  },

  /** Théo D team-plans — les actions ouvertes de l'équipe, avec qui les a confiées (direction). */
  async teamPlans(): Promise<ManagerTeamPlans> {
    return managerTeamPlansSchema.parse(await apiFetch<unknown>({ path: '/manager/team-plans' }))
  },

  /** Théo D team-member — la fiche d'un membre, en lecture de ce qu'il a enregistré (tout membre). */
  async member(userId: string): Promise<ManagerMember> {
    return managerMemberSchema.parse(
      await apiFetch<unknown>({ path: `/manager/members/${encodeURIComponent(userId)}` }),
    )
  },

  /**
   * Set (or clear, with `null`) the account's responsable. The server decides
   * what the caller may do: a manager allocates freely, a rep may only claim an
   * unassigned account or release their own.
   */
  assignAccount(accountId: string, assignedTo: string | null): Promise<{ id: string; assigned_to: string | null }> {
    return apiFetch({
      path: `/accounts/${accountId}/assign`,
      method: 'PATCH',
      body: { assigned_to: assignedTo },
    })
  },

  /**
   * Théo D team-review — enregistre le point d'équipe : les décisions deviennent
   * des actions du plan (mises à jour, jamais dupliquées). Parsé à la frontière.
   */
  async saveTeamReview(body: SaveTeamReview): Promise<SavedTeamReview> {
    return savedTeamReviewSchema.parse(await apiFetch<unknown>({ path: '/manager/team-review', method: 'POST', body }))
  },
}

/**
 * Objectif commercial chiffré par membre (cockpit manager §10). Parsé à la
 * frontière (comme `teamStats`) : une API antérieure au module renvoie un payload
 * hors-contrat, converti ici en échec de requête nommé plutôt qu'en page morte.
 */
export const objectivesApi = {
  /** L'objectif du membre pour le mois (courant par défaut), `objective: null` si non déclaré. */
  async mine(month?: string): Promise<MyObjectiveResponse> {
    const query = month ? `?month=${encodeURIComponent(month)}` : ''
    return myObjectiveResponseSchema.parse(await apiFetch<unknown>({ path: `/objectives/me${query}` }))
  },
  /** Déclarer / mettre à jour l'objectif du membre. */
  async upsertMine(body: UpsertMemberObjective): Promise<MemberObjective> {
    return memberObjectiveSchema.parse(
      await apiFetch<unknown, UpsertMemberObjective>({ path: '/objectives/me', method: 'PUT', body }),
    )
  },
  /** L'atteinte de l'équipe pour le mois (manager). */
  async team(month?: string): Promise<TeamObjectives> {
    const query = month ? `?month=${encodeURIComponent(month)}` : ''
    return teamObjectivesSchema.parse(await apiFetch<unknown>({ path: `/objectives/team${query}` }))
  },
}

/** Théo D team-business.N2 — une cible PROPOSÉE à un membre, qu'il accepte ou refuse. */
export const objectiveProposalsApi = {
  /** Les propositions du mois pour l'équipe (direction). */
  async team(month?: string): Promise<ObjectiveProposalsResponse> {
    const query = month ? `?month=${encodeURIComponent(month)}` : ''
    return objectiveProposalsResponseSchema.parse(await apiFetch<unknown>({ path: `/objectives/proposals${query}` }))
  },
  /** Mes propositions en attente de réponse. */
  async mine(): Promise<ObjectiveProposal[]> {
    const rows = await apiFetch<unknown[]>({ path: '/objectives/proposals/mine' })
    return rows.map(row => objectiveProposalSchema.parse(row))
  },
  /** La direction propose une cible — rien ne change avant la réponse du membre. */
  async propose(body: CreateObjectiveProposal): Promise<ObjectiveProposal> {
    return objectiveProposalSchema.parse(
      await apiFetch<unknown, CreateObjectiveProposal>({ path: '/objectives/proposals', method: 'POST', body }),
    )
  },
  /** Le membre accepte (la cible est appliquée) ou refuse (rien ne change). */
  async respond(id: string, decision: 'accepted' | 'refused'): Promise<ObjectiveProposal> {
    return objectiveProposalSchema.parse(
      await apiFetch<unknown, { decision: 'accepted' | 'refused' }>({
        path: `/objectives/proposals/${encodeURIComponent(id)}`,
        method: 'PATCH',
        body: { decision },
      }),
    )
  },
}

/**
 * Commentaire d'équipe (cockpit manager §10). Parsé à la frontière, même raison.
 *
 * #1940.6 — LA MÊME route sert un commentaire sur un fil `/chat`
 * (`conversationId`) : voir `useChatComments` (`features/chat/hooks`), qui
 * appelle ces deux fonctions plutôt que de redéclarer l'appel réseau.
 *
 * #2914 (#2128.10) — et LA MÊME route sert aussi le fil d'UN COMPTE
 * (`accountId`) : voir `useAccountTeamComments` (`features/accounts/hooks`).
 * `conversationId` et `accountId` sont mutuellement exclusifs — le serveur ne
 * lit jamais le second si le premier est fourni.
 */
export const teamCommentsApi = {
  /** La tête du fil de l'espace, plus récent d'abord — ou, avec `conversationId`
   *  un fil `/chat` précis, ou, avec `accountId`, le fil d'UN compte. */
  async list(conversationId?: string, accountId?: string, openMine?: boolean): Promise<TeamCommentsResponse> {
    // #4158.31 — `openMine` : mes fils ouverts (non résolus ; auteur, mentionné ou intervenu).
    const path = openMine
      ? '/team-comments?open_mine=true'
      : conversationId
        ? `/team-comments?conversation_id=${encodeURIComponent(conversationId)}`
        : accountId
          ? `/team-comments?account_id=${encodeURIComponent(accountId)}`
          : '/team-comments'
    return teamCommentsResponseSchema.parse(await apiFetch<unknown>({ path }))
  },
  /** #4158.31 — marquer un fil résolu (sa racine), ou le rouvrir. */
  async setResolution(id: string, resolved: boolean): Promise<TeamComment> {
    return teamCommentSchema.parse(
      await apiFetch<unknown, { resolved: boolean }>({
        path: `/team-comments/${encodeURIComponent(id)}/resolution`,
        method: 'PATCH',
        body: { resolved },
      }),
    )
  },
  /** Partager une idée / un commentaire — général, ou sur un fil/une réponse `/chat`. */
  async create(body: CreateTeamComment): Promise<TeamComment> {
    return teamCommentSchema.parse(
      await apiFetch<unknown, CreateTeamComment>({ path: '/team-comments', method: 'POST', body }),
    )
  },
}

export const objectiveKeys = {
  all: ['manager', 'objectives'] as const,
  mine: (userId?: string, month?: string) => ['manager', 'objectives', 'mine', userId, month] as const,
  team: (userId?: string, month?: string) => ['manager', 'objectives', 'team', userId, month] as const,
}

export const teamViewKeys = {
  business: (userId?: string) => ['manager', 'team-business', userId] as const,
  plans: (userId?: string) => ['manager', 'team-plans', userId] as const,
  member: (userId?: string, memberId?: string) => ['manager', 'member', userId, memberId] as const,
  proposalsMine: (userId?: string) => ['manager', 'proposals', 'mine', userId] as const,
}

export const teamCommentKeys = {
  all: ['manager', 'team-comments'] as const,
  list: (userId?: string) => ['manager', 'team-comments', 'list', userId] as const,
}
