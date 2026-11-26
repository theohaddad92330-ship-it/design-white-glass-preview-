import { FORECAST_CATEGORIES, type ForecastCategory, type ProjectRow } from '@bellum/contracts'
import { SelectField, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useUpdateForecastCategory } from '../hooks/useUpdateProjectForecast'

/**
 * LE SÉLECTEUR de la catégorie DÉCLARÉE — « Engagé », « Possible », « Pipe »,
 * « Hors prévision » (L2 Pipe, Louis 14/10/2026).
 *
 * C'est une DÉCLARATION du commercial, pas une probabilité : aucun pourcentage
 * n'est associé, aucun total pondéré n'en découle. « Non déclarée » (`null`) est
 * une vraie réponse — jamais deviné depuis l'étape.
 *
 * Le composant est BÊTE (valeur + `onChange`) : la fiche et la table
 * d'inspection de `/pilotage/pipe` le montent chacune avec leur propre geste
 * d'écriture, mais les libellés vivent ICI, une seule fois (GA-26).
 */
export function ForecastCategorySelect({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className,
}: {
  value: ForecastCategory | null | undefined
  onChange: (next: ForecastCategory | null) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
}) {
  const { t } = useTranslation('projects')
  return (
    <SelectField
      value={value ?? ''}
      onChange={next => onChange(next === '' ? null : (next as ForecastCategory))}
      options={FORECAST_CATEGORIES.map(category => ({ value: category, label: t(`forecastCategory.${category}`) }))}
      emptyOption={{ label: t('forecastCategory.undeclared') }}
      ariaLabel={ariaLabel}
      disabled={disabled}
      className={className ?? 'h-11'}
    />
  )
}

/** Le même sélecteur, branché sur la fiche opportunité (tiroir et dossier). */
export function ProjectForecastCategoryControl({ opportunity }: { opportunity: ProjectRow }) {
  const { t } = useTranslation('projects')
  const update = useUpdateForecastCategory()
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pl-5" data-testid="project-forecast-category">
      <Text size="xs" color="text-muted-foreground">
        {t('forecastCategory.label')}
      </Text>
      <ForecastCategorySelect
        value={opportunity.forecast_category}
        ariaLabel={t('forecastCategory.label')}
        disabled={update.isPending}
        onChange={category => update.mutate({ id: opportunity.id, category })}
        className="h-11 w-44"
      />
      <Text size="xs" color="text-muted-foreground" className="basis-full">
        {t('forecastCategory.hint')}
      </Text>
      {update.isError ? (
        <Text size="xs" role="alert" className="basis-full text-[var(--danger-soft-text)]">
          {t('forecastCategory.saveError')}
        </Text>
      ) : null}
    </div>
  )
}
