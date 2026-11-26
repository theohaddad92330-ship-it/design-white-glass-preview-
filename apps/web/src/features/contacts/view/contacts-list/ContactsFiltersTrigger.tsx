import { chipClassName, chipCountClassName } from '@bellum/ui'
import { ListFilter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CONTACTS_FILTERS_PANEL_ID } from '../contacts-filters-panel-id'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Filtres actifs (`countActiveContactFilters`) — `0` ne s'affiche pas. */
  count: number
}

/**
 * #3527 (Louis 01/10) — « ajouter une section filtres, à la place d'avoir tous
 * ces boutons qui traînent, et mettre le bouton à côté du champ de recherche ».
 * Le déclencheur de la section « Filtres » (#3376, d'abord dans l'entête)
 * vit désormais DANS la barre d'outils, juste à droite de la recherche : même
 * pastille que le reste du produit (`chipClassName`, GA-26). Un filtre actif
 * reste COMPTÉ ici, section repliée — jamais un « 0 ».
 */
export function ContactsFiltersTrigger({ open, onOpenChange, count }: Props) {
  const { t } = useTranslation('contacts')
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={CONTACTS_FILTERS_PANEL_ID}
      // Le nom accessible reste le LIBELLÉ seul — même raison que
      // `CollapsedSection` : sans lui, le compte rejoindrait le nom du bouton.
      aria-label={t('list.filtersSection.title')}
      onClick={() => onOpenChange(!open)}
      className={chipClassName({ active: open, size: 'sm' })}
    >
      <ListFilter className="size-3.5" aria-hidden />
      {t('list.filtersSection.title')}
      {count > 0 && <span className={chipCountClassName(open)}>{count}</span>}
    </button>
  )
}
