import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { Check, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAssignContacts } from '@/features/contacts/hooks/useAssignContacts'
import { AssigneePicker } from '@/features/team-guardrails/components/AssigneePicker'
import { useAssigneeCandidates } from '@/features/team-guardrails/hooks'

type Props = {
  contactId: string
  /** Le porteur courant (`contact.owner.user_id`), coché dans la liste. */
  currentOwnerId: string | null | undefined
  /** #4504.3 — le libellé du déclencheur (« Modifier » dans « Responsable du contact ») ; défaut « Attribuer ». */
  label?: string
}

/**
 * #2160.9 — « ATTRIBUER » DEPUIS LA FICHE CONTACT.
 *
 * Même grammaire que `AccountCollaborationBand` (niveau compte, onglet
 * Personnes) : un déclencheur nommé « Attribuer », un menu qui liste les
 * membres de l'espace (soi-même annoté, le porteur actuel coché), et un item
 * « Retirer l'attribution » distinct — jamais un second réglage (GA-26). La
 * MÊME route et le MÊME hook que le panneau de sélection (`PATCH
 * /contacts/assign`, `useAssignContacts`) : un seul chemin d'écriture pour
 * l'unitaire et le lot. Le refus (droit insuffisant, salle de démonstration)
 * vient du SERVEUR avec sa phrase — ce menu ne décide rien.
 */
export function ContactAssignControl({ contactId, currentOwnerId, label }: Props) {
  const { t } = useTranslation('contacts')
  const { user } = useSession()
  const members = useWorkspaceMembers().data ?? []
  const assign = useAssignContacts()
  const isDemo = useIsDemo()
  // #4996 L6 — l'ordre vient du serveur : qui couvre l'entité du contact d'abord. Sans lecture, la liste d'avant.
  const ordered = (useAssigneeCandidates(contactId).data?.items.length ?? 0) > 0
  const pick = (userId: string) =>
    assign.mutate({
      contactIds: [contactId],
      assignedTo: userId,
      assigneeName:
        members.find(m => m.userId === userId)?.fullName ?? members.find(m => m.userId === userId)?.email ?? undefined,
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          icon={UserPlus}
          isLoading={assign.isPending}
          disabled={isDemo}
          title={isDemo ? t('header.assign.demoDisabled') : undefined}
          aria-label={t('header.assign.trigger')}
          className="min-h-11"
        >
          {label ?? t('header.assign.label')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
        <DropdownMenuLabel>{t('header.assign.menuLabel')}</DropdownMenuLabel>
        {ordered ? (
          <AssigneePicker contactId={contactId} currentOwnerId={currentOwnerId} onPick={pick} />
        ) : members.length === 0 ? (
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
        {/* Libérer est un geste distinct d'attribuer, et le serveur le tient
            distinctement : l'item reste toujours proposé, le refus vient du
            serveur avec sa phrase — jamais d'un `if` écrit ici. */}
        <DropdownMenuItem onSelect={() => assign.mutate({ contactIds: [contactId], assignedTo: null })}>
          {t('header.assign.release')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
