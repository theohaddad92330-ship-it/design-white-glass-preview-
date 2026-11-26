import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { AccountTeamCard } from '@/features/team-guardrails/components/AccountTeamCard'
import { useAccountTeam } from '@/features/team-guardrails/hooks'

/**
 * #4507 — « Équipe du compte », depuis le menu « … » de l'en-tête : la MÊME carte que celle qui était posée
 * sous l'identité (#4158.24/.25, responsable + co-équipiers, ajout et retrait), dans une fenêtre.
 *
 * Tout membre de l'espace LIT la liste ; la carte ne propose le sélecteur d'ajout et le retrait que sur
 * `can_edit`. Une équipe vide, vue sans le droit d'y ajouter, le DIT (la carte, elle, se tait alors).
 */
export function AccountTeamDialog({
  accountId,
  companyName,
  open,
  onOpenChange,
}: {
  accountId: string
  companyName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('teamGuardrails')
  const team = useAccountTeam(accountId)
  const nothingToShow =
    team.data !== undefined && !team.data.responsible && team.data.members.length === 0 && !team.data.can_edit
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('team.title')}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>
        {open ? <AccountTeamCard accountId={accountId} /> : null}
        {open && nothingToShow ? (
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('team.noMembers')}
          </Text>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
