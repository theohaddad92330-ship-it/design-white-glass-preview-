import type { NeedExportRequest } from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDataExit, workspaceRuleRefusalText } from '@/lib/data-exit'
import { downloadCSV, downloadJSON } from '@/lib/export-csv'
import { openNeedsApi } from '../api'

/**
 * #4016 L11 / #4295.14 — l'export de masse des besoins, UN seul endroit (GA-26) : la barre de sélection (besoins
 * cochés) et le bouton « Exporter » de l'en-tête (besoins visibles) passent par le même geste, la même route
 * (`POST /projects/needs/export`, `@DataExit()`) et la même règle d'espace.
 */
export function useNeedsExport(needIds: readonly string[]) {
  const { t, i18n } = useTranslation('projects')
  const { allowed, grant } = useDataExit()
  const [exporting, setExporting] = useState(false)

  const exportAs = async (format: NeedExportRequest['format'], audience?: NeedExportRequest['audience']) => {
    if (!grant || needIds.length === 0) return
    setExporting(true)
    try {
      const content = await openNeedsApi.exportSelection({
        needIds: [...needIds],
        format,
        ...(audience ? { audience } : {}),
        // #4295.14 — les en-têtes du fichier suivent la langue de l'interface.
        lang: i18n.language.startsWith('en') ? 'en' : 'fr',
      })
      const stamp = new Date().toISOString().slice(0, 10)
      if (format === 'json') downloadJSON(content, `besoins-${stamp}.json`, grant)
      else downloadCSV(content, `besoins-${stamp}.csv`, grant)
      toast.success(t('openNeeds.selection.exportDone', { count: needIds.length }))
    } catch (error) {
      // Un refus de la règle d'espace se DIT, jamais sous une erreur générique.
      toast.error(workspaceRuleRefusalText(error) ?? (error instanceof Error ? error.message : String(error)))
    } finally {
      setExporting(false)
    }
  }

  return { allowed, exporting, exportAs }
}
