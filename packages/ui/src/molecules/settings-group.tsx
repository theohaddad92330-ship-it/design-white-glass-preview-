import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

export type SettingsGroupTone = 'default' | 'danger'

export type SettingsGroupProps = {
  /** Label affiché au-dessus de la carte (ex. "Activité", "Changelog"). */
  label: string
  /** Optionnel — phrase d'introduction sous le label, en gris clair. */
  description?: string
  /** Liste de `<SettingsRow>` ou tout autre contenu de carte. */
  children: ReactNode
  /**
   * `default` : bordure grise discrète (cas standard).
   * `danger`  : bordure rouge + label rouge — utilisé pour la zone dangereuse.
   */
  tone?: SettingsGroupTone
  className?: string
}

/**
 * Groupe de paramètres style Linear : un label en bas de casse au-dessus
 * d'une carte arrondie qui contient les `<SettingsRow>`. Les séparateurs
 * entre rangées sont gérés par chaque row via `last:border-b-0` —
 * l'`overflow-hidden` ici garantit que les coins de la carte restent
 * propres même quand un row hover ou focus.
 *
 * Le composant s'appuie sur les CSS vars BellumAI
 * (`--border-subtle`, `--bg-surface`, `--text-ghost`) — n'importe quel
 * consommateur de `@bellum/ui` doit les avoir définies dans sa feuille
 * de tokens (cf. `apps/web/src/styles/tokens.css`).
 */
export function SettingsGroup({ label, description, children, tone = 'default', className }: SettingsGroupProps) {
  const isDanger = tone === 'danger'
  return (
    <Box as="section" className={cn('mb-6 last:mb-0', className)}>
      <Text size="sm" weight="medium" color={isDanger ? 'text-[var(--danger-soft-text)]' : ''} className="mb-2">
        {label}
      </Text>
      {description && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mb-3">
          {description}
        </Text>
      )}
      <Box
        rounded="xl"
        className={cn(
          'border border-neutral-200 dark:border-white/10 bg-card dark:bg-neutral-900 overflow-hidden',
          isDanger ? 'border-red-500/20' : 'border-[var(--border-subtle)]',
        )}
      >
        {children}
      </Box>
    </Box>
  )
}
