import { PROJECT_STAGES, type ManagerPipelineValue } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { appLocale, formatCount } from '@/lib/locale'

const KNOWN_STAGES: readonly string[] = PROJECT_STAGES
/** Une teinte par rang d'étape, du plus tôt au plus avancé : une seule couleur, de plus en plus pleine. */
const SHADES = [
  'bg-[var(--bellum-surface-2)]',
  'bg-[var(--bellum-primary-800)]',
  'bg-[var(--bellum-primary-600)]',
  'bg-[var(--bellum-primary-400)]',
  'bg-[var(--bellum-primary-300)]',
  'bg-[var(--bellum-primary-200)]',
] as const

const eur = (amount: number) =>
  new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount)

/**
 * « Le potentiel à convertir » — le pipe OUVERT, étape par étape, en une barre : combien
 * d'affaires et quels montants SAISIS à chaque étape. Non pondéré, ni signé ni encaissé : la
 * carte le dit. Une étape sans montant saisi écrit « — », jamais « 0 € ». Aucune affaire
 * ouverte : aucune carte.
 */
export function TeamPotential({ pipeline }: { pipeline: ManagerPipelineValue | undefined }) {
  const { t } = useTranslation('manager')
  const { t: tProjects } = useTranslation('projects')
  if (!pipeline || pipeline.by_stage.length === 0) return null
  const stages = pipeline.by_stage
  const count = stages.reduce((sum, stage) => sum + stage.total_count, 0)
  const weightOf = (stage: (typeof stages)[number]) => Math.max(stage.amount, 0) || stage.total_count
  const totalWeight = stages.reduce((sum, stage) => sum + weightOf(stage), 0) || 1
  const label = (stage: string) => (KNOWN_STAGES.includes(stage) ? tProjects(`stage.states.${stage}`) : stage)

  return (
    <section
      aria-label={t('board.potential.eyebrow')}
      data-board-block="potential"
      className="space-y-4 rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('board.potential.eyebrow')}
          </Text>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
            {eur(pipeline.total_amount)}{' '}
            <span className="text-sm font-normal text-[var(--bellum-text-secondary)]">
              {t('board.potential.openPipe')}
            </span>
          </p>
        </div>
        <Link
          to="/projects"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--bellum-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
        >
          <ArrowRight aria-hidden className="size-4" />
          {t('board.potential.open')}
        </Link>
      </div>
      <div aria-hidden className="flex h-12 gap-1 overflow-hidden rounded-lg">
        {stages.map((stage, index) => (
          <span
            key={stage.stage}
            className={`block h-full min-w-2 rounded-md ${SHADES[Math.min(index, SHADES.length - 1)]}`}
            style={{ width: `${(weightOf(stage) / totalWeight) * 100}%` }}
          />
        ))}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stages.map((stage, index) => (
          <li key={stage.stage} className="min-w-0">
            <span className="flex items-center gap-2 text-sm text-[var(--bellum-text-secondary)]">
              <span
                aria-hidden
                className={`size-2 shrink-0 rounded-full ${SHADES[Math.min(index, SHADES.length - 1)]}`}
              />
              <span className="truncate">{label(stage.stage)}</span>
              <span className="ml-auto tabular-nums">{formatCount(stage.total_count)}</span>
            </span>
            <strong className="mt-1 block text-sm tabular-nums text-[var(--bellum-text-primary)]">
              {stage.valued_count > 0 ? eur(stage.amount) : '—'}
            </strong>
          </li>
        ))}
      </ul>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('board.potential.footer', { count: count, formatted: formatCount(count) })}
      </Text>
    </section>
  )
}
