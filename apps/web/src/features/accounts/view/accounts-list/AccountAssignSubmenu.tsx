import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@bellum/ui'
import { Check, UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAssignAccount } from '@/features/manager/hooks/useAssignAccount'
import { useSession } from '@/lib/hooks/use-session'
import { trackedMutation } from '@/lib/product-tracker'

const TRIGGER_CLASS =
  'rounded-lg px-2.5 py-2 text-sm focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)]'
const CONTENT_CLASS =
  'max-h-72 w-60 overflow-y-auto rounded-lg border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-md'

/** Même découpage que `CommercialStatusSubmenu` : Radix n'interchange pas
 *  `ContextMenu*` et `DropdownMenu*`, seul le jeu de primitives se dédouble. */
const PRIMITIVES = {
  context: {
    Sub: ContextMenuSub,
    SubTrigger: ContextMenuSubTrigger,
    SubContent: ContextMenuSubContent,
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
  },
  dropdown: {
    Sub: DropdownMenuSub,
    SubTrigger: DropdownMenuSubTrigger,
    SubContent: DropdownMenuSubContent,
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
  },
} as const

type Props = {
  accountId: string
  /** Le porteur courant (`row.owner.user_id`), coché dans la liste. */
  currentOwnerId: string | undefined
  variant?: keyof typeof PRIMITIVES
}

/**
 * #2150.25 — « ATTRIBUER » DEPUIS LA LIGNE, SANS OUVRIR LE DOSSIER.
 *
 * La MÊME route et le MÊME hook que le bandeau de collaboration du dossier
 * (`AccountCollaborationBand`, `PATCH /accounts/:id/assign`) : deux portes, un
 * seul chemin d'écriture. Le refus (un commercial ne prend pas le compte d'un
 * collègue) vient du SERVEUR avec sa phrase, jamais d'un `if` écrit ici.
 *
 * ⚠️ Les membres ne se lisent qu'à l'ouverture du sous-menu : ce composant n'est
 * monté que dans un menu ouvert, si bien que la liste du portefeuille ne paie
 * aucune requête de plus par ligne.
 */
export function AccountAssignSubmenu({ accountId, currentOwnerId, variant = 'context' }: Props) {
  const { t } = useTranslation('accounts')
  const { user } = useSession()
  const members = useWorkspaceMembers().data ?? []
  const assign = useAssignAccount()
  const P = PRIMITIVES[variant]

  return (
    <P.Sub>
      <P.SubTrigger className={TRIGGER_CLASS}>
        <UserPlus className="size-4 text-[var(--bellum-text-primary)]" aria-hidden />
        {t('list.assign')}
      </P.SubTrigger>
      <P.SubContent className={CONTENT_CLASS}>
        {members.length === 0 ? (
          <P.Item disabled className={TRIGGER_CLASS}>
            {t('collaboration.assign.noMembers')}
          </P.Item>
        ) : (
          members.map(member => (
            <P.Item
              key={member.userId}
              className={TRIGGER_CLASS}
              onSelect={() =>
                assign.mutate(
                  { accountId, assignedTo: member.userId },
                  trackedMutation('account_assigned', '/accounts'),
                )
              }
            >
              {member.fullName ?? member.email ?? t('collaboration.assign.memberFallback')}
              {member.userId === user?.id && (
                <span className="ml-1 text-[var(--bellum-text-muted)]">{t('collaboration.assign.selfSuffix')}</span>
              )}
              {member.crossTeamSupport === true && (
                <span className="ml-1 text-[var(--bellum-text-muted)]">
                  · {t('collaboration.assign.crossTeamSuffix')}
                </span>
              )}
              {currentOwnerId === member.userId && (
                <Check className="ml-auto size-4 text-[var(--success-soft-text)]" aria-hidden />
              )}
            </P.Item>
          ))
        )}
        <P.Separator className="my-1 bg-[var(--bellum-border)]" />
        <P.Item
          className={TRIGGER_CLASS}
          onSelect={() =>
            assign.mutate({ accountId, assignedTo: null }, trackedMutation('account_assigned', '/accounts'))
          }
        >
          {t('collaboration.assign.release')}
        </P.Item>
      </P.SubContent>
    </P.Sub>
  )
}
