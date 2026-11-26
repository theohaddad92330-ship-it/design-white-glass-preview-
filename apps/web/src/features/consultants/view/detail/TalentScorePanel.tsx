import { Card, Text, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { talentCompleteness, type TalentRow } from '@bellum/contracts'
import { TalentCompletenessScore } from '../TalentCompletenessScore'

/**
 * Refonte Théo (maquette `c/talents-fiche`, panneau « Score consultant ») —
 * EN CLAIR, JAMAIS EN POINTS (décision Louis 23/10/2026).
 *
 * La maquette écrit « 86 / 100 » et une barre par axe. Le produit garde la
 * place et la structure du panneau — un titre, les axes nommés un par un, la
 * phrase qui dit comment on lit — mais chaque axe dit un FAIT : renseigné, ou
 * ce qui manque. Le calcul reste `talentCompleteness` (contrats), le même que
 * la ligne du vivier : les deux surfaces disent la même chose.
 *
 * Aucun critère protégé (âge, genre, origine, photo, adresse) n'entre dans ces
 * axes — la phrase sous le panneau le dit à qui lit la fiche.
 */
export function TalentScorePanel({ row }: { row: TalentRow }) {
  const { t } = useTranslation('consultants')
  const axes = talentCompleteness(row).axes
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text element="h2" size="base" weight="semibold">
          {t('detail.sections.score')}
        </Text>
        <TalentCompletenessScore row={row} />
      </div>
      {row.reviewStatus === 'needs_review' ? null : (
        <ul className="flex flex-col gap-1.5" aria-label={t('detail.score.axesAria')}>
          {axes.map(axis => {
            const filled = axis.score > 0
            return (
              <li key={axis.key} className="flex items-center justify-between gap-3">
                <Text size="sm">{t(`completeness.axes.${axis.key}`)}</Text>
                <span
                  className={cn(
                    'rounded-badge px-2 py-0.5 text-xs font-medium',
                    filled
                      ? 'bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]'
                      : 'bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
                  )}
                >
                  {filled ? t('detail.score.filled') : t('detail.score.missing')}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('detail.score.hint')}
      </Text>
    </Card>
  )
}
