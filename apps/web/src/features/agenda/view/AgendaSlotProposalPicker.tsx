import { Box, SelectField } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { AgendaSlotProposalTrigger } from '@/features/accounts/view/account-detail/components/AgendaSlotProposalTrigger'

/**
 * Théo A today-agenda.A5 — « Proposer un créneau » depuis l'agenda : on choisit
 * le compte, la porte d'écriture est la MÊME que sur la fiche compte
 * (`AgendaSlotProposalTrigger` : aperçu figé, puis confirmation). Rien n'est
 * calculé ni écrit ici ; sans compte choisi, aucun geste n'est offert.
 */
export function AgendaSlotProposalPicker() {
  const { t } = useTranslation('briefing')
  const accounts = useAccounts({ limit: 50 }).data?.pages.flatMap(page => page.data) ?? []
  const [accountId, setAccountId] = useState('')
  const chosen = accounts.find(account => account.id === accountId)

  if (accounts.length === 0) return null

  return (
    <Box className="flex items-center gap-1">
      <SelectField
        ariaLabel={t('agenda.slotProposal.pick')}
        value={accountId}
        onChange={setAccountId}
        placeholder={t('agenda.slotProposal.pickPlaceholder')}
        options={accounts.map(account => ({ value: account.id, label: account.company_name }))}
      />
      {chosen ? <AgendaSlotProposalTrigger accountId={chosen.id} companyName={chosen.company_name} /> : null}
    </Box>
  )
}
