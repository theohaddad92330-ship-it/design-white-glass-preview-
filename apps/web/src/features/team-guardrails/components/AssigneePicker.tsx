import { DropdownMenuItem, Text } from '@bellum/ui'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAssigneeCandidates } from '../hooks'

/**
 * #4996 L6 — le sélecteur de porteur ORDONNÉ : les membres dont une zone couvre l'entité du contact sont en tête,
 * avec « couvre … ». L'ordre vient du serveur (`GET contacts/:id/assignee-candidates`), jamais recalculé ici ;
 * personne n'est caché et rien n'est présélectionné ni écrit sans clic. Rend des `DropdownMenuItem` : à poser dans un
 * `DropdownMenuContent`. Rien (`false`) tant que l'ordre n'est pas lu : l'appelant garde alors sa liste d'avant.
 */
export function AssigneePicker({
  contactId,
  currentOwnerId,
  onPick,
}: {
  contactId: string
  currentOwnerId: string | null | undefined
  onPick: (userId: string) => void
}) {
  const { t } = useTranslation('teamGuardrails')
  const items = useAssigneeCandidates(contactId).data?.items ?? []
  if (items.length === 0) return null
  return (
    <>
      {items.map(candidate => (
        <DropdownMenuItem key={candidate.user_id} className="min-h-11" onSelect={() => onPick(candidate.user_id)}>
          <span className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span>{candidate.name}</span>
            {candidate.covers.length > 0 ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('assignee.covers', { labels: candidate.covers.join(', ') })}
              </Text>
            ) : null}
          </span>
          {currentOwnerId === candidate.user_id ? <Check className="size-4" aria-hidden /> : null}
        </DropdownMenuItem>
      ))}
    </>
  )
}
