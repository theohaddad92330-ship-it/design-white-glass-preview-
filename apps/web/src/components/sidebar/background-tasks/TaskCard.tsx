import { Link } from '@tanstack/react-router'
import { BrailleLoader, Card, Text, cn } from '@bellum/ui'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { bannerActionClassName } from '@/components/layout/Banner'
import { useCancelAnalysis } from '@/features/accounts/hooks/useCancelAnalysis'
import { statusLabel, type DisplayTask } from './types'

type TaskCardProps = {
  entry: DisplayTask
  onDismiss: () => void
  onNavigate: () => void
}

export function TaskCard({ entry, onDismiss, onNavigate }: TaskCardProps) {
  const { t } = useTranslation('analysis')
  const running = entry.status === 'running'
  const failed = entry.status === 'error'
  const done = entry.status === 'completed'
  const cancelAnalysis = useCancelAnalysis()
  // MAQ-SHELL `#lay-tasks` (validé 19/10) : une analyse EN COURS porte ses deux gestes — voir ce qui est
  // déjà trouvé (le dossier) et l'annuler (la même mutation qu'Aujourd'hui, `RunningJobsBlock`). La carte
  // n'est alors plus un lien entier : un bouton dans un lien est du HTML invalide.
  const accountId = entry.accountId
  const actionable = running && entry.source === 'analysis' && accountId !== undefined

  const card = (
    <Card className="w-full overflow-hidden rounded-card border-[var(--bellum-border)] bg-card px-4 py-3 shadow-none transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {running ? (
            <BrailleLoader
              variant={entry.loaderVariant}
              dotSize={2}
              dotGap={1}
              className="text-[var(--bellum-text-accent)]"
            />
          ) : done ? (
            <CheckCircle2 className="size-4 text-[var(--success-soft-text)]" />
          ) : (
            <AlertCircle className="size-4 text-[var(--danger-soft-text)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* MAQ-SHELL `#lay-tasks` : l'état en badge teinté (une couleur = un état), puis le nom. */}
          <div className="flex min-w-0 items-center gap-2">
            <span
              data-testid="task-status"
              className={cn(
                'inline-flex shrink-0 items-center rounded-badge border px-1.5 py-0.5 text-xs font-medium',
                running &&
                  'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
                done &&
                  'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
                failed &&
                  'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
              )}
            >
              {statusLabel(entry.status)}
            </span>
            <Text
              element="p"
              size="sm"
              weight="semibold"
              noWrap
              className="min-w-0 flex-1 text-[var(--bellum-text-primary)]"
            >
              {entry.title}
            </Text>
          </div>
          {entry.subtitle && (
            <Text element="p" size="xs" noWrap className="mt-0.5 text-[var(--bellum-text-muted)]">
              {entry.subtitle}
            </Text>
          )}
          {running && entry.stepLabel && (
            <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {entry.stepLabel}
            </Text>
          )}
        </div>

        {/* Tiny icon-only dismiss — Button's children-as-Text wrapping makes it
         *  awkward at this size, so we keep a raw button here. */}
        {!running && (
          <button
            type="button"
            onClick={e => {
              e.preventDefault()
              e.stopPropagation()
              onDismiss()
            }}
            aria-label={t('tasks.dismissAria')}
            className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-control text-[var(--bellum-text-muted)] transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {actionable ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-7">
          <Link
            to="/accounts/$id"
            params={{ id: accountId }}
            onClick={onNavigate}
            className={bannerActionClassName('neutral')}
          >
            {t('tasks.seeFound')}
          </Link>
          <button
            type="button"
            disabled={cancelAnalysis.isPending}
            onClick={() => cancelAnalysis.mutate(accountId)}
            className={bannerActionClassName('danger')}
          >
            {t('tasks.cancelAnalysis')}
          </button>
        </div>
      ) : null}
    </Card>
  )

  if (actionable) return card

  return entry.accountId ? (
    <Link to="/accounts/$id" params={{ id: entry.accountId }} onClick={onNavigate} className="block w-full min-w-0">
      {card}
    </Link>
  ) : (
    card
  )
}
