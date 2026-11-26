import type { SlotProposalPriorityAccount } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { AccountLastOutcomeLine } from './AccountLastOutcomeLine'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { getRecommendation } from '@/features/accounts/view/accounts-list/types'

/**
 * #2770 (#2101.14) — LE CLASSEMENT PAR PRIORITÉ, pour choisir à qui proposer
 * un rendez-vous en premier.
 *
 * Correction du bilan du 27/09 12:20Z : le lien compte↔rendez-vous existe
 * déjà (`meeting-account-match.ts`), mais aucun moteur ne classait encore les
 * comptes PAR PRIORITÉ pour choisir LEQUEL proposer — chaque proposition
 * restait à l'initiative explicite du commercial, qui devait déjà savoir
 * quel compte ouvrir. Ce bloc ne calcule rien : il ORDONNE
 * `accounts.priority_score`, déjà posé par l'analyse (GA-26).
 *
 * Chaque ligne ouvre la fiche du compte, où `AgendaSlotProposalTrigger`
 * (déjà là, #2770) fait le geste — pas de second point d'entrée pour la
 * même porte.
 *
 * Vide à dessein : un portefeuille sans aucun compte au score MESURÉ ne rend
 * rien (GA-18/GA-19 — « non mesuré » n'est jamais un zéro).
 */
export function SlotProposalPriorityAccountsBlock({
  accounts,
}: {
  accounts: readonly SlotProposalPriorityAccount[] | undefined
}) {
  const { t } = useTranslation('briefing')
  // #3818 — même lecture de l'objectif que la fiche compte.
  const hasObjective = useHasOfferObjective()

  if (!accounts || accounts.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('slotProposalPriorityAccounts.empty')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      {accounts.map(account => (
        <Box
          key={account.accountId}
          className="flex flex-col gap-1 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
        >
          {/* #2932 — le MÊME libellé de verdict que `/accounts` et la fiche
              compte (`getRecommendation`, `namedAccountVerdict`), jamais un
              second nom pour le même fait, et jamais le score NU (un score
              n'est jamais nu, doctrine). */}
          <ObjectMention
            kind="account"
            id={account.accountId}
            name={account.companyName}
            attribute={getRecommendation(account.priorityScore, { hasObjective }).label}
            className="min-w-0"
          />
          {/* #3287 — le dernier résultat DÉCLARÉ du compte, comme sur la carte de priorité. */}
          <AccountLastOutcomeLine accountId={account.accountId} />
        </Box>
      ))}
    </Box>
  )
}
