import { useTranslation } from 'react-i18next'
import { Badge, cn } from '@bellum/ui'
import { isDecisionMaker } from '@/lib/contactRoles'

/**
 * 13/10/2026 (décision Louis) — pastille « Décideur » sur chaque ligne de contact décideur des listes de la
 * fiche compte. Rien pour un non-décideur ni un rôle inconnu : on n'affiche pas ce qu'on n'a pas.
 */
export function DecisionMakerBadge({ role, className }: { role: string | null | undefined; className?: string }) {
  const { t } = useTranslation('contacts')
  if (!isDecisionMaker(role)) return null
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 border-[var(--bellum-primary-500)] px-1.5 py-0 text-xs font-medium text-[var(--bellum-text-accent)]',
        className,
      )}
    >
      {t('roles.decisionMaker')}
    </Badge>
  )
}
