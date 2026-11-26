import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  CreateOutreachDelegationRequest,
  CreateScopedDelegationRequest,
  OutreachDelegationView,
  RenewDelegationRequest,
} from '@bellum/contracts'
import { outreachDelegationsApi, outreachKeys } from '@/features/outreach/api'
import { i18n } from '@/i18n'
import { useSession } from '@/lib/hooks/use-session'

/** #3702.9 — les mandats d'envoi délégué de l'espace. */
export function useOutreachDelegations() {
  const { user } = useSession()
  return useQuery<OutreachDelegationView[]>({
    queryKey: outreachKeys.delegations,
    queryFn: outreachDelegationsApi.list,
    enabled: !!user,
  })
}

export function useCreateOutreachDelegation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateOutreachDelegationRequest) => outreachDelegationsApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: outreachKeys.all })
      toast.success(i18n.t('outreach:delegation.toast.created'))
    },
    onError: (err: Error) => toast.error(err.message || i18n.t('outreach:delegation.toast.failed')),
  })
}

/**
 * #3702 (R26) — le statut réel par étape d'un mandat, pour compter les
 * arrêts (réponse, opposition, exclusion) à l'écran. `enabled` dépend de
 * l'appelant : `DelegationBlock` ne l'interroge que pour un mandat qui peut
 * encore agir (actif ou en pause) — un mandat révoqué ou expiré n'a plus
 * rien à arrêter de nouveau.
 */
export function useDelegationSteps(id: string, enabled: boolean) {
  const { user } = useSession()
  return useQuery({
    queryKey: [...outreachKeys.delegations, id, 'steps'],
    queryFn: () => outreachDelegationsApi.steps(id),
    enabled: enabled && !!user,
  })
}

/** #4016 L5 — signer un mandat d'espace (une portée). */
export function useSignScopedMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateScopedDelegationRequest) => outreachDelegationsApi.sign(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: outreachKeys.delegations })
      toast.success(i18n.t('outreach:mandates.toast.signed'))
    },
    onError: (err: Error) => toast.error(err.message || i18n.t('outreach:delegation.toast.failed')),
  })
}

/** #4016 L5 — renouveler un mandat = le re-signer. */
export function useRenewMandate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; body: RenewDelegationRequest }) =>
      outreachDelegationsApi.renew(vars.id, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: outreachKeys.delegations })
      toast.success(i18n.t('outreach:mandates.toast.renewed'))
    },
    onError: (err: Error) => toast.error(err.message || i18n.t('outreach:delegation.toast.failed')),
  })
}

export function useDelegationAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; action: 'pause' | 'resume' | 'revoke' }) =>
      outreachDelegationsApi.act(vars.id, vars.action),
    onSuccess: () => void qc.invalidateQueries({ queryKey: outreachKeys.delegations }),
    onError: (err: Error) => toast.error(err.message || i18n.t('outreach:delegation.toast.failed')),
  })
}
