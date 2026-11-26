import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { useImpactedAccounts } from '../hooks/useImpactedAccounts'

/**
 * #2306.24 — LA VUE AGRÉGÉE, sur Réglages › Profil : combien de comptes du
 * portefeuille ont été analysés avec un profil ESN plus ancien que celui
 * d'aujourd'hui — le signal qu'une modification des secteurs ou des offres
 * a rendu leur évaluation périmée. Même prédicat que la fiche compte
 * (`ranWithOlderProfile`, `AccountProfileProvenance.tsx`), lu ici en agrégat
 * via `GET /accounts/impacted-by-profile-change` — jamais un second calcul.
 *
 * GA-18/19 — une absence ne s'affiche JAMAIS « 0 » : à zéro compte concerné
 * (ou tant que la lecture n'a pas répondu), ce bloc ne rend RIEN, comme une
 * LISTE dont l'absence ne fait aucune ligne.
 *
 * Informationnel seulement : aucun bouton de rejeu ici. La doctrine (« le
 * rejeu ne part jamais seul », #AF/segment-catchup) réserve la PROPOSITION
 * de recalcul, coût affiché, à la fiche compte (#2306.25).
 */
export function ImpactedAccountsNotice() {
  const { t } = useTranslation('profile', { keyPrefix: 'esn.impactedAccounts' })
  const { data } = useImpactedAccounts()
  const count = data?.accounts.length ?? 0
  if (count === 0) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border border-neutral-200 px-3 py-2 dark:border-white/10">
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--warning-soft-text)]" />
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('notice', { count })}
      </Text>
    </div>
  )
}
