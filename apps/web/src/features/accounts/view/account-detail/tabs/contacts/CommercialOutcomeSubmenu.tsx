import type { Contact, CommercialOutcomeType } from '@bellum/contracts'
import { DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@bellum/ui'
import { ClipboardCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useRecordCommercialOutcome } from '@/features/accounts/hooks/useCommercialOutcomes'

/**
 * #2126.47/.50/.51/.53/.54 (épopée #2787) — LES OUTCOMES PORTÉS PAR UN CONTACT.
 *
 * Distinct de {@link ContactOutcomeSubmenu} (`user_status` : contacté / a
 * répondu / rendez-vous / refusé / sans réponse), qui pilote l'entonnoir de
 * relance, les séquences et le journal — cet objet-ci alimente une boucle
 * D'APPRENTISSAGE séparée (le classement, la qualité des données) et ne
 * réécrit jamais rétroactivement une preuve historique (#2126.60) : chaque
 * clic AJOUTE une ligne au ledger, il n'en efface ni n'en modifie aucune.
 *
 * Les deux outcomes de PORTÉE COMPTE (#2126.48, « partenaire pertinent / non »)
 * ne sont pas ici : ils ne désignent pas UN contact, ils n'ont pas leur place
 * sur une ligne de contact.
 */
const CONTACT_OUTCOME_TYPES: CommercialOutcomeType[] = [
  'qualified_relationship',
  'message_replied',
  'consultant_positioned',
  'incorrect_contact',
  'declined',
]

export function CommercialOutcomeSubmenu({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const record = useRecordCommercialOutcome(contact.account_id ?? '')

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={!contact.account_id}>
        <ClipboardCheck className="mr-2 size-4 text-[var(--bellum-text-accent)]" />
        {t('outcomes.menu')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {CONTACT_OUTCOME_TYPES.map(type => (
          <DropdownMenuItem
            key={type}
            disabled={record.isPending}
            onClick={() =>
              record.mutate({ type, contactId: contact.id }, { onSuccess: () => toast.success(t('outcomes.recorded')) })
            }
          >
            {t(`outcomes.type.${type}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
