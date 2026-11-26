import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useActiveWorkContextStore } from '../activeWorkContextStore'

/**
 * #2455.5 — « affiche clairement le contexte actif ». Montée dans `/chat`
 * (le composant, pas la coquille contestée par les autres lots de la vague) :
 * un bandeau discret au-dessus du fil, jamais dans `Chat.tsx` lui-même.
 */
export function WorkContextBanner() {
  const { t } = useTranslation('workContexts')
  const active = useActiveWorkContextStore(s => s.active)
  const clear = useActiveWorkContextStore(s => s.clear)

  if (!active) return null

  return (
    <Box
      display="flex"
      className="items-center justify-between gap-3 border-b border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-2"
    >
      <Box display="flex" className="items-center gap-2">
        <Badge variant="primary">{t('banner.active', { name: active.name })}</Badge>
      </Box>
      <Button variant="ghost" size="sm" icon={X} onClick={clear}>
        {t('banner.clear')}
      </Button>
    </Box>
  )
}
