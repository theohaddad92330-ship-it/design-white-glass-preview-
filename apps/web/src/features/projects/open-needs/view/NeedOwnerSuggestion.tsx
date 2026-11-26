import { Box, Button } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'

type Owner = { id: string; name: string }

/**
 * #4016.L4 (décision Louis 11/10, `c95_estimation_badgee`) — « valeurs suggérées à la saisie » d'un besoin.
 *
 * Le porteur du PROJET de rattachement est PROPOSÉ comme propriétaire du besoin : une suggestion, badgée
 * « suggéré » avec sa base, appliquée seulement sur un clic. c42 tient : aucun champ ne reçoit de défaut,
 * un besoin sans propriétaire reste `null` tant que personne ne l'a choisi.
 */
export function needOwnerSuggestion(input: {
  projectOwnerId: string | null | undefined
  owners: readonly Owner[]
  currentOwnerId: string
}): Owner | null {
  if (!input.projectOwnerId || input.currentOwnerId) return null
  return input.owners.find(owner => owner.id === input.projectOwnerId) ?? null
}

export function NeedOwnerSuggestion({ owner, onApply }: { owner: Owner; onApply: (ownerId: string) => void }) {
  const { t } = useTranslation('projects')
  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <EstimatedBadge kind="suggested" basis={t('needWizard.ownerSuggestionBasis')} />
      <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => onApply(owner.id)}>
        {t('needWizard.ownerSuggestionApply', { name: owner.name })}
      </Button>
    </Box>
  )
}
