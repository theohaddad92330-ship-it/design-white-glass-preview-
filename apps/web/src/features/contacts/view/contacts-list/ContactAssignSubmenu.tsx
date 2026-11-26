import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@bellum/ui'
import { Check, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAssignContacts } from '@/features/contacts/hooks/useAssignContacts'

type Props = {
  contactId: string
  /** Le porteur courant (`row.assigned_to`), coché dans la liste. */
  currentOwnerId: string | null | undefined
}

/**
 * #2160.9 — « ATTRIBUER » DEPUIS LA LIGNE, SANS OUVRIR LA FICHE.
 *
 * La MÊME route et le MÊME hook que la fiche contact (`ContactAssignControl`,
 * `PATCH /contacts/assign`) et le panneau de sélection — un seul chemin
 * d'écriture pour l'unitaire et le lot (GA-26). Même grammaire que
 * `AccountAssignSubmenu` (ligne compte), simplifiée : la liste des contacts
 * n'a pas de menu contextuel au clic droit, seulement le « ⋯ » de fin de
 * ligne (`DropdownMenu`).
 *
 * ⚠️ Les membres ne se lisent qu'à l'ouverture du sous-menu : monté seulement
 * dans un menu ouvert, il ne paie aucune requête de plus par ligne.
 */
export function ContactAssignSubmenu({ contactId, currentOwnerId }: Props) {
  const { t } = useTranslation('contacts')
  const { user } = useSession()
  const members = useWorkspaceMembers().data ?? []
  const assign = useAssignContacts()
  const isDemo = useIsDemo()

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={isDemo} title={isDemo ? t('header.assign.demoDisabled') : undefined}>
        <UserPlus className="mr-2 h-4 w-4" aria-hidden /> {t('table.assign')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 w-60 overflow-y-auto">
        <DropdownMenuLabel>{t('header.assign.menuLabel')}</DropdownMenuLabel>
        {members.length === 0 ? (
          <DropdownMenuItem disabled>{t('header.assign.noMembers')}</DropdownMenuItem>
        ) : (
          members.map(member => (
            <DropdownMenuItem
              key={member.userId}
              onSelect={() =>
                assign.mutate({
                  contactIds: [contactId],
                  assignedTo: member.userId,
                  assigneeName: member.fullName ?? member.email ?? undefined,
                })
              }
            >
              {member.fullName ?? member.email ?? t('header.assign.memberFallback')}
              {member.userId === user?.id && (
                <span className="ml-1 text-[var(--bellum-text-muted)]">{t('header.assign.selfSuffix')}</span>
              )}
              {currentOwnerId === member.userId && (
                <Check className="ml-auto size-4 text-[var(--success-soft-text)]" aria-hidden />
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => assign.mutate({ contactIds: [contactId], assignedTo: null })}>
          {t('header.assign.release')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
