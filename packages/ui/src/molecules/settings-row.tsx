import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

export type SettingsRowProps = {
  title: string
  description?: string
  badge?: ReactNode
  trailing?: ReactNode
  className?: string
}

export function SettingsRow({ title, description, badge, trailing, className }: SettingsRowProps) {
  return (
    <Box
      data-settings-row=""
      display="flex"
      px={4}
      py={4}
      className={cn(
        // Sous 768px (la seule borne, `md` — §8 du design system) : le
        // libellé passe AU-DESSUS du contrôle plutôt que de partager la
        // ligne avec lui — aucune règle responsive n'existait ici. `md:`
        // restaure exactement le rendu d'avant (rangée, centré, espacé).
        'flex-col items-start gap-2 border-b border-[var(--bellum-border)] last:border-b-0 md:flex-row md:items-center md:justify-between md:gap-4',
        className,
      )}
    >
      <Box className="min-w-0">
        <Box display="flex" className="items-center gap-2 flex-wrap">
          <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {title}
          </Text>
          {badge}
        </Box>
        {description && (
          <Text size="xs" className="text-[var(--bellum-text-secondary)] mt-0.5">
            {description}
          </Text>
        )}
      </Box>
      {trailing}
    </Box>
  )
}
