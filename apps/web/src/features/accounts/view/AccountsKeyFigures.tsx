import type { AccountListCounters } from '@bellum/contracts'
import { KeyFigureRow } from '@/components/primitives/KeyFigureRow'
import { useTranslation } from 'react-i18next'

/** Le chiffre que l'URL a allumé — `total` quand rien ne restreint le portefeuille. */
export type AccountsKeyFigureId = 'total' | 'toResume' | 'activeRelations' | 'favorites'

/**
 * Refonte Théo (comptes-liste, `.a4-counters`) — LA BANDE DES QUATRE CHIFFRES : Comptes dans l'espace ·
 * À reprendre · Relations actives · Favoris, dans un seul cadre, séparés par un filet.
 *
 * Chaque chiffre est un BOUTON qui pose la vue qu'il compte (aucun bouton mort) : « Comptes dans
 * l'espace » ramène au portefeuille entier, « À reprendre » et « Relations actives » filtrent sur le
 * prédicat SERVEUR qui les compte (`headline`), « Favoris » ouvre l'onglet Favoris. Le chiffre de la vue
 * courante est allumé (accent), comme chez Théo.
 *
 * Tous viennent des compteurs que le serveur calcule sur la 1ʳᵉ page (`AccountListCounters`) — rien
 * n'est recompté ici (GA-26). « À reprendre » = `followed − withoutNextAction` : il n'existe que si les
 * DEUX sont connus. Un compteur absent ne fait AUCUN chiffre (GA-18/19), jamais « 0 » ; un vrai zéro
 * reste dit. Sans aucun compteur, la bande ne rend rien. La forme est la rangée PARTAGÉE (`KeyFigureRow`,
 * variante `band`, F2-FIX #4332) : Comptes, Pipe et Vivier gardent un seul composant de chiffres.
 */
export function AccountsKeyFigures({
  counters,
  active = 'total',
  onSelect,
  scoped = false,
  renderedTotal,
}: {
  counters: AccountListCounters | undefined
  active?: AccountsKeyFigureId
  onSelect?: (id: AccountsKeyFigureId) => void
  /**
   * #4643 — la liste est RESTREINTE (puce, filtre, recherche) : les compteurs du serveur décrivent tout le
   * portefeuille vivant, pas elle. La bande ne garde alors que ce qu'elle sait de la liste rendue — son total —
   * et se tait sur le reste (on n'affiche pas ce qu'on n'a pas). Le calcul des compteurs ne bouge pas.
   */
  scoped?: boolean
  renderedTotal?: number
}) {
  const { t } = useTranslation('accounts')
  if (scoped) {
    return (
      <KeyFigureRow
        testId="accounts-key-figures"
        variant="band"
        label={t('keyFigures.groupLabel')}
        figures={[
          {
            id: 'total',
            label: t('keyFigures.totalScoped'),
            value: renderedTotal,
            meta: t('keyFigures.totalScopedMeta'),
            pressed: false,
            onSelect: undefined,
          },
        ]}
      />
    )
  }
  const followed = counters?.followed
  const withoutNextAction = counters?.withoutNextAction
  const toResume = followed !== undefined && withoutNextAction !== undefined ? followed - withoutNextAction : undefined
  // #4584 (Louis 27/10) — « À reprendre » et « Relations actives » sont des VUES-FILTRES : à zéro elles ne comptent
  // rien et ne posent qu'une liste vide ; la tuile est ABSENTE, jamais « 00 » au-dessus de cartes pleines. Total et
  // Favoris gardent leur vrai zéro (un total nul, des favoris nuls se disent).
  const orAbsentWhenZero = (value: number | undefined) => (value === 0 ? undefined : value)
  const figures: { id: AccountsKeyFigureId; value: number | undefined }[] = [
    { id: 'total', value: counters?.total },
    { id: 'toResume', value: orAbsentWhenZero(toResume) },
    { id: 'activeRelations', value: orAbsentWhenZero(counters?.activeRelations) },
    { id: 'favorites', value: counters?.favorites },
  ]
  return (
    <KeyFigureRow
      testId="accounts-key-figures"
      variant="band"
      label={t('keyFigures.groupLabel')}
      figures={figures.map(figure => ({
        id: figure.id,
        label: t(`keyFigures.${figure.id}`),
        // Un vrai zéro reste dit, une absence ne fait aucun chiffre.
        value: figure.value,
        meta: t(`keyFigures.${figure.id}Meta`),
        pressed: figure.id === active,
        onSelect: onSelect ? () => onSelect(figure.id) : undefined,
      }))}
    />
  )
}

/** Le chiffre allumé par l'URL : la vue qu'il pose, et rien d'autre. */
export function activeKeyFigureOf(search: { headline?: string; favorite?: string }): AccountsKeyFigureId | undefined {
  if (search.headline === 'toResume') return 'toResume'
  if (search.headline === 'activeRelations') return 'activeRelations'
  if (search.headline) return undefined
  if (search.favorite === 'mine') return 'favorites'
  return 'total'
}
