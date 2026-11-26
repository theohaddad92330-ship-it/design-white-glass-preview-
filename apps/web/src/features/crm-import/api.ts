import type {
  CrmFirstImportResponse,
  IntegrationExchange,
  CrmReadStatus,
  KeepCrmValueInput,
  StartSyncInput,
  SyncOutcome,
  SyncRun,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

export const crmImportKeys = {
  runs: () => ['crm', 'import', 'runs'] as const,
  status: () => ['crm', 'import', 'status'] as const,
  firstImport: () => ['crm', 'import', 'first-import'] as const,
  exchanges: () => ['crm', 'import', 'exchanges'] as const,
}

export const crmImportApi = {
  runs(): Promise<{ items: SyncRun[] }> {
    return apiFetch<{ items: SyncRun[] }>({ path: '/crm/import/runs' })
  },
  /** #4189 — par CRM branché : périmètre lu, date de dernière synchro, erreur, fiches en conflit. */
  status(): Promise<{ items: CrmReadStatus[] }> {
    return apiFetch<{ items: CrmReadStatus[] }>({ path: '/crm/import/status' })
  },
  /** SYNC-B — la première reprise de chaque CRM branché : progression par objet, résumé, erreurs nommées. */
  firstImport(): Promise<CrmFirstImportResponse> {
    return apiFetch<CrmFirstImportResponse>({ path: '/crm/import/first-import' })
  },
  /** #4189.9 — « Garder la valeur du CRM » : un geste, tracé dans l'historique de la fiche. */
  keepCrmValue(input: KeepCrmValueInput): Promise<{ field: string; value: string }> {
    return apiFetch<{ field: string; value: string }, KeepCrmValueInput>({
      path: '/crm/import/conflicts/keep-crm',
      method: 'POST',
      body: input,
    })
  },
  /** Théo D settings-integrations.N3 — « Garder la valeur Bellum » : le choix se retient sur l'écart, rien n'est réécrit. */
  keepBellumValue(input: KeepCrmValueInput): Promise<{ field: string }> {
    return apiFetch<{ field: string }, KeepCrmValueInput>({
      path: '/crm/import/conflicts/keep-bellum',
      method: 'POST',
      body: input,
    })
  },
  /** Théo D settings-integrations.N4 — l'historique des échanges avec les outils branchés. */
  exchanges(): Promise<{ items: IntegrationExchange[] }> {
    return apiFetch<{ items: IntegrationExchange[] }>({ path: '/crm/import/exchanges' })
  },
  run(input: StartSyncInput): Promise<SyncOutcome> {
    return apiFetch<SyncOutcome, StartSyncInput>({ path: '/crm/import', method: 'POST', body: input })
  },
}

export function useCrmImportRuns() {
  return useQuery({
    queryKey: crmImportKeys.runs(),
    queryFn: crmImportApi.runs,
    select: response => response.items,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

export function useCrmReadStatus(enabled: boolean) {
  return useQuery({
    queryKey: crmImportKeys.status(),
    queryFn: crmImportApi.status,
    select: response => response.items,
    enabled,
    staleTime: 30_000,
  })
}

/** SYNC-B — se relit toutes les 3 s tant qu'une reprise est en file ou en cours, puis s'arrête. */
export function useCrmFirstImport() {
  return useQuery({
    queryKey: crmImportKeys.firstImport(),
    queryFn: crmImportApi.firstImport,
    select: response => response.items,
    refetchInterval: query =>
      query.state.data?.items.some(item => item.state === 'queued' || item.state === 'running') ? 3000 : false,
  })
}

export function useRunCrmImport() {
  const qc = useQueryClient()
  return useMutation<SyncOutcome, Error, StartSyncInput>({
    mutationFn: input => crmImportApi.run(input),
    onSuccess: outcome => {
      qc.invalidateQueries({ queryKey: crmImportKeys.runs() })
      qc.invalidateQueries({ queryKey: crmImportKeys.status() })
      // Un import RÉEL a changé la base : l'entité importée doit se relire.
      // #2388.24 — un import de comptes ne doit PAS invalider les contacts :
      // une clé fausse laisserait l'écran Comptes affiché comme à jour alors
      // qu'il vient d'être écrit.
      if (!outcome.dryRun)
        qc.invalidateQueries({ queryKey: outcome.entityType === 'account' ? ['accounts'] : ['contacts'] })
      if (outcome.unavailable) {
        // L'erreur du fournisseur est montrée TELLE QUELLE : « l'import a
        // échoué » n'aide personne, « 401 invalid_grant » se répare.
        toast.error(outcome.unavailable)
      } else if (outcome.dryRun) {
        toast.info(i18n.t('crmImport:toast.simulated', { count: outcome.created + outcome.updated }))
      } else {
        toast.success(i18n.t('crmImport:toast.done', { count: outcome.created + outcome.updated }))
      }
    },
    onError: error => toast.error(error.message || i18n.t('crmImport:toast.error')),
  })
}

/** #4189.9 — le geste ; la fiche et la liste des écarts se relisent, l'erreur (correction humaine postérieure…) est dite telle quelle. */
export function useKeepCrmValue() {
  const qc = useQueryClient()
  return useMutation<{ field: string; value: string }, Error, KeepCrmValueInput>({
    mutationFn: input => crmImportApi.keepCrmValue(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmImportKeys.status() })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(i18n.t('crmImport:toast.keptCrm'))
    },
    onError: error => toast.error(error.message || i18n.t('crmImport:toast.error')),
  })
}

/** Théo D settings-integrations.N3 — retenir « Bellum » sur un écart ; la liste À relire se relit. */
export function useKeepBellumValue() {
  const qc = useQueryClient()
  return useMutation<{ field: string }, Error, KeepCrmValueInput>({
    mutationFn: input => crmImportApi.keepBellumValue(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmImportKeys.status() })
    },
    onError: error => toast.error(error.message || i18n.t('crmImport:toast.error')),
  })
}

export function useCrmExchanges(enabled = true) {
  return useQuery({
    queryKey: crmImportKeys.exchanges(),
    queryFn: crmImportApi.exchanges,
    select: response => response.items,
    enabled,
    staleTime: 30_000,
  })
}
