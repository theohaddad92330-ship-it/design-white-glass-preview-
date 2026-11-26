import { Badge, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { OperationStatus } from '@/lib/operation-status'

const TONE: Record<OperationStatus, string> = {
  pending: 'border-[var(--border-default)] text-[var(--bellum-text-secondary)]',
  running: 'border-[var(--border-default)] text-[var(--bellum-text-accent)]',
  completed: 'border-green-500/30 bg-green-500/10 text-[var(--bellum-success-text)]',
  partial: 'border-amber-500/30 bg-amber-500/10 text-[var(--bellum-warning-text)]',
  interrupted: 'border-amber-500/30 bg-amber-500/10 text-[var(--bellum-warning-text)]',
}

/**
 * #3666.3 — l'état d'une opération longue, dit en MOTS (jamais un pourcentage).
 * Le libellé porte le sens : la couleur seule ne distingue pas « partielle » de
 * « interrompue ».
 */
export function OperationStatusBadge({ status }: { status: OperationStatus }) {
  const { t } = useTranslation('analysis')
  return (
    <Badge variant="outline" className={cn('shrink-0', TONE[status])} data-status={status}>
      {t(`operations.status.${status}`)}
    </Badge>
  )
}
