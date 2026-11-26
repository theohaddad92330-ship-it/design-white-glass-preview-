import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { TaskList } from '@/features/tasks/view/TaskList'

/**
 * Refonte Théo (23/10) — `plan:tasks` de `a/comptes-fiche.html` : les ACTIONS du compte en tête du plan (elles
 * vivaient dans l'Historique, qui garde un lien vers ici). La note de la maquette tient la doctrine : « fait » ne
 * porte jamais de preuve d'envoi. « Toutes mes actions » ouvre l'écran Actions.
 */
export function PlanTasksPanel({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts', { keyPrefix: 'planTheo' })
  return (
    <section
      data-testid="plan-tasks"
      aria-labelledby="plan-tasks-title"
      className="min-w-0 rounded-card border border-[var(--bellum-border)] bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h3" id="plan-tasks-title" size="base" weight="semibold">
          {t('tasksTitle')}
        </Text>
        <Link
          to="/actions"
          className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
        >
          {t('allActions')}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
      <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('doneIsNotSent')}
      </Text>
      <div className="mt-3">
        <TaskList scope="account" entityId={accountId} accountId={accountId} compact screen="/accounts/$id" />
      </div>
    </section>
  )
}
