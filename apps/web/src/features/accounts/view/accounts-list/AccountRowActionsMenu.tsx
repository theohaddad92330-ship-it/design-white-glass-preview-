import type { CommercialLifecycle } from '@bellum/contracts'
import {
  Box,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountAssignSubmenu } from './AccountAssignSubmenu'
import { CommercialStatusSubmenu } from './CommercialStatusSubmenu'
import type { AccountRowAction } from './accountRowActions'

// #3166 (retour bêta, 28/09/2026) — Louis : « la petite icône pour supprimer
// le compte est en dehors du carré de proposition d'actions ». Mesuré :
// `DropdownMenuItem` (ce menu, le « … » de fin de ligne) ne porte pas de
// `gap-2` — contrairement à son jumeau exact `ContextMenuItem` (le clic
// droit, `ContextRowAction` dans `AccountTableRow.tsx`), qui en porte un.
// L'icône collait donc directement au libellé dans CE menu, sans la
// respiration qu'elle a partout ailleurs — d'autant plus visible sur
// l'entrée destructive (rouge), la plus regardée avant de cliquer.
const ITEM_CLASS =
  'gap-2 rounded-lg px-2.5 py-2 text-sm focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)]'

type Props = {
  actions: AccountRowAction[]
  accountId: string
  commercialStatus: CommercialLifecycle | undefined
  /** #2150.25 — le porteur courant, coché dans « Attribuer ». */
  ownerId?: string
  /** #2117.23 — remonté jusqu'au dialogue de motif, rendu chez `AccountTableRow`. */
  onRequestStatusReason: (status: CommercialLifecycle) => void
}

/**
 * LE « … » DE FIN DE LIGNE — LA PORTE QUI MANQUAIT.
 *
 * Sept actions vivaient au CLIC DROIT, et rien de visible sur la ligne n'y
 * menait. Un commercial ne fait pas de clic droit sur un tableau ; au doigt, le
 * geste n'existe même pas. Le menu contextuel RESTE — on ajoute une porte, on
 * n'en ferme pas, et le retirer casserait l'habitude de qui l'avait trouvé.
 *
 * ⚠️ Le déclencheur est un vrai bouton NOMMÉ (GA-32 : une commande sans texte
 * porte son nom) et il se tabule (GA-35). Sa cible fait 44 px en pointeur
 * grossier (GA-30) sans grossir la ligne au pointeur fin : c'est la zone
 * tactile qui grandit, pas le dessin.
 *
 * ⚠️ `stopPropagation` sur le conteneur : la ligne entière ouvre le dossier.
 * Sans lui, ouvrir le menu quitterait l'écran au même instant.
 */
export function AccountRowActionsMenu({ actions, accountId, commercialStatus, ownerId, onRequestStatusReason }: Props) {
  const { t } = useTranslation('accounts')
  const [open, setOpen] = useState(false)

  return (
    <Box onClick={event => event.stopPropagation()}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('list.rowActions')}
            title={t('list.rowActions')}
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--bellum-text-muted)] transition-colors',
              'hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
              'pointer-coarse:size-11',
              open && 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]',
            )}
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          // #3166 — le menu d'une ligne proche du haut dépassait de 19 px la
          // fenêtre : marge de collision + hauteur bornée à l'espace disponible
          // (défilement interne) pour que Radix le retourne ou le contienne.
          avoidCollisions
          collisionPadding={8}
          className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto rounded-lg border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-md"
        >
          {actions.map(action => (
            <AccountRowActionEntry
              key={action.key}
              action={action}
              accountId={accountId}
              commercialStatus={commercialStatus}
              ownerId={ownerId}
              onRequestStatusReason={onRequestStatusReason}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </Box>
  )
}

function AccountRowActionEntry({
  action,
  accountId,
  commercialStatus,
  ownerId,
  onRequestStatusReason,
}: {
  action: AccountRowAction
  accountId: string
  commercialStatus: CommercialLifecycle | undefined
  ownerId: string | undefined
  onRequestStatusReason: (status: CommercialLifecycle) => void
}) {
  const { t } = useTranslation('accounts')
  const Icon = action.icon
  return (
    <>
      {action.separatorBefore && <DropdownMenuSeparator className="my-1 bg-[var(--bellum-border)]" />}
      {action.kind === 'submenu' && action.key === 'assign' ? (
        <AccountAssignSubmenu variant="dropdown" accountId={accountId} currentOwnerId={ownerId} />
      ) : action.kind === 'submenu' ? (
        <CommercialStatusSubmenu
          variant="dropdown"
          accountId={accountId}
          current={commercialStatus}
          onRequestReason={onRequestStatusReason}
        />
      ) : (
        <DropdownMenuItem
          disabled={action.disabled}
          onSelect={action.run}
          className={cn(
            ITEM_CLASS,
            // `DropdownMenuItem` n'a pas le `variant="destructive"` de son
            // jumeau contextuel : le rouge se pose donc par le TOKEN sémantique
            // de texte (`*-soft-text`), jamais par `--bellum-danger` nu — qui
            // ne passe AA que d'un côté du thème.
            action.destructive &&
              'text-[var(--danger-soft-text)] focus:bg-[color-mix(in_srgb,var(--bellum-danger)_10%,transparent)] focus:text-[var(--danger-soft-text)]',
          )}
        >
          <Icon className={cn('size-4', !action.destructive && 'text-[var(--bellum-text-primary)]')} aria-hidden />
          {/* i18n keys: common:actions.share | list.relaunch | list.askCopilot |
              absorb.menuItem | list.archiveAccount | list.archiving | list.deleteAccount |
              list.openDossier | list.setNextAction | list.sleep */}
          {t(action.labelKey)}
        </DropdownMenuItem>
      )}
    </>
  )
}
