import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAccountInterestPenetrability } from '@/features/accounts/hooks/useAccountInterestPenetrability'

/**
 * #3258.15 (épopée #3362, lot E25 30/09) — LA CELLULE « comparer sur la
 * matrice » du tableau de comparaison structurée (2 à 5 comptes).
 *
 * Même motif que `AccountInterestPenetrabilitySection` (#3258, fiche compte) :
 * le hook réseau vit dans ce composant dédié, la cellule reste PURE côté
 * rendu. Aucun second calcul de quadrant (GA-26) — la MÊME façade
 * (`useAccountInterestPenetrability`) et le MÊME libellé (`accountDetail:
 * interestPenetrability.quadrants.*`) que la fiche compte et le panneau
 * Pilotage.
 *
 * `undefined`/`null` (façade non montée, ou pas encore répondu) rend un tiret
 * — jamais un quadrant deviné (GA-18/GA-19 : une valeur absente ne s'affiche
 * jamais « 0 », et ici pas davantage un quadrant inventé).
 */
export function InterestPenetrabilityCompareCell({ accountId }: { accountId: string }) {
  const { t } = useTranslation(['accounts', 'accountDetail'])
  const { data: matrix } = useAccountInterestPenetrability(accountId)

  if (!matrix) {
    return (
      <Text element="span" size="sm" className="text-[var(--text-ghost)]">
        —
      </Text>
    )
  }

  return matrix.quadrant ? (
    <Text element="span" size="sm" weight="medium" className="text-[var(--bellum-text-accent)]">
      {t(`accountDetail:interestPenetrability.quadrants.${matrix.quadrant}`)}
    </Text>
  ) : (
    <Text element="span" size="xs" className="text-[var(--text-ghost)]">
      {t('accountDetail:interestPenetrability.quadrantUnavailable')}
    </Text>
  )
}
