import { Badge, cn, Text } from '@bellum/ui'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

type ComingSoonBadgeProps = {
  /** Texte affiché. Défaut : "Bientôt disponible". Passe `"Bientôt"` pour la version compacte. */
  label?: string
  className?: string
}

/**
 * Pastille ambrée "Bientôt disponible" utilisée pour signaler qu'une
 * action visible est volontairement désactivée. À utiliser de pair avec
 * un bouton/toggle disabled ou une règle statique qui rend ce composant
 * quand la fonctionnalité n'est pas encore disponible.
 */
export const ComingSoonBadge = memo<ComingSoonBadgeProps>(function ComingSoonBadge({ label, className }) {
  const { t } = useTranslation('common')
  return (
    <Badge
      variant="warning"
      className={cn('flex items-center justify-center gap-2 px-1 py-1 text-[var(--bellum-text-primary)]', className)}
    >
      <Text element="span" size="xs" weight="normal">
        {label ?? t('states.comingSoon')}
      </Text>
    </Badge>
  )
})
