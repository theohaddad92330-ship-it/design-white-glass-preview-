import { Box, Button, FilterChips, SearchInput } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { AccountProjectFilters, AccountProjectNature } from './accountProjectsFilters'

/**
 * #1889 — LA BARRE D'OUTILS DES PROJETS D'UN COMPTE.
 *
 * Composée sur les MÊMES primitives que le pipe global (`SearchInput` +
 * `FilterChips`) et que l'onglet Contacts du même dossier (`ContactsToolbar`) :
 * aucune troisième façon de chercher n'est inventée. Le vocabulaire est celui
 * du pipe, parce que ce sont les mêmes objets vus d'ailleurs — « Sans prochaine
 * action » se dit déjà là-bas, mot pour mot.
 *
 * Deux rangées, et chacune porte SON `legend` : c'est exactement le défaut
 * corrigé sur `/contacts` (#1418) — deux rangées de pastilles à 48 px l'une de
 * l'autre, dont on ne savait pas ce qu'elles filtraient.
 *
 * ⚠️ Les comptes affichés sur les pastilles de nature sont MESURÉS sur la liste
 * complète du compte, jamais sur la liste déjà filtrée : une pastille dont le
 * chiffre change quand on la coche ne dit plus ce qu'elle ferait.
 */
export function AccountProjectsToolbar({
  filters,
  onChange,
  counts,
}: {
  filters: AccountProjectFilters
  onChange: (next: AccountProjectFilters) => void
  counts: { projects: number; signals: number }
}) {
  const { t } = useTranslation('projects')

  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <SearchInput
        size="sm"
        value={filters.query}
        onChange={query => onChange({ ...filters, query })}
        placeholder={t('accountTab.toolbar.searchPlaceholder')}
        // Ce qui se cherche porte un NOM : le `placeholder` disparaît à la
        // première frappe, et l'onglet voisin (Contacts) porte lui aussi un
        // champ de recherche — « zone de texte » deux fois ne dit rien.
        ariaLabel={t('accountTab.toolbar.searchLabel')}
        className="max-w-sm"
      />
      {/* La dimension n'existe que s'il y a quelque chose à SÉPARER. Un compte
          sans aucun signal n'a pas besoin qu'on lui propose de les isoler : la
          pastille ne pourrait que vider la liste. Même convention que
          `ContactsToolbar`, qui ne propose que les valeurs réellement présentes
          sur le compte. */}
      {counts.projects > 0 && counts.signals > 0 ? (
        <FilterChips<AccountProjectNature>
          size="sm"
          clearable
          ariaLabel={t('accountTab.toolbar.natureLabel')}
          legend={t('accountTab.toolbar.natureLabel')}
          options={[
            { value: 'projects', label: t('accountTab.toolbar.projects'), count: counts.projects },
            { value: 'signals', label: t('accountTab.toolbar.signals'), count: counts.signals },
          ]}
          value={filters.nature}
          onChange={nature => onChange({ ...filters, nature })}
        />
      ) : null}
      <FilterChips<'inPipe' | 'withoutNextAction'>
        multiple
        size="sm"
        ariaLabel={t('accountTab.toolbar.quickFiltersLabel')}
        legend={t('accountTab.toolbar.quickFiltersLabel')}
        options={[
          { value: 'inPipe', label: t('accountTab.toolbar.inPipe'), hint: t('accountTab.toolbar.inPipeHint') },
          { value: 'withoutNextAction', label: t('toolbar.withoutNextAction') },
        ]}
        values={[
          ...(filters.inPipe ? (['inPipe'] as const) : []),
          ...(filters.withoutNextAction ? (['withoutNextAction'] as const) : []),
        ]}
        onToggle={value => {
          if (value === 'inPipe') onChange({ ...filters, inPipe: !filters.inPipe })
          if (value === 'withoutNextAction') onChange({ ...filters, withoutNextAction: !filters.withoutNextAction })
        }}
      />
      {/* #1889 — « importer des projets ». La porte est DISCRÈTE et à droite :
          ce n'est pas un geste de tous les jours, et la mettre au même poids que
          les filtres ferait croire qu'on reprend un fichier à chaque visite.
          Elle n'a été posée qu'une fois l'écriture branchée — avant, l'`apply`
          refusait les projets par leur nom, et y renvoyer aurait promis un
          import qui n'écrit rien. */}
      <Button asChild variant="ghost" size="sm" className="ml-auto pointer-coarse:min-h-11">
        <Link to="/settings/mes-donnees" search={{ tab: 'imports' }}>
          {t('accountTab.toolbar.import')}
        </Link>
      </Button>
    </Box>
  )
}
