import { Box, SearchInput } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type ContactsToolbarProps = {
  query: string
  onQueryChange: (next: string) => void
  /** Right-aligned actions (e.g. export to Google Sheets). */
  trailing?: ReactNode
  /** #3527 — le déclencheur de la section « Filtres », juste à côté de la recherche. */
  filtersTrigger?: ReactNode
  /** Théo B c1-repertoire.R7 / N4 — la liste « Tous les comptes », toujours visible à côté du champ. */
  accountSelect?: ReactNode
}

/**
 * Toolbar : recherche à gauche, actions à droite.
 *
 * #2477 — le bouton « Ajouter un filtre » et les chips actives (`FilterBar`)
 * ont quitté cette barre : ils vivent désormais dans la section « Filtres »
 * repliée par défaut, avec le bandeau de funnel et la pastille de cycle de
 * vie — le geste « ajouter un filtre » et son résultat (la chip qui apparaît)
 * doivent rester dans le MÊME endroit, sinon cliquer « ajouter » ferait
 * apparaître une chip hors de vue.
 */
export function ContactsToolbar({
  query,
  onQueryChange,
  trailing,
  filtersTrigger,
  accountSelect,
}: ContactsToolbarProps) {
  const { t } = useTranslation('contacts')
  return (
    // `flex-wrap` + `min-w-0` : la barre porte une recherche et des actions.
    // Sur 375 px elle débordait de 183 px — les actions partaient hors écran
    // sans que rien ne l'annonce. Elles passent maintenant à la ligne plutôt
    // que de disparaître : ce sont des GESTES, pas de la décoration, et on ne
    // retire pas un geste faute de place.
    <Box display="flex" className="flex-wrap items-center gap-2.5">
      {/* #3527 — champ + déclencheur « Filtres » forment UN groupe : le champ a
          une largeur bornée, le bouton le suit au lieu de partir au bout de la
          ligne (recette prod 02/10 : x1106 contre un champ fini à x529). */}
      <Box data-search-group className="flex min-w-0 flex-1 basis-48 items-center gap-2 sm:flex-none sm:basis-auto">
        <Box className="min-w-0 flex-1 sm:w-96 sm:flex-none">
          <SearchInput
            size="sm"
            inputClassName="w-full lg:w-full"
            value={query}
            onChange={onQueryChange}
            placeholder={t('list.searchPlaceholder')}
          />
        </Box>
        {accountSelect ? <Box className="shrink-0">{accountSelect}</Box> : null}
        {filtersTrigger ? <Box className="shrink-0">{filtersTrigger}</Box> : null}
      </Box>
      {trailing ? <Box className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{trailing}</Box> : null}
    </Box>
  )
}
