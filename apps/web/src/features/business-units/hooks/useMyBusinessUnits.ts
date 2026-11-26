import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { BusinessUnitView, CreateBusinessUnit } from '@bellum/contracts'
import { businessUnitsApi } from '@/features/business-units/api'

const businessUnitsKey = ['business-units'] as const

/**
 * Les portées de mémoire proposées dépendent des périmètres PORTÉS
 * (`useMemoryScopeOptions`) : rejoindre un périmètre doit les rafraîchir, sinon
 * la carte Mémoire ne proposerait pas celui qu'on vient de rejoindre.
 */
const memoryScopeOptionsKey = ['memory', 'scope-options'] as const

type UnitRef = { id: string; name: string }

/**
 * #2118.9 — mes périmètres, et les deux gestes qui les changent POUR MOI.
 *
 * `join` inscrit la personne (accès `workspace` seulement : le serveur refuse
 * un membre cloisonné, qui passe par `requestAccess`). Les BU portées partent
 * ensuite au moteur (`esn-profile-workspace.resolver.ts`) : le verdict des
 * prochaines analyses les cite.
 */
export function useMyBusinessUnits() {
  const { t } = useTranslation('profile')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: businessUnitsKey,
    queryFn: () => businessUnitsApi.list(),
    staleTime: 60_000,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: businessUnitsKey })
    void queryClient.invalidateQueries({ queryKey: memoryScopeOptionsKey })
  }

  const join = useMutation<unknown, Error, UnitRef>({
    mutationFn: unit => businessUnitsApi.join(unit.id),
    onSuccess: (_result, unit) => {
      refresh()
      toast.success(t('businessUnits.toast.joined', { name: unit.name }))
    },
    onError: () => toast.error(t('businessUnits.toast.joinError')),
  })

  const requestAccess = useMutation<unknown, Error, UnitRef>({
    mutationFn: unit => businessUnitsApi.requestAccess(unit.id),
    onSuccess: (_result, unit) => {
      refresh()
      toast.success(t('businessUnits.toast.requested', { name: unit.name }))
    },
    onError: () => toast.error(t('businessUnits.toast.requestError')),
  })

  // #2017.7 / #2087.17 — « en créer une ». Le créateur en devient responsable
  // ET membre côté serveur (`BusinessUnitService.create`) : `refresh()` suffit,
  // aucun `join` séparé à envoyer derrière.
  const create = useMutation<BusinessUnitView, Error, CreateBusinessUnit>({
    mutationFn: input => businessUnitsApi.create(input),
    onSuccess: created => {
      refresh()
      toast.success(t('businessUnits.toast.created', { name: created.name }))
    },
    onError: () => toast.error(t('businessUnits.toast.createError')),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    join: (unit: UnitRef) => join.mutate(unit),
    requestAccess: (unit: UnitRef) => requestAccess.mutate(unit),
    create: (input: CreateBusinessUnit) => create.mutateAsync(input),
    creating: create.isPending,
    /** L'identifiant du périmètre dont un geste est en vol — un seul bouton se désactive. */
    pendingId:
      (join.isPending ? join.variables?.id : requestAccess.isPending ? requestAccess.variables?.id : null) ?? null,
  }
}
