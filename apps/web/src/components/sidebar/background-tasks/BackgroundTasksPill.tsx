import { BrailleLoader, Text, cn } from '@bellum/ui'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { DisplayTask } from './types'

type BackgroundTasksPillProps = {
  entries: DisplayTask[]
  onClick: () => void
}

/**
 * Closed-state pill rendered next to the sidebar BrandHeader. Shows the
 * primary running task (or an aggregated count when several are active),
 * and falls back to a "Terminé" / "Échec" pill when nothing is running but
 * residual entries remain in the stores.
 *
 * The leading element switches between a `BrailleLoader` (running) and a
 * Lucide icon (idle states). `Button` from `@bellum/ui` only accepts
 * `LucideIcon` for its `icon` prop and wraps children inside a `Text` flex
 * container, which mangles the loader+label layout — so this pill stays a
 * raw `<button>` with `Text` for the label only.
 */
export function BackgroundTasksPill({ entries, onClick }: BackgroundTasksPillProps) {
  const { t } = useTranslation('analysis')
  const runningCount = entries.filter(e => e.status === 'running').length
  const hasRunning = runningCount > 0
  const hasError = entries.some(e => e.status === 'error')
  const primary = entries.find(e => e.status === 'running') ?? entries[0]!

  const pillLabel = hasRunning
    ? runningCount > 1
      ? t('tasks.pillCount', { count: runningCount })
      : primary.label
    : hasError
      ? t('tasks.status.error')
      : t('tasks.status.completed')
  const ariaLabel = hasRunning
    ? t('tasks.runningAria', { count: runningCount })
    : hasError
      ? t('tasks.errorAria')
      : t('tasks.completedAria')

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        'inline-flex w-fit items-center gap-2 rounded-badge border py-1 pl-2 pr-3 transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] pointer-coarse:min-h-11',
        hasRunning
          ? 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]'
          : hasError
            ? 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]'
            : 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
      )}
    >
      {hasRunning ? (
        <BrailleLoader
          variant={primary.loaderVariant}
          dotSize={2}
          dotGap={1}
          className="text-[var(--accent-soft-text)]"
        />
      ) : hasError ? (
        <AlertCircle className="size-3.5" />
      ) : (
        <CheckCircle2 className="size-3.5" />
      )}
      <Text element="span" size="xs" leading="none" className="max-w-[90px] truncate font-medium">
        {pillLabel}
      </Text>
    </button>
  )
}
