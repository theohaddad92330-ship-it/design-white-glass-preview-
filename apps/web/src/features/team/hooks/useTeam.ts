import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  CreateWorkspaceInvitation,
  ResendWorkspaceInvitationResult,
  WorkspacePermission,
  WorkspaceRole,
  WorkspaceTeam,
  WorkspaceTeamInvitation,
  WorkspaceTeamMember,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { trackInvitationSent } from '@/lib/product-tracker'
import { teamApi } from '../api'
import { TEAM_KEY, useSettledTeam } from './useSettledTeam'

export { TEAM_KEY, useSettledTeam }

/** #2085.13 — le motif de route de CET écran (catalogue :
 *  `product-screens-catalog.ts`), seul appelant de `invite.mutate` (`TeamView.tsx`). */
const TEAM_SCREEN = '/settings/team'

type ManageableRole = Exclude<WorkspaceRole, 'owner'>
type OptimisticContext = { previous: WorkspaceTeam | undefined }

/**
 * The caller's active-workspace team (members, pending invitations, seat usage)
 * plus the four mutations behind the "Équipe" screen. Reads/writes go through
 * the same `TEAM_KEY` cache; destructive actions (revoke / remove / role change)
 * apply optimistically and roll back on error, all with `sonner` toasts.
 */
export function useTeam(options: { enabled?: boolean } = {}) {
  const qc = useQueryClient()
  const { team, isLoading, isError } = useSettledTeam(options)

  const patchCache = (next: (team: WorkspaceTeam) => WorkspaceTeam): OptimisticContext => {
    const previous = qc.getQueryData<WorkspaceTeam>(TEAM_KEY)
    if (previous) qc.setQueryData<WorkspaceTeam>(TEAM_KEY, next(previous))
    return { previous }
  }

  const rollback = (context: OptimisticContext | undefined) => {
    if (context?.previous) qc.setQueryData(TEAM_KEY, context.previous)
  }

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: TEAM_KEY })
  }

  const invite = useMutation<WorkspaceTeamInvitation, Error, CreateWorkspaceInvitation>({
    mutationFn: body => teamApi.invite(body),
    onSuccess: inv => {
      toast.success(i18n.t('team:toast.inviteSent', { email: inv.email }))
      invalidate()
      // #2085.13 — « invitation » : anonyme, par ÉCRAN. Distinct de
      // l'événement AUDIT `member_invited` (nom voisin, `userId` porté,
      // journal d'activité — `workspace-team.service.ts`).
      trackInvitationSent(TEAM_SCREEN)
    },
    onError: error => toast.error(error.message || i18n.t('team:toast.inviteError')),
  })

  const revokeInvitation = useMutation<{ revoked: true }, Error, string, OptimisticContext>({
    mutationFn: id => teamApi.revokeInvitation(id),
    onMutate: async id => {
      await qc.cancelQueries({ queryKey: TEAM_KEY })
      return patchCache(team => ({
        ...team,
        invitations: team.invitations.filter(i => i.id !== id),
        seats: { ...team.seats, used: Math.max(0, team.seats.used - 1) },
      }))
    },
    onError: (error, _id, context) => {
      rollback(context)
      toast.error(error.message || i18n.t('team:toast.revokeError'))
    },
    onSuccess: () => toast.success(i18n.t('team:toast.invitationRevoked')),
    onSettled: invalidate,
  })

  // #4158.2 — l'issue de l'envoi se DIT : parti, ou non parti (le lien est tout de même renouvelé).
  const resendInvitation = useMutation<ResendWorkspaceInvitationResult, Error, string>({
    mutationFn: id => teamApi.resendInvitation(id),
    onSuccess: result =>
      result.emailSent
        ? toast.success(i18n.t('team:toast.invitationResent', { email: result.invitation.email }))
        : toast.warning(i18n.t('team:toast.invitationResentNotSent', { email: result.invitation.email })),
    onError: error => toast.error(error.message || i18n.t('team:toast.resendError')),
    onSettled: invalidate,
  })

  const removeMember = useMutation<{ removed: true }, Error, string, OptimisticContext>({
    mutationFn: userId => teamApi.removeMember(userId),
    onMutate: async userId => {
      await qc.cancelQueries({ queryKey: TEAM_KEY })
      return patchCache(team => ({
        ...team,
        members: team.members.filter(m => m.userId !== userId),
        workspace: { ...team.workspace, memberCount: Math.max(0, team.workspace.memberCount - 1) },
        seats: { ...team.seats, used: Math.max(0, team.seats.used - 1) },
      }))
    },
    onError: (error, _userId, context) => {
      rollback(context)
      toast.error(error.message || i18n.t('team:toast.removeError'))
    },
    onSuccess: () => toast.success(i18n.t('team:toast.memberRemoved')),
    onSettled: invalidate,
  })

  const updateMemberRole = useMutation<
    WorkspaceTeamMember,
    Error,
    { userId: string; role: ManageableRole },
    OptimisticContext
  >({
    mutationFn: ({ userId, role }) => teamApi.updateMemberRole(userId, { role }),
    onMutate: async ({ userId, role }) => {
      await qc.cancelQueries({ queryKey: TEAM_KEY })
      return patchCache(team => ({
        ...team,
        members: team.members.map(m => (m.userId === userId ? { ...m, role } : m)),
      }))
    },
    onError: (error, _vars, context) => {
      rollback(context)
      toast.error(error.message || i18n.t('team:toast.roleError'))
    },
    onSuccess: () => toast.success(i18n.t('team:toast.roleUpdated')),
    onSettled: invalidate,
  })

  /** « Renfort transversal » (#3387.10) : drapeau d'orientation, aucun droit — patch optimiste sans risque. */
  const setCrossTeamSupport = useMutation<
    WorkspaceTeamMember,
    Error,
    { userId: string; enabled: boolean },
    OptimisticContext
  >({
    mutationFn: ({ userId, enabled }) => teamApi.setCrossTeamSupport(userId, { enabled }),
    onMutate: async ({ userId, enabled }) => {
      await qc.cancelQueries({ queryKey: TEAM_KEY })
      return patchCache(team => ({
        ...team,
        members: team.members.map(m => (m.userId === userId ? { ...m, crossTeamSupport: enabled } : m)),
      }))
    },
    onError: (error, _vars, context) => {
      rollback(context)
      toast.error(error.message || i18n.t('team:toast.crossTeamSupportError'))
    },
    onSuccess: (_member, { enabled }) =>
      toast.success(i18n.t(enabled ? 'team:toast.crossTeamSupportOn' : 'team:toast.crossTeamSupportOff')),
    onSettled: invalidate,
  })

  /**
   * Accorder — ou retirer — des permissions EN PROPRE.
   *
   * ⚠️ AUCUN patch optimiste, contrairement au changement de rôle. Accorder un
   * droit est irréversible dans ses EFFETS : ce qui a été lu l'a été. Afficher
   * un droit comme accordé avant que le serveur ne l'ait écrit ferait croire à
   * un accès qui n'existe pas — et, au rechargement, ferait douter de ce qu'on
   * vient de faire. On attend la réponse.
   */
  const setMemberPermissions = useMutation<
    { permissions: WorkspacePermission[] },
    Error,
    { userId: string; permissions: WorkspacePermission[] }
  >({
    mutationFn: ({ userId, permissions }) => teamApi.setMemberPermissions(userId, permissions),
    onError: error => toast.error(error.message || i18n.t('team:toast.permissionsError')),
    onSuccess: () => toast.success(i18n.t('team:toast.permissionsUpdated')),
    onSettled: invalidate,
  })

  return {
    team,
    isLoading,
    isError,
    invite,
    revokeInvitation,
    resendInvitation,
    removeMember,
    updateMemberRole,
    setCrossTeamSupport,
    setMemberPermissions,
  }
}
