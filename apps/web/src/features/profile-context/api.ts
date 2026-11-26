import type {
  AuditMoveDecisionMove,
  AuditMoveDecisionStatus,
  EntryStrategy,
  ProfileContextCorrectableField,
  ProfileContextResponse,
  ProfileContextRevision,
  ProfileContextRevisionSummary,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

export const profileContextApi = {
  getMe(): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse>({ path: '/profile-context/me' })
  },
  // D9 — décision Louis 14/09/2026 : valider le contexte commercial. Le clic
  // EST la décision (geste utilisateur = auto-approuvé) : pas de confirmation
  // avant cet appel.
  validate(): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse>({ path: '/profile-context/validate', method: 'POST' })
  },
  // #2073.8 — « Choisir cette stratégie ». Le clic EST la décision (geste
  // utilisateur = auto-approuvé) : pas de confirmation avant cet appel.
  chooseEntryStrategy(entryStrategy: EntryStrategy): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse>({
      path: '/profile-context/entry-strategy',
      method: 'POST',
      body: { entryStrategy },
    })
  },
  // #2074.16 — « Valider » / « Modifier » / « Écarter » UN mouvement d'audit
  // PROPOSÉ. Le clic EST la décision (geste utilisateur = auto-approuvé) :
  // pas de confirmation avant cet appel, même précédent que `chooseEntryStrategy`.
  // #2074.16 — `move` = l'objet montré : « Valider »/« Modifier » en fait une tâche dans Actions.
  recordAuditMoveDecision(
    ruleId: string,
    status: AuditMoveDecisionStatus,
    move: AuditMoveDecisionMove = {},
  ): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse>({
      path: '/profile-context/audit-move-decision',
      method: 'POST',
      body: { ruleId, status, ...move },
    })
  },
  // #2908 (#2010.4) — « Corriger ce champ ». Le clic EST la décision (geste
  // utilisateur = auto-approuvé) : pas de confirmation avant cet appel.
  correctField(field: ProfileContextCorrectableField, value: string): Promise<ProfileContextResponse> {
    return apiFetch<ProfileContextResponse>({
      path: '/profile-context/corrections',
      method: 'POST',
      body: { field, value },
    })
  },
  /** Metadata-only list of past snapshots (newest first) for the « Versions » panel. */
  listRevisions(): Promise<ProfileContextRevisionSummary[]> {
    return apiFetch<ProfileContextRevisionSummary[]>({ path: '/profile-context/revisions' })
  },
  /** One past snapshot, including its full `profile_context`. */
  getRevision(version: number): Promise<ProfileContextRevision> {
    return apiFetch<ProfileContextRevision>({ path: `/profile-context/revisions/${version}` })
  },
  /** Restore a past snapshot as the current context. Reversible — restoring
   *  itself snapshots a new revision — but confirmed at the click. */
  restoreRevision(version: number): Promise<ProfileContextRevision> {
    return apiFetch<ProfileContextRevision>({
      path: `/profile-context/revisions/${version}/restore`,
      method: 'POST',
    })
  },
}

export const profileContextKeys = {
  me: ['profile-context', 'me'] as const,
  revisions: ['profile-context', 'revisions'] as const,
}
