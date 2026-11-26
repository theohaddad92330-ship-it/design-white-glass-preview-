import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { BusinessUnitView, CreateBusinessUnit, UpdateBusinessUnit } from '@bellum/contracts'
import { businessUnitsApi } from '@/features/business-units/api'

const businessUnitsKey = ['business-units'] as const

/** Les cinq champs de la fiche (#2005.5) — jamais les autres, un `PATCH` qui
 *  porterait `name`/`kind`/`status` déborderait du formulaire qui l'envoie. */
export type BusinessUnitFicheInput = {
  capacityAvailableConsultants: number | null
  quarterObjective: string | null
  consultantCount: number | null
  teamSize: number | null
  portfolioNote: string | null
}

/**
 * #2005.5 — la fiche d'un périmètre de travail : capacité, objectif du
 * trimestre, et les champs préexistants qu'aucun écran ne pouvait éditer.
 *
 * Même clé de cache (`business-units`) que `useMyBusinessUnits` : une seule
 * liste, jamais deux copies qui divergent (GA-26).
 */
export function useBusinessUnitAdmin() {
  const { t } = useTranslation('businessUnitsAdmin')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: businessUnitsKey,
    queryFn: () => businessUnitsApi.list(),
    staleTime: 60_000,
  })

  const update = useMutation<BusinessUnitView, Error, { id: string; name: string; patch: UpdateBusinessUnit }>({
    mutationFn: ({ id, patch }) => businessUnitsApi.update(id, patch),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: businessUnitsKey })
      toast.success(t('toast.saved', { name: variables.name }))
    },
    onError: () => toast.error(t('toast.saveFailed')),
  })

  const create = useMutation<BusinessUnitView, Error, CreateBusinessUnit>({
    mutationFn: input => businessUnitsApi.create(input),
    onSuccess: created => {
      void queryClient.invalidateQueries({ queryKey: businessUnitsKey })
      toast.success(t('toast.created', { name: created.name }))
    },
    onError: () => toast.error(t('toast.createFailed')),
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    save: (id: string, name: string, patch: UpdateBusinessUnit, onDone?: () => void) =>
      update.mutate({ id, name, patch }, { onSuccess: () => onDone?.() }),
    create: (input: CreateBusinessUnit, onDone?: () => void) => create.mutate(input, { onSuccess: () => onDone?.() }),
    creating: create.isPending,
    /** L'identifiant du périmètre dont l'enregistrement est en vol. */
    savingId: update.isPending ? (update.variables?.id ?? null) : null,
  }
}
