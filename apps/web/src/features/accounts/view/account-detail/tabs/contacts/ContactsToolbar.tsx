import { SearchInput, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bellum/ui'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { DecisionRole, OrgHierarchyLevel } from '@bellum/contracts'

type ContactsToolbarProps = {
  search: string
  onSearchChange: (value: string) => void
  roleFilter: string
  onRoleFilterChange: (value: string) => void
  roles: NonNullable<DecisionRole>[]
  /**
   * Entité et Niveau — les deux filtres mesurés absents le 31/08 (maquette
   * `03_tous_contacts_couverture.png`). Même convention que `roleFilter` :
   * `'all'` = pas de filtre, et la liste d'options ne propose que des valeurs
   * RÉELLEMENT présentes sur ce compte (jamais un niveau ou une entité
   * inventés).
   */
  entityFilter: string
  onEntityFilterChange: (value: string) => void
  entities: string[]
  levelFilter: string
  onLevelFilterChange: (value: string) => void
  levels: OrgHierarchyLevel[]
  /**
   * #3742 — « Localisation » : pays, région, département, ville RÉELLEMENT
   * présents sur les contacts du compte (`contactLocation.ts`). Aucune option
   * ⇒ pas de sélecteur.
   */
  placeFilter?: string
  onPlaceFilterChange?: (value: string) => void
  placeOptions?: ReadonlyArray<{ value: string; kind: string; label: string; count: number }>
}

export function ContactsToolbar({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  roles,
  entityFilter,
  onEntityFilterChange,
  entities,
  levelFilter,
  onLevelFilterChange,
  levels,
  placeFilter = 'all',
  onPlaceFilterChange,
  placeOptions = [],
}: ContactsToolbarProps) {
  const { t } = useTranslation('accountOrg')
  return (
    <motion.div variants={cardFade} className="flex flex-wrap gap-3">
      <SearchInput size="sm" value={search} onChange={onSearchChange} placeholder={t('toolbar.searchPlaceholder')} />
      <Select value={roleFilter} onValueChange={onRoleFilterChange}>
        <SelectTrigger className="h-9 w-44 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)]">
          <SelectValue placeholder={t('toolbar.allRoles')} className="!capitalize" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('toolbar.allRoles')}</SelectItem>
          {roles.map(role => (
            <SelectItem key={role} value={role} className="capitalize">
              {role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {/* Entité et Niveau réutilisent le vocabulaire de l'onglet Organigramme
          (`orgMap.filters.*`) : même mot pour le même filtre sur les deux
          écrans du même compte. */}
      {entities.length > 0 ? (
        <Select value={entityFilter} onValueChange={onEntityFilterChange}>
          <SelectTrigger className="h-9 w-44 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)]">
            <SelectValue placeholder={t('orgMap.filters.allEntities')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('orgMap.filters.allEntities')}</SelectItem>
            {entities.map(entity => (
              <SelectItem key={entity} value={entity}>
                {entity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {levels.length > 0 ? (
        <Select value={levelFilter} onValueChange={onLevelFilterChange}>
          <SelectTrigger className="h-9 w-44 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)]">
            <SelectValue placeholder={t('orgMap.filters.allLevels')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('orgMap.filters.allLevels')}</SelectItem>
            {levels.map(level => (
              <SelectItem key={level} value={level}>
                {t(`orgMap.levels.${level}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {placeOptions.length > 0 && onPlaceFilterChange ? (
        <Select value={placeFilter} onValueChange={onPlaceFilterChange}>
          <SelectTrigger
            aria-label={t('toolbar.placeLabel')}
            className="h-9 w-56 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-secondary)]"
          >
            <SelectValue placeholder={t('toolbar.allPlaces')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('toolbar.allPlaces')}</SelectItem>
            {placeOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {t('toolbar.placeOption', {
                  kind: t(`toolbar.placeKinds.${option.kind}`),
                  label: option.label,
                  count: option.count,
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </motion.div>
  )
}
