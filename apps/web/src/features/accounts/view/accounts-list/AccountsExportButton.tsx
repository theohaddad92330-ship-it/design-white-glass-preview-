import { TooltipButton } from '@bellum/ui'
import { capitalize } from '@bellum/utils'
import { relationStatusOf } from '@bellum/contracts'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDataExit } from '@/lib/data-exit'
import { toCsv } from '@/lib/csv'
import { downloadCSV } from '@/lib/export-csv'
import { TEAM_DECISION_LABEL_KEY, teamDecisionOf } from './teamDecision'
import type { AccountRow } from './types'

/**
 * Le CSV des comptes AFFICHÉS — les colonnes du tableau, écrites en mots (décision, relation), jamais un
 * score. Une cellule absente reste vide, jamais « 0 ».
 */
function buildAccountsCsv(rows: readonly AccountRow[], t: (key: string) => string): string {
  const header = [
    t('table.company'),
    t('table.sector'),
    t('table.primarySignal'),
    t('table.nextAction'),
    t('table.relation'),
    t('table.owner'),
    t('table.decision'),
  ]
  const lines = rows.map(row => {
    const decision = teamDecisionOf(row)
    return [
      capitalize(row.company_name),
      row.sector ?? '',
      row.signal_preview?.label ?? row.primary_signal ?? '',
      row.next_action_label?.trim() ?? '',
      t(`relationStatus.${relationStatusOf(row.commercial_status).primary}`),
      row.owner?.name ?? '',
      decision ? t(TEAM_DECISION_LABEL_KEY[decision]) : '',
    ]
  })
  return toCsv([header, ...lines])
}

/**
 * Refonte Théo — « Exporter les comptes affichés ». Le fichier part par `downloadCSV`, donc par la règle
 * d'espace « qui peut exporter » : sans autorisation, ou sans ligne affichée, le bouton n'existe pas
 * (garde `a-csv-leaves-only-through-the-workspace-rule`). Rien n'est écrit chez un tiers.
 */
export function AccountsExportButton({ rows }: { rows: readonly AccountRow[] }) {
  const { t } = useTranslation('accounts')
  const { allowed, grant } = useDataExit()
  if (!allowed || !grant || rows.length === 0) return null
  const label = t('toolbar.export', { count: rows.length })
  return (
    <TooltipButton
      type="button"
      variant="outline"
      size="icon"
      tooltip={label}
      tooltipSide="bottom"
      aria-label={label}
      onClick={() => {
        downloadCSV(buildAccountsCsv(rows, t), `comptes-${new Date().toISOString().slice(0, 10)}.csv`, grant)
        toast.success(t('toolbar.exportDone', { count: rows.length }))
      }}
      className="size-10 shrink-0 rounded-control"
    >
      <Download className="size-4" aria-hidden />
    </TooltipButton>
  )
}
