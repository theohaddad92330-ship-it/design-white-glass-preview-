import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * MEYER-IMPORT M.4 — le TOTAL de comptes de la vue, celui du serveur (la liste est paginée : un total dérivé des
 * lignes chargées grandirait en défilant). Inconnu (chargement, lecture ratée) ou vide ⇒ rien : on n'écrit jamais
 * « 0 compte » à la place d'une valeur qu'on n'a pas, et la liste vide a déjà son propre écran.
 */
export function AccountsTotal({ total }: { total: number | undefined }) {
  const { t } = useTranslation('accounts')
  if (total === undefined || total <= 0) return null
  return (
    <Text data-testid="accounts-total" size="sm" className="text-[var(--text-muted)]">
      {t('page.total', { count: total })}
    </Text>
  )
}
