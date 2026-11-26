import { Box, SearchInput } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #1797 — la barre ne porte plus l'interrupteur du panneau latéral.
 *
 * Il montrait et masquait un panneau de détail collé à droite de la liste. Ce
 * panneau n'existe plus : le détail s'ouvre au clic, en modale. Un
 * interrupteur sans objet n'est pas une capacité perdue — ce qu'il servait à
 * obtenir (voir la liste sans le détail) est devenu l'état d'arrivée.
 */
export function WatchlistToolbar({ onQueryChange, query }: { onQueryChange: (query: string) => void; query: string }) {
  const { t } = useTranslation('watchlist')

  return (
    <Box display="flex" className="min-w-0 flex-1 items-center sm:max-w-xs">
      <SearchInput size="sm" value={query} onChange={onQueryChange} placeholder={t('toolbar.searchPlaceholder')} />
    </Box>
  )
}
