import { Box, cn } from '@bellum/ui'
import { Search } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { getRoleLabel, ROLE_FILTERS, type RoleFilter } from '../lib/roles'

type SearchFormContactsProps = {
  query: string
  onQueryChange: (next: string) => void
  roleFilter: RoleFilter
  onRoleFilterChange: (next: RoleFilter) => void
}

/**
 * Barre de filtres de la liste de contacts : champ texte + chips
 * "Tous / Sponsor / Champion / …".
 *
 * Pure UI — pas de state interne. Le parent (`<Contacts>`) tient la
 * source de vérité et reçoit les changements via les callbacks. Ça
 * permet aussi de pré-remplir les filtres via l'URL plus tard sans
 * toucher au composant.
 */
export const SearchFormContacts = memo<SearchFormContactsProps>(function SearchFormContacts({
  query,
  onQueryChange,
  roleFilter,
  onRoleFilterChange,
}) {
  const { t } = useTranslation('contacts')
  return (
    <Box display="flex" mb={4} className="gap-3 flex-wrap items-center">
      <Box className="relative min-w-48">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
          style={{ color: 'var(--text-ghost)' }}
        />
        <input
          type="text"
          placeholder={t('list.searchShortPlaceholder')}
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="h-9 w-full rounded-sm pl-8 pr-3 text-sm text-[color:var(--text-primary)] focus:outline-none focus:border-violet-600/50 transition-colors bg-[var(--bg-glass)] border border-[var(--bg-glass-border)]"
        />
      </Box>

      <Box display="flex" className="gap-2 flex-wrap">
        {ROLE_FILTERS.map(opt => {
          const active = roleFilter === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onRoleFilterChange(opt)}
              className={cn(
                // `pointer-coarse:min-h-11` (44 px, GA-30) : au doigt seulement.
                'text-xs px-3 py-1 rounded-full cursor-pointer transition-colors border pointer-coarse:min-h-11',
                active
                  ? 'bg-violet-600/20 text-[var(--bellum-text-accent)] border-violet-600/30'
                  : 'border-transparent text-[var(--text-ghost)] hover:text-[var(--text-secondary)] hover:bg-white/[0.03]',
              )}
            >
              {getRoleLabel(opt)}
            </button>
          )
        })}
      </Box>
    </Box>
  )
})
