import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useAccountLastOutcome } from '../hooks/useAccountLastOutcome'

/**
 * #3265.13 / #3287 — LE DERNIER RÉSULTAT DÉCLARÉ d'un compte, en une ligne, partout où le briefing liste ce
 * compte (carte de priorité, « Comptes à prioriser », « Comptes qui ont bougé »). Une seule lecture, celle de
 * `action_plan_items` (comme le Plan de compte et la fiche Contact), REGROUPÉE pour toutes les lignes du
 * briefing en un appel : jamais une copie par bloc, jamais un appel par ligne. Absente sans
 * compte et sans action faite qui porte une issue — « on n'affiche pas ce qu'on n'a pas ».
 */
export function AccountLastOutcomeLine({ accountId }: { accountId: string | undefined }) {
  const { t } = useTranslation('briefing')
  const { t: tActions } = useTranslation('actions')
  const last = useAccountLastOutcome(accountId)
  if (!last?.outcome) return null
  return (
    <Box className="pl-8">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('card.lastOutcome', { outcome: tActions(`outcome.${last.outcome}`) })}
      </Text>
    </Box>
  )
}
