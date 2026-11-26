import { Input, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { FIELD_TITLE } from './AnalyzeChrome'

/**
 * #4142 — audit du cadrage /search (« est-ce qu'il y a des choses qui
 * manquent ? »). `headcount_min`/`headcount_max` (#2624.1, `analysis.ts`)
 * étaient déclarés et déjà LUS côté serveur (`market-memory.service.ts`,
 * `pappers/discovery.py`, `phase1_research.py`) mais sans aucun appelant web
 * sur CE cadrage — contrairement aux cinq champs voisins (entités, niveaux,
 * géo, famille métier), déjà câblés ici pour la même raison (#2163.9-30).
 *
 * `undefined`, jamais `0` : un champ vidé efface sa borne (« non mesuré »
 * n'est jamais zéro) — l'absence de minimum n'est pas « au moins zéro
 * salarié ».
 */
export function HeadcountField({
  min,
  max,
  onChange,
  disabled = false,
}: {
  min: number | undefined
  max: number | undefined
  onChange: (next: { min: number | undefined; max: number | undefined }) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')

  const parse = (raw: string): number | undefined => {
    if (raw.trim() === '') return undefined
    const value = Number(raw)
    return Number.isFinite(value) ? value : undefined
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" className={FIELD_TITLE}>
        {t('confirm.headcount.label')}
      </Text>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('confirm.headcount.minLabel')}
          </Text>
          <Input
            type="number"
            min={0}
            aria-label={t('confirm.headcount.minLabel')}
            placeholder={t('confirm.headcount.minPlaceholder')}
            value={min ?? ''}
            disabled={disabled}
            onChange={event => onChange({ min: parse(event.target.value), max })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('confirm.headcount.maxLabel')}
          </Text>
          <Input
            type="number"
            min={0}
            aria-label={t('confirm.headcount.maxLabel')}
            placeholder={t('confirm.headcount.maxPlaceholder')}
            value={max ?? ''}
            disabled={disabled}
            onChange={event => onChange({ min, max: parse(event.target.value) })}
          />
        </label>
      </div>
    </div>
  )
}
