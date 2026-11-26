import { SIGNAL_NATURES, type SignalNature } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { LibraryFilters } from '../model/signal-library'

type SignalFiltersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: LibraryFilters
  /** Les natures présentes dans la bibliothèque : une nature sans signal ne s'affiche pas. */
  availableNatures: ReadonlySet<SignalNature>
  onChange: (next: LibraryFilters) => void
}

type DateChoice = 'any' | '7' | '30' | '90'
const DATE_CHOICES: DateChoice[] = ['any', '7', '30', '90']
const DATE_LABEL = { any: 'anyDate', '7': 'd7', '30': 'd30', '90': 'd90' } as const
const toChoice = (days: LibraryFilters['sinceDays']): DateChoice =>
  days === null ? 'any' : (String(days) as DateChoice)
const toDays = (choice: DateChoice): LibraryFilters['sinceDays'] =>
  choice === 'any' ? null : (Number(choice) as 7 | 30 | 90)

/**
 * Théo A signaux.N3 / N4 — la modale « Filtres » : la nature du signal (dix, mais seulement celles qui ont des
 * signaux) et la date du fait (7 / 30 / 90 jours). Le filtre par compte vit en puces sur la page.
 */
export function SignalFiltersDialog({
  open,
  onOpenChange,
  filters,
  availableNatures,
  onChange,
}: SignalFiltersDialogProps) {
  const { t } = useTranslation('signalsLibrary')
  const toggleNature = (nature: SignalNature) => {
    const next = new Set(filters.natures)
    if (next.has(nature)) next.delete(nature)
    else next.add(nature)
    onChange({ ...filters, natures: next })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('filtersDialog.close')}>
        <DialogHeader>
          <DialogTitle>{t('filtersDialog.title')}</DialogTitle>
          <DialogDescription>{t('filtersDialog.description')}</DialogDescription>
        </DialogHeader>
        <FilterChips
          multiple
          legend={t('filtersDialog.nature')}
          ariaLabel={t('filtersDialog.nature')}
          options={SIGNAL_NATURES.filter(nature => availableNatures.has(nature)).map(nature => ({
            value: nature,
            label: t(`natures.${nature}`),
          }))}
          values={[...filters.natures]}
          onToggle={toggleNature}
        />
        <FilterChips
          legend={t('filtersDialog.date')}
          ariaLabel={t('filtersDialog.date')}
          options={DATE_CHOICES.map(choice => ({ value: choice, label: t(`filtersDialog.${DATE_LABEL[choice]}`) }))}
          value={toChoice(filters.sinceDays)}
          onChange={choice => onChange({ ...filters, sinceDays: toDays(choice ?? 'any') })}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => onChange({ ...filters, natures: new Set(), sinceDays: null })}
          >
            {t('filtersDialog.reset')}
          </Button>
          <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('filtersDialog.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
