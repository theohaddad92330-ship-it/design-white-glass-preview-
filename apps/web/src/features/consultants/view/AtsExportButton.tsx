import { Button } from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { useAtsExport } from '../hooks'
import { generateAtsCSV } from '../lib/atsExport'

/**
 * #2326.8 (épopée #2794) — export du vivier ENTIER (hors archivés) au format
 * ATS. Distinct d'« Exporter la sélection » (#2662.3, `ConsultantsPage.tsx`,
 * les lignes déjà chargées à l'écran) : celui-ci interroge TOUT l'espace,
 * même règle que `GET stats`. Le fichier CSV lui-même n'est construit QUE
 * dans le navigateur (garde `a-csv-leaves-only-through-the-workspace-rule`),
 * derrière la MÊME règle d'espace que le reste des exports du vivier.
 */
export function AtsExportButton() {
  const { t } = useTranslation('consultants')
  const dataExit = useDataExit()
  const atsExport = useAtsExport()

  const run = async () => {
    if (!dataExit.grant) return
    try {
      const report = await atsExport.mutateAsync()
      if (report.items.length === 0) {
        toast.info(t('atsExport.empty'))
        return
      }
      if (report.truncated) toast.warning(t('atsExport.truncated', { max: report.items.length }))
      const csv = generateAtsCSV(report.items)
      downloadCSV(csv, `vivier-ats-${new Date().toISOString().slice(0, 10)}.csv`, dataExit.grant)
    } catch {
      toast.error(t('atsExport.working'))
    }
  }

  if (!dataExit.allowed) return null

  return (
    <Button variant="outline" size="sm" icon={Download} disabled={atsExport.isPending} onClick={() => void run()}>
      {t('atsExport.cta')}
    </Button>
  )
}
