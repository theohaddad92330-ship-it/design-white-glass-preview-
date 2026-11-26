import { Button } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'

type ExportRow = {
  label: string
  accountName: string | null
  personNames: readonly string[]
  startedOn: string | null
  endsOn: string | null
}

/**
 * Théo C missions-planning.N6 — EXPORTER le planning (la sélection courante, en tableau .csv).
 *
 * Une SORTIE de données : masquée quand la règle d'espace « qui peut exporter »
 * la refuse, et la preuve (`grant`) est exigée par `downloadCSV`. Une date
 * absente est une cellule vide, jamais une date supposée.
 */
export function PlanningExportButton({ rows }: { rows: readonly ExportRow[] }) {
  const { t } = useTranslation('missions')
  const { grant } = useDataExit()
  if (!grant) return null
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="pointer-coarse:min-h-11"
      disabled={rows.length === 0}
      onClick={() =>
        downloadCSV(
          toCsv([
            [
              t('planning.export.mission'),
              t('planning.export.account'),
              t('planning.export.consultant'),
              t('planning.export.start'),
              t('planning.export.end'),
            ],
            ...rows.map(row => [
              row.label,
              row.accountName ?? '',
              row.personNames.join(' · '),
              row.startedOn ?? '',
              row.endsOn ?? '',
            ]),
          ]),
          'planning-missions.csv',
          grant,
        )
      }
    >
      {t('planning.export.button')}
    </Button>
  )
}
