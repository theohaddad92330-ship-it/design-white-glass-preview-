import type { Account } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { FileText, Link2, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { procurementRowsOf, type ProcurementRow } from './procurementRows'

const INTRO_CARDS: readonly { key: 'relation' | 'listing' | 'order'; icon: LucideIcon }[] = [
  { key: 'relation', icon: Link2 },
  { key: 'listing', icon: ShieldCheck },
  { key: 'order', icon: FileText },
]

/** `YYYY-MM-DD` du jour local — l'échéance exigée par le contrat de tâche. */
function todayLocalDay(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * #5106 — « Pratiques achats », forme maquette V22 : en-tête, trois repères, puis UNE carte par ligne de la
 * section achats du brief. Aucun fournisseur nommé, aucune probabilité ; sans section : aucune carte, un état vide.
 */
export function ProcurementPractices({ account, firstName = '' }: { account: Account; firstName?: string }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'procurement' })
  const createTask = useCreateTask()
  const rows = procurementRowsOf(account.raw_analysis)

  // #5106.6 — le chemin existant `useCreateTask`, rattachée au compte affiché ; aucun autre identifiant.
  const prepare = (row: ProcurementRow) => {
    const name = row.name || row.element
    createTask.mutate({
      title: t('task.title', { name }),
      dueOn: todayLocalDay(),
      priority: 'normal',
      objective: t('task.objective', { name }),
      expectedResult: t('task.expectedResult'),
      accountId: account.id,
    })
  }

  return (
    <section data-testid="procurement-practices" className="flex min-w-0 flex-col gap-5">
      <header className="min-w-0">
        <Text element="h2" size="lg" weight="semibold">
          {firstName ? t('title', { firstName }) : t('titleWithoutName')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('lead')}
        </Text>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {INTRO_CARDS.map(({ key, icon: Icon }) => (
          <div
            key={key}
            className="rounded-card border border-[var(--bellum-border)] bg-card p-5"
            data-testid="procurement-intro-card"
          >
            <Icon className="mb-3 size-5 text-[var(--bellum-text-accent)]" aria-hidden />
            <Text element="h3" size="base" weight="semibold">
              {t(`intro.${key}.title`)}
            </Text>
            <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t(`intro.${key}.body`)}
            </Text>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="procurement-empty">
          {t('empty')}
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="procurement-grid">
          {rows.map((row, index) => (
            <ProcurementCard
              key={`${row.element}-${row.name}-${index}`}
              row={row}
              pending={createTask.isPending}
              onPrepare={() => prepare(row)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function ProcurementCard({
  row,
  pending,
  onPrepare,
}: {
  row: ProcurementRow
  pending: boolean
  onPrepare: () => void
}) {
  const { t } = useTranslation('accounts', { keyPrefix: 'procurement' })
  const title = row.name || row.element
  return (
    <article
      data-testid="procurement-card"
      className="flex min-w-0 flex-col items-start gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-6"
    >
      <Text size="xs" weight="semibold" className="uppercase tracking-wider text-[var(--bellum-text-accent)]">
        {row.element || t('eyebrowFallback')}
      </Text>
      <Text element="h3" size="lg" weight="semibold">
        {title}
      </Text>
      {row.whatItIs ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {row.whatItIs}
        </Text>
      ) : null}
      {row.keepInMind ? (
        <details className="w-full">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-[var(--bellum-text-accent)]">
            {t('readingToggle')}
          </summary>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {row.keepInMind}
          </Text>
          <Text size="xs" className="mt-2 block text-[var(--bellum-text-muted)]">
            {t('origin', { value: row.reliability || t('originUnknown') })}
          </Text>
        </details>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-auto min-h-11"
        disabled={pending}
        aria-label={t('prepareAria', { name: title })}
        onClick={onPrepare}
      >
        {t('prepare')}
      </Button>
    </article>
  )
}
