import type {
  AccountTeamResponse,
  AddAccountTeamScopeRequest,
  AddDoNotContactRequest,
  AlreadyProposedResponse,
  AssigneeCandidate,
  ColleagueActivityResponse,
  ColleagueContactCheckResponse,
  DoNotContactEntry,
  DoNotContactListResponse,
  DistributeApplyResponse,
  DistributePreviewResponse,
  DuplicateCandidatesResponse,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

type AssigneeCandidatesResponse = { items: AssigneeCandidate[] }

/**
 * #4158 (lot L4) — le client des garde-fous entre collègues (`/team-guardrails/*`).
 *
 * Aucune décision ici : l'API borne chaque lecture par l'espace ACTIF et tient les
 * droits (`team:manage` pour retirer une exclusion, responsable ou `team:manage`
 * pour composer une équipe de compte). L'écran informe, demande confirmation,
 * propose — il ne bloque rien et n'envoie rien.
 */
export const teamGuardrailsApi = {
  contactActivity(contactId: string): Promise<ColleagueActivityResponse> {
    return apiFetch<ColleagueActivityResponse>({ path: `/team-guardrails/contacts/${contactId}/activity` })
  },
  checkContacts(contactIds: readonly string[]): Promise<ColleagueContactCheckResponse> {
    return apiFetch<ColleagueContactCheckResponse, { contact_ids: string[] }>({
      path: '/team-guardrails/contacts/check',
      method: 'POST',
      body: { contact_ids: [...contactIds] },
    })
  },
  listDoNotContact(): Promise<DoNotContactListResponse> {
    return apiFetch<DoNotContactListResponse>({ path: '/team-guardrails/do-not-contact' })
  },
  addDoNotContact(body: AddDoNotContactRequest): Promise<DoNotContactEntry> {
    return apiFetch<DoNotContactEntry, AddDoNotContactRequest>({
      path: '/team-guardrails/do-not-contact',
      method: 'POST',
      body,
    })
  },
  liftDoNotContact(id: string): Promise<void> {
    return apiFetch<void>({ path: `/team-guardrails/do-not-contact/${id}`, method: 'DELETE' })
  },
  alreadyProposedOnProject(projectId: string, consultantIds: readonly string[]): Promise<AlreadyProposedResponse> {
    return apiFetch<AlreadyProposedResponse>({
      path: `/team-guardrails/projects/${projectId}/already-proposed?consultant_ids=${consultantIds.join(',')}`,
    })
  },
  duplicates(kind: 'account' | 'contact', id: string): Promise<DuplicateCandidatesResponse> {
    return apiFetch<DuplicateCandidatesResponse>({ path: `/team-guardrails/duplicates?kind=${kind}&id=${id}` })
  },
  proposeMerge(kind: 'account' | 'contact', leftId: string, rightId: string): Promise<void> {
    return apiFetch<void, { kind: string; left_id: string; right_id: string }>({
      path: '/team-guardrails/duplicates/propose',
      method: 'POST',
      body: { kind, left_id: leftId, right_id: rightId },
    })
  },
  accountTeam(accountId: string): Promise<AccountTeamResponse> {
    return apiFetch<AccountTeamResponse>({ path: `/team-guardrails/accounts/${accountId}/team` })
  },
  addTeamMember(accountId: string, userId: string): Promise<AccountTeamResponse> {
    return apiFetch<AccountTeamResponse, { user_id: string }>({
      path: `/team-guardrails/accounts/${accountId}/team`,
      method: 'POST',
      body: { user_id: userId },
    })
  },
  removeTeamMember(accountId: string, userId: string): Promise<AccountTeamResponse> {
    return apiFetch<AccountTeamResponse>({
      path: `/team-guardrails/accounts/${accountId}/team/${userId}`,
      method: 'DELETE',
    })
  },
  /** #4996 — pose une zone (entité du compte ou libellé libre). Le serveur recopie le nom de l'entité. */
  addTeamScope(accountId: string, body: AddAccountTeamScopeRequest): Promise<AccountTeamResponse> {
    const { user_id: userId, ...rest } = body
    return apiFetch<AccountTeamResponse, Omit<AddAccountTeamScopeRequest, 'user_id'>>({
      path: `/team-guardrails/accounts/${accountId}/team/${userId}/scopes`,
      method: 'POST',
      body: rest,
    })
  },
  removeTeamScope(accountId: string, userId: string, scopeId: string): Promise<AccountTeamResponse> {
    return apiFetch<AccountTeamResponse>({
      path: `/team-guardrails/accounts/${accountId}/team/${userId}/scopes/${scopeId}`,
      method: 'DELETE',
    })
  },
  /** #4996 L5 — l'aperçu figé de « Répartir selon les périmètres ». N'écrit rien. */
  distributePreview(accountId: string): Promise<DistributePreviewResponse> {
    return apiFetch<DistributePreviewResponse>({
      path: `/accounts/${accountId}/team/distribute/preview`,
      method: 'POST',
    })
  },
  /** 409 = l'état a changé depuis l'aperçu : il faut le redemander. */
  distributeApply(accountId: string, fingerprint: string): Promise<DistributeApplyResponse> {
    return apiFetch<DistributeApplyResponse, { fingerprint: string }>({
      path: `/accounts/${accountId}/team/distribute/apply`,
      method: 'POST',
      body: { fingerprint },
    })
  },
  /** #4996 L5 — les porteurs possibles d'un contact, ceux qui couvrent son entité d'abord. */
  assigneeCandidates(contactId: string): Promise<AssigneeCandidatesResponse> {
    return apiFetch<AssigneeCandidatesResponse>({ path: `/contacts/${contactId}/assignee-candidates` })
  },
}
