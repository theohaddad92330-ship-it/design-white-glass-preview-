import { Button } from '@bellum/ui'
import { FilterX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type ContactsActiveFiltersProps = {
  search: string
  roleFilter: string
  entityFilter: string
  levelFilter: string
  /** #3742 — le libellé LISIBLE du lieu choisi (« Région · Bourgogne-Franche-Comté »), absent = aucun. */
  placeLabel?: string | null
  shown: number
  total: number
  onClear: () => void
}

/**
 * #3685.4 — « filtres actifs identifiables sans rangées permanentes ; totaux
 * discrets et exacts ». UNE ligne, rendue SEULEMENT quand un filtre est posé :
 * elle nomme chaque filtre actif, dit « N sur M » (exact : les deux nombres
 * viennent de la liste réellement filtrée) et porte le geste qui les défait
 * tous. Sans filtre, rien — pas de rangée permanente de pastilles « Tous ».
 */
export function ContactsActiveFilters({
  search,
  roleFilter,
  entityFilter,
  levelFilter,
  placeLabel,
  shown,
  total,
  onClear,
}: ContactsActiveFiltersProps) {
  const { t } = useTranslation('accountOrg')
  const active: string[] = []
  if (search.trim()) active.push(t('contactsTab.activeFilters.search', { value: search.trim() }))
  if (roleFilter !== 'all') active.push(t('contactsTab.activeFilters.role', { value: roleFilter }))
  if (entityFilter !== 'all') active.push(t('contactsTab.activeFilters.entity', { value: entityFilter }))
  if (levelFilter !== 'all') active.push(t('contactsTab.activeFilters.level', { value: levelFilter }))
  if (placeLabel) active.push(t('contactsTab.activeFilters.place', { value: placeLabel }))
  if (active.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" role="status">
      <span>{t('contactsTab.activeFilters.count', { shown, total })}</span>
      <span aria-hidden="true">·</span>
      <span>{t('contactsTab.activeFilters.list', { filters: active.join(' · ') })}</span>
      <Button type="button" size="sm" variant="ghost" icon={FilterX} className="gap-2" onClick={onClear}>
        {t('contactsTab.activeFilters.clear')}
      </Button>
    </div>
  )
}
