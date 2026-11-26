import type {
  AutoMergedPairView,
  CreateCustomFieldInput,
  CreateSavedViewDraft,
  CustomFieldDef,
  CustomFieldEntity,
  DecideDuplicateInput,
  DuplicatePairView,
  DuplicateScanView,
  SavedView,
  SavedViewScope,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountsApi } from '@/features/accounts/api'
import { apiFetch } from '@/lib/api'

export const governanceKeys = {
  views: (scope: SavedViewScope) => ['governance', 'views', scope] as const,
  fields: (entityType: CustomFieldEntity) => ['governance', 'fields', entityType] as const,
  duplicates: () => ['governance', 'duplicates'] as const,
  autoMerged: () => ['governance', 'duplicates', 'auto-merged'] as const,
}

/** #4599.4 — la réponse de `POST /contacts/placeholder-email-catchup` (simulation ou exécution bornée). */
type PlaceholderEmailCatchupOutcome = {
  dry_run: boolean
  examined: number
  cleared: number
  skipped: number
  limit: number
  limit_reached?: boolean
}

export const governanceApi = {
  views(scope: SavedViewScope): Promise<{ items: SavedView[] }> {
    return apiFetch<{ items: SavedView[] }>({ path: `/governance/views?scope=${scope}` })
  },
  createView(input: CreateSavedViewDraft): Promise<SavedView> {
    return apiFetch<SavedView, CreateSavedViewDraft>({ path: '/governance/views', method: 'POST', body: input })
  },
  removeView(id: string): Promise<void> {
    return apiFetch<void>({ path: `/governance/views/${id}`, method: 'DELETE' })
  },
  /** #3873 — « Rejouer » EST une exécution : elle se date côté serveur. */
  markViewRun(id: string): Promise<void> {
    return apiFetch<void>({ path: `/governance/views/${id}/run`, method: 'PUT' })
  },
  fields(entityType: CustomFieldEntity): Promise<{ items: CustomFieldDef[] }> {
    return apiFetch<{ items: CustomFieldDef[] }>({ path: `/governance/fields?entityType=${entityType}` })
  },
  createField(input: CreateCustomFieldInput): Promise<CustomFieldDef> {
    return apiFetch<CustomFieldDef, CreateCustomFieldInput>({
      path: '/governance/fields',
      method: 'POST',
      body: input,
    })
  },
  archiveField(id: string): Promise<void> {
    return apiFetch<void>({ path: `/governance/fields/${id}`, method: 'DELETE' })
  },
  /** `fresh` : rebalayer sans attendre la fenêtre de 5 minutes (un geste vient de changer les comptes). */
  duplicates(options: { fresh?: boolean } = {}): Promise<DuplicatesResponse> {
    return apiFetch<DuplicatesResponse>({
      path: options.fresh ? '/governance/duplicates?fresh=1' : '/governance/duplicates',
    })
  },
  /** #4599.4 — admin d'espace seulement (le serveur le re-vérifie) ; `dryRun` d'abord, l'exécution se demande. */
  placeholderEmailCatchup(input: { dryRun: boolean }): Promise<PlaceholderEmailCatchupOutcome> {
    return apiFetch<PlaceholderEmailCatchupOutcome, { dryRun: boolean }>({
      path: '/contacts/placeholder-email-catchup',
      method: 'POST',
      body: input,
    })
  },
  decide(id: string, input: DecideDuplicateInput): Promise<void> {
    return apiFetch<void, DecideDuplicateInput>({
      path: `/governance/duplicates/${id}/decide`,
      method: 'POST',
      body: input,
    })
  },
  /** #4016 L6 — les fusions automatiques en vigueur (≥ 0,99, dans Bellum seulement). */
  autoMerged(): Promise<{ items: AutoMergedPairView[] }> {
    return apiFetch<{ items: AutoMergedPairView[] }>({ path: '/governance/duplicates/auto-merged' })
  },
  /** #4016 L6 — annuler une fusion automatique : la fiche revient, la paire ne revient plus. */
  undoMerge(id: string): Promise<{ restored: boolean }> {
    return apiFetch<{ restored: boolean }>({ path: `/governance/duplicates/${id}/undo-merge`, method: 'POST' })
  },
}

/**
 * Les vues enregistrées d'un écran.
 *
 * `enabled` existe pour une raison précise : le contrôleur porte
 * `@RequireFeature('crm_native')`, donc sur une offre qui ne l'ouvre pas la
 * requête part pour récolter un 403. L'écran qui SAIT déjà que la capacité
 * manque n'a pas à la poser — il dégrade et le dit.
 */
export function useSavedViews(scope: SavedViewScope, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: governanceKeys.views(scope),
    queryFn: () => governanceApi.views(scope),
    select: response => response.items,
    enabled: options?.enabled ?? true,
    staleTime: 0,
  })
}

/**
 * Les deux écritures ne TOASTENT pas ici : elles servent des écrans qui ont
 * chacun leur vocabulaire (« vue », « liste », « segment » selon l'objet), et
 * un message écrit dans le catalogue de la gouvernance parlerait de la mauvaise
 * chose sur la moitié d'entre eux. L'appelant passe son `onSuccess`/`onError`.
 */
export function useCreateSavedView(scope: SavedViewScope) {
  const qc = useQueryClient()
  return useMutation<SavedView, Error, CreateSavedViewDraft>({
    mutationFn: input => governanceApi.createView(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: governanceKeys.views(scope) }),
  })
}

export function useRemoveSavedView(scope: SavedViewScope) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => governanceApi.removeView(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: governanceKeys.views(scope) }),
  })
}

/** #3873 — marque la vue comme REJOUÉE : la liste se relit, « Jamais rejouée » doit disparaître. */
export function useMarkSavedViewRun(scope: SavedViewScope) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => governanceApi.markViewRun(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: governanceKeys.views(scope) }),
  })
}

export function useCustomFields(entityType: CustomFieldEntity) {
  return useQuery({
    queryKey: governanceKeys.fields(entityType),
    queryFn: () => governanceApi.fields(entityType),
    select: response => response.items,
    staleTime: 0,
  })
}

export function useCreateCustomField(entityType: CustomFieldEntity) {
  const qc = useQueryClient()
  return useMutation<CustomFieldDef, Error, CreateCustomFieldInput>({
    mutationFn: input => governanceApi.createField(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: governanceKeys.fields(entityType) })
      toast.success(i18n.t('governance:fields.created'))
    },
    // Le serveur EXPLIQUE le refus (borne atteinte, clé déjà prise) : le
    // remplacer par un libellé générique perdrait la seule information utile.
    onError: error => toast.error(error.message || i18n.t('governance:fields.error')),
  })
}

export function useArchiveCustomField(entityType: CustomFieldEntity) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => governanceApi.archiveField(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: governanceKeys.fields(entityType) })
      toast.success(i18n.t('governance:fields.archived'))
    },
    onError: () => toast.error(i18n.t('governance:fields.error')),
  })
}

/** #3490 — `scan` : ce que le dernier balayage a examiné (`null` : rien balayé). */
type DuplicatesResponse = { items: DuplicatePairView[]; scan?: DuplicateScanView | null }

export function useDuplicatesScan() {
  return useQuery({
    queryKey: governanceKeys.duplicates(),
    queryFn: () => governanceApi.duplicates(),
    select: response => response.scan ?? null,
    staleTime: 0,
    refetchOnMount: 'always',
  }).data
}

export function useDuplicates() {
  return useQuery({
    queryKey: governanceKeys.duplicates(),
    queryFn: () => governanceApi.duplicates(),
    select: response => response.items,
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/**
 * #3490 — DÉSARCHIVER un compte écarté du balayage : la paire qui l'attendait
 * (« Societe Generale » / « Société Générale ») apparaît aussitôt, parce que la
 * relecture suivante force un balayage au lieu d'attendre 5 minutes. Le geste
 * rend le dossier (tri « À trier ») ; il ne fusionne rien.
 */
export function useRestoreArchivedAccount() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, string>({
    mutationFn: async id => {
      await accountsApi.setCommercialStatus(id, 'inbox')
      return qc.fetchQuery({
        queryKey: governanceKeys.duplicates(),
        queryFn: () => governanceApi.duplicates({ fresh: true }),
        staleTime: 0,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(i18n.t('governance:duplicates.restored'))
    },
    onError: () => toast.error(i18n.t('governance:duplicates.restoreError')),
  })
}

export function useDecideDuplicate() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string } & DecideDuplicateInput>({
    mutationFn: ({ id, ...input }) => governanceApi.decide(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: governanceKeys.duplicates() })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(i18n.t('governance:duplicates.decided'))
    },
    onError: () => toast.error(i18n.t('governance:duplicates.error')),
  })
}

/** #4016 L6 — ce que le balayeur a fusionné seul, lisible et annulable. */
export function useAutoMergedDuplicates() {
  return useQuery({
    queryKey: governanceKeys.autoMerged(),
    queryFn: () => governanceApi.autoMerged(),
    select: response => response.items,
    staleTime: 0,
  })
}

export function useUndoAutoMerge() {
  const qc = useQueryClient()
  return useMutation<{ restored: boolean }, Error, string>({
    mutationFn: id => governanceApi.undoMerge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: governanceKeys.duplicates() })
      qc.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(i18n.t('governance:duplicates.autoMerged.undone'))
    },
    onError: () => toast.error(i18n.t('governance:duplicates.autoMerged.undoError')),
  })
}

/**
 * #4599.4 — le rattrapage des adresses gabarit, par l'admin de l'espace : la simulation compte, l'exécution vide
 * (≤ 100 fiches) et rafraîchit les contacts. Jamais lancé seul : seul un clic appelle `mutate`.
 */
export function usePlaceholderEmailCatchup() {
  const qc = useQueryClient()
  return useMutation<PlaceholderEmailCatchupOutcome, Error, { dryRun: boolean }>({
    mutationFn: input => governanceApi.placeholderEmailCatchup(input),
    onSuccess: outcome => {
      if (!outcome.dry_run) qc.invalidateQueries({ queryKey: ['contacts'] })
    },
  })
}
