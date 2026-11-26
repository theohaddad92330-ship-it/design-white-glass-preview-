import { ChevronRight, type LucideIcon } from 'lucide-react'
import { cn, Text } from '@bellum/ui'

type Props = {
  icon: LucideIcon
  title: string
  description: string
  value?: string
  onClick: () => void
  /**
   * `row` : une ligne dans un bloc de Réglages. `card` : une carte de thème du profil (maquette Théo V22
   * `settings-espace#profil`, `.ob20-profile-themes > a`) — icône, intitulé, avancement, chevron.
   */
  variant?: 'row' | 'card'
}

export function ProfileSection({ icon: Icon, title, description, value, onClick, variant = 'row' }: Props) {
  const isCard = variant === 'card'
  return (
    <button
      type="button"
      onClick={onClick}
      data-profile-section={variant}
      className={cn(
        'flex w-full items-center gap-4 text-left transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] pointer-coarse:min-h-11',
        isCard ? 'rounded-card border border-[var(--bellum-border)] bg-card p-5' : 'px-5 py-4 sm:px-6',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-control bg-[var(--bellum-surface-2)]">
        <Icon aria-hidden className="h-4 w-4 text-[var(--bellum-text-secondary)]" />
      </span>
      <span className="min-w-0 flex-1">
        <Text element="span" size="sm" weight={isCard ? 'semibold' : 'medium'} className="block">
          {title}
        </Text>
        {isCard && value ? (
          <Text element="span" size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
            {value}
          </Text>
        ) : null}
        {description ? (
          <Text element="span" size="xs" className="mt-0.5 block truncate text-[var(--bellum-text-secondary)]">
            {description}
          </Text>
        ) : null}
      </span>
      {!isCard && value ? (
        <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
          {value}
        </Text>
      ) : null}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" />
    </button>
  )
}
