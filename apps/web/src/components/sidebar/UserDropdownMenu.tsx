import { useNavigate } from '@tanstack/react-router'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@bellum/ui'
import { getInitials } from '@bellum/utils'
import { KeyboardIcon, LogOutIcon, UserCircleIcon } from 'lucide-react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShortcutKeys } from '@/features/shortcuts/ShortcutKeys'
import { HIDE_ON_TOUCH, shortcutAriaKeys } from '@/features/shortcuts/shortcut-format'
import { shortcutById, shortcutTarget } from '@/features/shortcuts/shortcuts'
import { useAuth } from '@/hooks/useAuth'

type UserInfo = {
  name: string
  /** OAuth-provided picture (Google `avatar_url`, etc.). Falls back to
   *  the colored initials when null or when the image fails to load. */
  avatarUrl?: string | null
  avatarBgClass?: string
  avatarTextClass?: string
}

type UserDropdownMenuProps = {
  user: UserInfo
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Un seul déclencheur depuis #4520 (l'ancienne variante `row` a quitté le pied de barre) : l'avatar. */
  triggerVariant?: 'avatar'
}

const itemClasses =
  'gap-2.5 px-2.5 rounded-lg py-2 text-sm text-[var(--bellum-text-secondary)] focus:bg-[var(--bellum-surface-2)] focus:text-[var(--bellum-text-primary)] [&_svg]:size-4 [&_svg]:text-[var(--bellum-text-muted)] cursor-pointer'

export const UserDropdownMenu = memo<UserDropdownMenuProps>(function UserDropdownMenu({
  user,
  side = 'top',
  align = 'start',
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { t } = useTranslation('nav')
  const { t: tShortcuts } = useTranslation('shortcuts')
  const helpShortcut = shortcutById('help')

  const initials = getInitials(user.name).slice(0, 2)

  const handleProfile = () => {
    setOpen(false)
    void navigate({ to: '/settings/profile' })
  }

  /**
   * Le CHEMIN CLIQUABLE vers la page des raccourcis.
   *
   * Elle ne s'ouvrait que par `⌘/` — c'est-à-dire par un raccourci qu'il
   * fallait déjà connaître pour découvrir les raccourcis. « Un raccourci ne
   * remplace jamais un chemin cliquable » : cette entrée est ce chemin.
   *
   * Depuis le 30/08 elle NAVIGUE au lieu d'ouvrir une modale : la page dédiée
   * a remplacé la liste, et elle en dit plus (la portée, ce que fait chaque
   * raccourci). Ce menu n'est pas la seule porte — la barre de Réglages porte
   * l'entrée « Raccourcis clavier », section Personnel.
   */
  const handleShortcuts = () => {
    setOpen(false)
    void navigate({ to: shortcutTarget(helpShortcut.id) })
  }

  const handleSignOut = () => {
    setOpen(false)
    void signOut().then(() => navigate({ to: '/' }))
  }

  const avatar = (
    <Avatar
      className={cn(
        'size-[2.125rem] rounded-full border shrink-0 transition-colors',
        open ? 'border-[var(--bellum-primary-400)]' : 'border-[var(--bellum-border)]',
        !open && 'hover:border-[color-mix(in_srgb,var(--bellum-primary-400)_40%,transparent)]',
      )}
    >
      {user.avatarUrl && (
        <AvatarImage src={user.avatarUrl} alt={user.name} className="object-cover" referrerPolicy="no-referrer" />
      )}
      <AvatarFallback
        className={cn(
          'text-xs font-semibold uppercase',
          user.avatarBgClass ?? 'bg-[var(--bellum-accent-bg)]',
          user.avatarTextClass ?? 'text-[var(--bellum-text-accent)]',
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('user.account')}
          className="flex items-center justify-center cursor-pointer focus:outline-none"
        >
          {avatar}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={side}
        align={align}
        sideOffset={8}
        className="w-52 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-1.5 text-[var(--bellum-text-primary)] shadow-[var(--shadow-elevated)]"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem className={itemClasses} onClick={handleProfile}>
            <UserCircleIcon />
            <span className="flex-1">{t('user.profile')}</span>
          </DropdownMenuItem>
          {/* `pointer-fine` sur l'ENTRÉE elle-même, et pas seulement sur ses
              capuchons : au doigt, une liste de raccourcis clavier n'est pas
              une aide, c'est une ligne de menu qui ne mène à rien d'utilisable. */}
          <DropdownMenuItem
            className={cn(itemClasses, 'hidden pointer-fine:flex')}
            onClick={handleShortcuts}
            aria-keyshortcuts={shortcutAriaKeys(helpShortcut)}
          >
            <KeyboardIcon />
            <span className="flex-1">{tShortcuts('menuEntry')}</span>
            <ShortcutKeys shortcut={helpShortcut} className={HIDE_ON_TOUCH} />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="my-1 bg-[var(--bellum-border)]" />
        <DropdownMenuItem className={itemClasses} onClick={handleSignOut}>
          <LogOutIcon />
          <span className="flex-1">{t('user.signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
