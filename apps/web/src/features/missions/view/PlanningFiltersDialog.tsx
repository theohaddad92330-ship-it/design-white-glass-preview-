import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PLANNING_FILTER_KEYS, toggleValue, type PlanningFilterKey, type PlanningFilters } from '../planning-views'

export type PlanningFilterOption = { value: string; label: string }

/** Les quatre critères qui répondent le plus souvent ; les autres vivent sous « Plus de filtres ». */
const PRIMARY_KEYS: readonly PlanningFilterKey[] = ['account', 'consultant', 'owner', 'situation']

/**
 * Théo missions-planning.R6 — « FILTRER LE PLANNING ».
 *
 * Une fenêtre, pas une barre d'étiquettes : « la même sélection s'applique au
 * planning et au tableau ». MULTI-SÉLECTION partout, les critères pertinents
 * d'abord et le reste sous « Plus de filtres » (décision de Louis, 23/10/2026).
 * Un critère n'apparaît qu'une fois ; un critère sans aucune valeur
 * proposable ne s'affiche pas — il ne pourrait que rendre un planning vide.
 *
 * Le brouillon vit dans la fenêtre : rien ne bouge derrière tant que
 * « Appliquer » n'est pas pressé.
 */
export function PlanningFiltersDialog({
  open,
  onOpenChange,
  filters,
  options,
  onApply,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: PlanningFilters
  options: Record<PlanningFilterKey, readonly PlanningFilterOption[]>
  onApply: (next: PlanningFilters) => void
}) {
  const { t } = useTranslation('missions')
  // Le brouillon est repris des filtres appliqués À CHAQUE ouverture : le
  // composant est monté sous `key` par l'appelant quand la fenêtre s'ouvre.
  const [draft, setDraft] = useState<PlanningFilters>(filters)
  const secondary = PLANNING_FILTER_KEYS.filter(key => !PRIMARY_KEYS.includes(key) && options[key].length > 0)
  const secondaryActive = secondary.some(key => draft[key].length > 0)

  const reset = () => {
    const cleared = { ...draft }
    for (const key of PLANNING_FILTER_KEYS) cleared[key] = []
    setDraft(cleared)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('planning.screen.filters.title')}</DialogTitle>
          <DialogDescription>{t('planning.screen.filters.intro')}</DialogDescription>
        </DialogHeader>

        <Box className="grid gap-4 sm:grid-cols-2">
          {PRIMARY_KEYS.filter(key => options[key].length > 0).map(key => (
            <FilterGroup
              key={key}
              filterKey={key}
              options={options[key]}
              selected={draft[key]}
              onToggle={value => setDraft(current => ({ ...current, [key]: toggleValue(current[key], value) }))}
            />
          ))}
        </Box>

        {secondary.length > 0 ? (
          <details open={secondaryActive} className="rounded-md border border-border p-3">
            <summary className="pointer-coarse:min-h-11 flex min-h-8 cursor-pointer items-center text-sm font-medium">
              {t('planning.screen.filters.more')}
            </summary>
            <Box className="mt-3 grid gap-4 sm:grid-cols-2">
              {secondary.map(key => (
                <FilterGroup
                  key={key}
                  filterKey={key}
                  options={options[key]}
                  selected={draft[key]}
                  onToggle={value => setDraft(current => ({ ...current, [key]: toggleValue(current[key], value) }))}
                />
              ))}
            </Box>
          </details>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={reset}>
            {t('planning.screen.filters.reset')}
          </Button>
          <Button
            type="button"
            className="pointer-coarse:min-h-11"
            onClick={() => {
              onApply(draft)
              onOpenChange(false)
            }}
          >
            {t('planning.screen.filters.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilterGroup({
  filterKey,
  options,
  selected,
  onToggle,
}: {
  filterKey: PlanningFilterKey
  options: readonly PlanningFilterOption[]
  selected: readonly string[]
  onToggle: (value: string) => void
}) {
  const { t } = useTranslation('missions')
  const legend = t(`planning.screen.filters.keys.${filterKey}`)
  return (
    <fieldset className="min-w-0 space-y-1" data-filter={filterKey}>
      <legend className="text-sm font-medium">
        {legend}
        {selected.length > 0 ? (
          <span className="text-xs font-normal text-[var(--bellum-text-muted)]">
            {` · ${t('planning.screen.filters.selected', { count: selected.length })}`}
          </span>
        ) : null}
      </legend>
      <Box className="max-h-44 space-y-0.5 overflow-y-auto">
        {options.map(option => {
          const id = `planning-filter-${filterKey}-${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={id}
              className="pointer-coarse:min-h-11 flex min-h-8 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-[var(--bg-surface-hover)]"
            >
              <Checkbox
                id={id}
                checked={selected.includes(option.value)}
                onCheckedChange={() => onToggle(option.value)}
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          )
        })}
      </Box>
    </fieldset>
  )
}
