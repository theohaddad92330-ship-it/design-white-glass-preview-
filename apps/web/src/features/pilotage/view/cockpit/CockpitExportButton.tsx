import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { appLocale } from '@/lib/locale'
import type { CockpitFigures } from './useCockpitFigures'

/**
 * « Exporter la synthèse » — un fichier qui recopie les chiffres que le Cockpit montre,
 * jamais un second calcul : tuiles, cap du mois, encaissement, étapes. Un chiffre non lu
 * s'écrit « Non mesuré » dans le fichier, comme à l'écran. Le fichier porte sa date.
 *
 * Il ne sort qu'à travers la règle d'espace (`useDataExit`) : si l'espace refuse la sortie
 * de données, le bouton n'existe pas — pas de bouton qui rend un refus.
 */
export function CockpitExportButton({ figures }: { figures: CockpitFigures }) {
  const { t } = useTranslation('pilotage')
  const dataExit = useDataExit()
  if (!dataExit.allowed || !dataExit.grant) return null
  const grant = dataExit.grant

  const unknown = t('objective.notMeasured')
  const euros = (value: number | null) =>
    value === null
      ? unknown
      : new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
          value,
        )
  const count = (value: number | null) => (value === null ? unknown : String(value))

  const onExport = () => {
    const rows: string[][] = [
      [t('cockpit.export.title'), figures.month, new Date().toISOString().slice(0, 10)],
      [t('cockpit.tiles.pipe'), euros(figures.pipeOpen), t('cockpit.tiles.pipeMeta')],
      [t('cockpit.tiles.won'), euros(figures.won), figures.month],
      [t('cockpit.tiles.bench'), count(figures.bench), t('cockpit.tiles.benchMeta')],
      [t('cockpit.tiles.actions'), count(figures.actions?.open ?? null), t('cockpit.tiles.actionsMeta')],
      [t('objective.target'), euros(figures.objective?.target ?? null), figures.month],
      [t('cockpit.cash.collected'), euros(figures.cash?.collected ?? null), figures.month],
      [t('cockpit.cash.toFollow'), euros(figures.cash?.toFollow ?? null), figures.month],
      [t('cockpit.cash.drafts'), euros(figures.cash?.drafts ?? null), figures.month],
      ...figures.stages.map(entry => [t(`stages.${entry.stage}`), String(entry.count), t('cockpit.stages.title')]),
    ]
    downloadCSV(toCsv(rows), `${t('cockpit.export.file')}-${figures.month}.csv`, grant)
  }

  return (
    <button
      type="button"
      onClick={onExport}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
    >
      <Download aria-hidden className="size-4" />
      {t('cockpit.export.label')}
    </button>
  )
}
