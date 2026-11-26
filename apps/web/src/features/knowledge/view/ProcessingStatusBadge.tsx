import type { RagProcessingStatus } from '@bellum/contracts'
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * #3669.2 — l'état de traitement d'un document : ce que Bellum en a réellement
 * fait. Seul `usable` s'affiche comme plein succès ; `partial` et `to_fix` se
 * disent avec un avertissement. Statut absent (`null`/`undefined` = non
 * évalué) : AUCUNE ligne, jamais « exploitable » par défaut (doctrine « on
 * n'affiche pas ce qu'on n'a pas »).
 */
const STATUS_ICON: Record<RagProcessingStatus, LucideIcon> = {
  received: CircleDashed,
  processing: Loader2,
  usable: CheckCircle2,
  partial: AlertTriangle,
  to_fix: AlertTriangle,
}

const STATUS_TONE: Record<RagProcessingStatus, string> = {
  received: 'text-[var(--text-muted)]',
  processing: 'text-[var(--text-muted)]',
  usable: 'text-[var(--success-soft-text)]',
  partial: 'text-[var(--warning-soft-text)]',
  to_fix: 'text-[var(--danger-soft-text)]',
}

export function ProcessingStatusBadge({ status }: { status: RagProcessingStatus | null | undefined }) {
  const { t } = useTranslation('knowledge')
  if (!status) return null
  const Icon = STATUS_ICON[status]
  return (
    <p
      className={`mt-2 flex items-center gap-1.5 text-xs ${STATUS_TONE[status]}`}
      data-testid="document-processing-status"
      data-status={status}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {t(`documents.processingStatus.${status}`)}
    </p>
  )
}
