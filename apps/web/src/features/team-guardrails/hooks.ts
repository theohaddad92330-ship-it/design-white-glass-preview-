import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AddAccountTeamScopeRequest, AddDoNotContactRequest, CreateBusinessUnit } from '@bellum/contracts'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { businessUnitsApi } from '@/features/business-units/api'
import { useSession } from '@/lib/hooks/use-session'
import { teamGuardrailsApi } from './api'

const KEYS = {
  contactActivity: (id: string) => ['team-guardrails', 'contact-activity', id] as const,
  check: (ids: readonly string[]) => ['team-guardrails', 'check', [...ids].sort().join(',')] as const,
  dnc: ['team-guardrails', 'do-not-contact'] as const,
  proposed: (needId: string, ids: readonly string[]) =>
    ['team-guardrails', 'proposed', needId, [...ids].sort().join(',')] as const,
  duplicates: (kind: string, id: string) => ['team-guardrails', 'duplicates', kind, id] as const,
  team: (accountId: string) => ['team-guardrails', 'account-team', accountId] as const,
  candidates: (contactId: string) => ['team-guardrails', 'assignee-candidates', contactId] as const,
}

/** #4158.20 — les collègues qui ont travaillé ce contact (90 jours) ; `[]` = rien à dire. */
export function useContactColleagueActivity(contactId: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: KEYS.contactActivity(contactId),
    queryFn: () => teamGuardrailsApi.contactActivity(contactId),
    enabled: !!user && contactId.length > 0,
    staleTime: 60_000,
  })
}

/**
 * #4158.21/.22 — ce que l'espace sait de ces contacts AVANT d'écrire : l'exclusion
 * d'abord, puis le collègue qui a contacté. Un contact sans signal n'a aucune ligne.
 */
export function useContactGuardrails(contactIds: readonly string[]) {
  const { user } = useSession()
  const ids = contactIds.filter(id => id.length > 0)
  return useQuery({
    queryKey: KEYS.check(ids),
    queryFn: () => teamGuardrailsApi.checkContacts(ids),
    enabled: !!user && ids.length > 0,
    // Une confirmation lit un fait récent : on ne la sert pas depuis un cache vieux.
    staleTime: 15_000,
  })
}

export function useDoNotContactList() {
  return useQuery({ queryKey: KEYS.dnc, queryFn: () => teamGuardrailsApi.listDoNotContact(), staleTime: 30_000 })
}

export function useAddDoNotContact() {
  const { t } = useTranslation('teamGuardrails')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddDoNotContactRequest) => teamGuardrailsApi.addDoNotContact(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-guardrails'] })
      toast.success(t('dnc.added'))
    },
    onError: () => toast.error(t('dnc.addFailed')),
  })
}

export function useLiftDoNotContact() {
  const { t } = useTranslation('teamGuardrails')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teamGuardrailsApi.liftDoNotContact(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team-guardrails'] })
      toast.success(t('dnc.lifted'))
    },
    onError: () => toast.error(t('dnc.liftFailed')),
  })
}

/** #4158.23 — ces consultants ont-ils déjà été présentés par un collègue (à ce client, ou sur une autre opportunité ouverte) ? */
export function useAlreadyProposed(projectId: string | null, consultantIds: readonly string[]) {
  const { user } = useSession()
  return useQuery({
    queryKey: KEYS.proposed(projectId ?? '', consultantIds),
    queryFn: () => teamGuardrailsApi.alreadyProposedOnProject(projectId as string, consultantIds),
    enabled: !!user && !!projectId && consultantIds.length > 0,
    staleTime: 30_000,
  })
}

/** #4158.24 — les fiches qui ressemblent à celle-ci. */
export function useDuplicateCandidates(kind: 'account' | 'contact', id: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: KEYS.duplicates(kind, id),
    queryFn: () => teamGuardrailsApi.duplicates(kind, id),
    enabled: !!user && id.length > 0,
    staleTime: 60_000,
  })
}

export function useProposeMerge(kind: 'account' | 'contact', id: string) {
  const { t } = useTranslation('teamGuardrails')
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (otherId: string) => teamGuardrailsApi.proposeMerge(kind, id, otherId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEYS.duplicates(kind, id) })
      toast.success(t('duplicates.proposed'))
    },
    onError: () => toast.error(t('duplicates.proposeFailed')),
  })
}

/** #4158.25 — l'équipe d'un compte. */
export function useAccountTeam(accountId: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: KEYS.team(accountId),
    queryFn: () => teamGuardrailsApi.accountTeam(accountId),
    enabled: !!user && accountId.length > 0,
    staleTime: 30_000,
  })
}

export function useAccountTeamMutations(accountId: string) {
  const { t } = useTranslation('teamGuardrails')
  const qc = useQueryClient()
  const onSuccess = () => void qc.invalidateQueries({ queryKey: KEYS.team(accountId) })
  const onError = () => toast.error(t('team.failed'))
  const add = useMutation({
    mutationFn: (userId: string) => teamGuardrailsApi.addTeamMember(accountId, userId),
    onSuccess,
    onError,
  })
  const remove = useMutation({
    mutationFn: (userId: string) => teamGuardrailsApi.removeTeamMember(accountId, userId),
    onSuccess,
    onError,
  })
  return { add, remove }
}

/**
 * #4996 — poser / retirer une zone. L'erreur de l'API (libellé trop court, entité d'un autre compte…) n'est PAS
 * avalée par un toast : elle remonte à l'appelant, qui la pose sous le champ.
 */
export function useAccountTeamScopeMutations(accountId: string) {
  const qc = useQueryClient()
  const onSuccess = () => void qc.invalidateQueries({ queryKey: KEYS.team(accountId) })
  const add = useMutation({
    mutationFn: (body: AddAccountTeamScopeRequest) => teamGuardrailsApi.addTeamScope(accountId, body),
    onSuccess,
  })
  const remove = useMutation({
    mutationFn: (args: { userId: string; scopeId: string }) =>
      teamGuardrailsApi.removeTeamScope(accountId, args.userId, args.scopeId),
    onSuccess,
  })
  return { add, remove }
}

/**
 * #4996.4 — les BU ACTIVES de l'espace, proposées comme zones. Même requête et même clé de cache que l'écran des
 * périmètres (`useMyBusinessUnits`) : une seule lecture. `null` tant que rien n'est lu ; `[]` si l'espace n'en a
 * aucune : la section reste là, avec sa phrase d'état vide et « Ajouter la BU ».
 */
export function useWorkspaceBusinessUnits(): { id: string; name: string }[] | null {
  const { data } = useQuery({
    queryKey: ['business-units'] as const,
    queryFn: () => businessUnitsApi.list(),
    staleTime: 60_000,
  })
  if (!data) return null
  return data.businessUnits.filter(b => b.status === 'active').map(b => ({ id: b.id, name: b.name }))
}

/**
 * #4996.4 — « Ajouter la BU » depuis le dialogue de périmètre. Gagé `team:manage` côté API. L'erreur n'est PAS avalée
 * par un toast : elle remonte à l'appelant, qui la pose dans le dialogue. Invalide la liste des BU (même clé que
 * `useWorkspaceBusinessUnits`) : la BU créée apparaît cochable.
 */
export function useCreateBusinessUnit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateBusinessUnit) => businessUnitsApi.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['business-units'] }),
  })
}

/** #4996 L5 — l'aperçu figé (une mutation : il ne s'écrit nulle part, mais se redemande à volonté). */
export function useDistributePreview(accountId: string) {
  return useMutation({ mutationFn: () => teamGuardrailsApi.distributePreview(accountId) })
}

export function useDistributeApply(accountId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fingerprint: string) => teamGuardrailsApi.distributeApply(accountId, fingerprint),
    // Des contacts ont changé de porteur : la liste du compte et le sélecteur se relisent.
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts'] }),
  })
}

/** #4996 L5 — le sélecteur de porteur ordonné : qui couvre l'entité du contact d'abord. Rien n'est présélectionné. */
export function useAssigneeCandidates(contactId: string, enabled = true) {
  const { user } = useSession()
  return useQuery({
    queryKey: KEYS.candidates(contactId),
    queryFn: () => teamGuardrailsApi.assigneeCandidates(contactId),
    enabled: !!user && enabled && contactId.length > 0,
    staleTime: 30_000,
  })
}

/** #4996 — les fiches d'entité du groupe (même requête que `GroupEntitiesCard`) : on fait suivre `ownerUserId`. */
export function useGroupEntityFiches(accountId: string) {
  return useQuery({
    queryKey: accountKeys.groupEntities(accountId),
    queryFn: () => accountsApi.groupEntities(accountId),
    enabled: accountId.length > 0,
  })
}
