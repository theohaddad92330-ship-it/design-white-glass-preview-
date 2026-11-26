import type { QualificationCriterion, QualificationManualInput } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { qualificationGridApi } from '../lib/qualification-grid-api'

const GRID_KEY = ['qualification-grid'] as const
const accountKey = (accountId: string) => ['qualification-grid', 'account', accountId] as const

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

/** #3755 — la grille active de l'espace : lecture, édition (nouvelle version), import. */
export function useQualificationGrid() {
  const { t } = useTranslation('qualificationGrid')
  const queryClient = useQueryClient()

  const query = useQuery({ queryKey: GRID_KEY, queryFn: () => qualificationGridApi.getActive(), retry: false })

  const onSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ['qualification-grid'] })
    toast.success(t('saved'))
  }

  const save = useMutation({
    mutationFn: (criteria: QualificationCriterion[]) => qualificationGridApi.save(criteria),
    onSuccess: onSaved,
    // Le refus de l'API est NOMMÉ (« total 95/100 ») : on l'affiche tel quel.
    onError: error => toast.error(errorMessage(error, t('saveFailed'))),
  })

  const importFile = useMutation({
    mutationFn: (file: { format: 'xlsx' | 'csv'; content: string }) => qualificationGridApi.import(file),
    onSuccess: result => {
      onSaved()
      // #4426.6 — ce que l'import n'a pas pris se dit : lignes de synthèse ignorées, lignes incomplètes écartées.
      const report = result.import_report
      if (report && report.ignored > 0) toast.info(t('importIgnored', { count: report.ignored }))
      if (report && report.skipped.length > 0) {
        toast.warning(t('importSkipped', { count: report.skipped.length, rows: report.skipped.slice(0, 5).join(', ') }))
      }
    },
    onError: error => toast.error(errorMessage(error, t('importFailed'))),
  })

  return {
    grid: query.data?.grid ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    save: (criteria: QualificationCriterion[]) => save.mutate(criteria),
    importFile: (file: { format: 'xlsx' | 'csv'; content: string }) => importFile.mutate(file),
    saving: save.isPending || importFile.isPending,
  }
}

/** #3755 — la qualification d'un compte : lecture, correction manuelle, réévaluation. */
export function useAccountQualification(accountId: string) {
  const { t } = useTranslation('qualificationGrid')
  const queryClient = useQueryClient()
  const key = accountKey(accountId)

  const query = useQuery({ queryKey: key, queryFn: () => qualificationGridApi.account(accountId), retry: false })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
    // Le verdict de la fiche se lit sur le dossier (`raw_analysis.qualification`).
    void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    void queryClient.invalidateQueries({ queryKey: ['account', accountId] })
  }

  const setManual = useMutation({
    mutationFn: (args: { code: string; input: QualificationManualInput }) =>
      qualificationGridApi.setManual(accountId, args.code, args.input),
    onSuccess: refresh,
    onError: error => toast.error(errorMessage(error, t('saveFailed'))),
  })

  const clearManual = useMutation({
    mutationFn: (code: string) => qualificationGridApi.clearManual(accountId, code),
    onSuccess: refresh,
    onError: error => toast.error(errorMessage(error, t('saveFailed'))),
  })

  const evaluate = useMutation({
    mutationFn: () => qualificationGridApi.evaluate(accountId),
    onSuccess: result => {
      refresh()
      if (result.status === 'unavailable') toast.error(t('evaluateUnavailable'))
    },
    onError: () => toast.error(t('evaluateUnavailable')),
  })

  return {
    qualification: query.data?.qualification ?? null,
    isLoading: query.isLoading,
    setManual: (code: string, input: QualificationManualInput) => setManual.mutate({ code, input }),
    clearManual: (code: string) => clearManual.mutate(code),
    evaluate: () => evaluate.mutate(),
    busy: setManual.isPending || clearManual.isPending || evaluate.isPending,
  }
}
