import { useTranslation } from 'react-i18next'
import { Box, Text } from '@bellum/ui'

/**
 * #4805 — une vue qui n'a rien à montrer NOMME ce qui manque, elle ne disparaît pas.
 *
 * Un `return null` sur une absence de données déjà chargées est un écran qui ment par omission
 * (#4749 : 1 658 contacts, un organigramme vide, aucune phrase). Ce bloc dit QUOI manque et, quand
 * on le sait, POURQUOI — jamais « 0 », jamais une valeur devinée. Il sert aux CARTES et aux vues
 * entières ; dans une LISTE, une absence ne fait toujours aucune ligne (doctrine 20/09/2026).
 */
export function NamedAbsence({ what, reason, testId }: { what: string; reason?: string; testId?: string }) {
  const { t } = useTranslation('common')
  return (
    <Box role="note" data-testid={testId ?? 'named-absence'} className="px-1 py-2">
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('absence.line', { what, reason: reason ?? t('absence.default') })}
      </Text>
    </Box>
  )
}
