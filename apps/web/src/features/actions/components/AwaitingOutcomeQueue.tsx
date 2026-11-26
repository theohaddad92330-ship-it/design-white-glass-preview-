import { outcomesForTargetKind, type ActionPlanOutcome, type AwaitingOutcomeAction } from '@bellum/contracts'
import { Box, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { planItemsApi } from '../planItems.api'

/**
 * #3211.9 (#3234, lot M11 09/10) — LA FILE PROACTIVE DES ISSUES MANQUANTES.
 *
 * Une action FAITE sans issue (complétée par preuve d'envoi, ou antérieure à
 * la règle #2396.2) n'apprend rien à l'espace : la recommandation par cadence,
 * route ou priorité (#3211.11) ne la compte pas. Cette file les PRÉSENTE sans
 * qu'on les demande, et la saisie est dédiée : un menu d'issues par ligne,
 * écrit par le PATCH existant (`outcome` seul — posé une fois, jamais en
 * réécrivant une issue déjà déclarée).
 *
 * Rien à déclarer → la section n'existe pas (une absence ne fait aucune ligne).
 * Lecture en échec → elle le DIT : jamais « rien à déclarer » par défaut.
 */
export function AwaitingOutcomeQueue() {
  const { t } = useTranslation('actions')
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['plan-items', 'awaiting-outcome'],
    queryFn: () => planItemsApi.awaitingOutcome(),
  })
  const declare = useMutation({
    mutationKey: ['plan-items', 'declare-outcome'],
    mutationFn: (input: { id: string; outcome: ActionPlanOutcome }) =>
      planItemsApi.update(input.id, { outcome: input.outcome }),
    onSuccess: () => toast.success(t('center.awaitingOutcome.declaredToast')),
    onError: (error: Error) => toast.error(t('center.awaitingOutcome.declareError'), { description: error.message }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plan-items'] })
    },
  })

  if (queue.isLoading) return null
  // Une réponse illisible (pas une liste) est une lecture impossible, jamais un vide.
  if (queue.isError || !Array.isArray(queue.data)) {
    return (
      <Text size="xs" className="text-muted-foreground">
        {t('center.awaitingOutcome.unavailable')}
      </Text>
    )
  }
  const rows = queue.data
  if (rows.length === 0) return null

  return (
    <section
      aria-label={t('center.awaitingOutcome.title', { count: rows.length })}
      className="space-y-2 rounded-lg border border-border p-3"
    >
      <Text element="h3" size="sm" weight="medium">
        {t('center.awaitingOutcome.title', { count: rows.length })}
      </Text>
      <Text size="xs" className="text-muted-foreground">
        {t('center.awaitingOutcome.hint')}
      </Text>
      <ul className="space-y-1">
        {rows.map(row => (
          <AwaitingOutcomeRow
            key={row.id}
            row={row}
            pending={declare.isPending && declare.variables?.id === row.id}
            onDeclare={outcome => declare.mutate({ id: row.id, outcome })}
          />
        ))}
      </ul>
    </section>
  )
}

function AwaitingOutcomeRow({
  row,
  pending,
  onDeclare,
}: {
  row: AwaitingOutcomeAction
  pending: boolean
  onDeclare: (outcome: ActionPlanOutcome) => void
}) {
  const { t } = useTranslation('actions')
  return (
    <li className="flex items-center gap-2">
      <Link
        to="/accounts/$id"
        params={{ id: row.account_id }}
        search={{ tab: 'plan' }}
        className="min-w-0 flex-1 rounded-lg py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        <Box className="min-w-0">
          <Text size="sm" weight="medium" className="truncate text-foreground">
            {row.label}
          </Text>
          <Text size="xs" className="truncate text-muted-foreground">
            {row.company_name ?? t('center.relances.companyFallback')}
            {row.completion_mode === 'proof' ? ` · ${t('center.awaitingOutcome.byProof')}` : ''}
          </Text>
        </Box>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          aria-label={t('center.awaitingOutcome.declare', { label: row.label })}
          className="min-h-11 shrink-0 rounded-md border border-border px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] disabled:opacity-50"
        >
          {t('center.awaitingOutcome.declareShort')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {outcomesForTargetKind(row.target_kind).map(outcome => (
            <DropdownMenuItem key={outcome} onSelect={() => onDeclare(outcome)}>
              {t(`outcome.${outcome}`)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
