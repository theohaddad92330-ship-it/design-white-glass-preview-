import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { TFunction } from 'i18next'
import type { ActionHistoryItem, ActionIntent, AnalysisRun } from '@bellum/contracts'
import { BrailleLoader, Button, Text } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { Clock, History, Radio } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { PageBreadcrumb } from '@/components/layout/PageHeader'
import { CustomerPage } from '@/components/page/CustomerPage'
import { TheoMetaGrid, TheoNote, TheoPill, TheoSectionTitle } from '@/components/page/theo-page-grammar'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'
import { actionHistoryKeys } from '@/features/action-history/api'
import { useActionHistoryItem } from '@/features/action-history/hooks/useActionHistory'
import { actionsApi } from '@/features/actions/api'
import { gestureIdempotency } from '@/features/actions/lib/gesture-idempotency'
import { queryClient } from '@/lib/query-client'
import { accountAnalysisStatusLabel, buildAccountSummaryRows, formatRunDuration } from './actionHistoryDetailData'
import { actionIconByCategory, actionStatusLabel, formatActionDate, statusVariant } from './actionHistoryPresentation'

type ActionHistoryDetailRouteId = '/actions/$id'

export function ActionHistoryDetailPage({ from = '/actions/$id' }: { from?: ActionHistoryDetailRouteId } = {}) {
  const { t } = useTranslation('actions')
  const navigate = useNavigate()
  const { id } = useParams({ from })
  const action = useActionHistoryItem(id)
  const backTo = '/actions'
  const ActionIcon = action.data ? actionIconByCategory[action.data.category] : Clock
  const shouldReduceMotion = Boolean(useReducedMotion())
  const breadcrumbs = buildBreadcrumbs(t, backTo, action.data?.action_label)

  // Enrich an account-linked event with the REAL, already-stored dossier facts
  // (status, score, contacts, dominant signal) + the account's run history —
  // nothing invented. Both hooks stay disabled until an account id is known.
  const linkedAccountId = action.data?.target.account_id ?? undefined
  const linked = useAccount(linkedAccountId ?? '')
  const runsQuery = useAccountRuns(linkedAccountId)
  const summaryRows = buildAccountSummaryRows(t, linked.account, linked.contacts.length)
  const runs = runsQuery.data ?? []

  return (
    <CustomerPage
      pageTitle={action.data?.action_label ?? t('detail.fallbackTitle')}
      pageSubtitle={t('detail.subtitle')}
      breadcrumbs={breadcrumbs}
      contentClassName="px-0 py-6"
    >
      {/* Théo PR12 — la grammaire du dialogue « tâche » de c/actions-aujourdhui (#dlg-task) posée en page, croisée
          avec notre panneau validé (maq-actions-19-10, aujourdhui.html#etat-detail-action) : pastilles d'état,
          grille de méta, le geste en clair, la note de doctrine, puis le pied d'actions (Fermer à gauche). */}
      <div className={`mx-auto flex w-full max-w-3xl flex-col ${PAGE_GUTTER_X}`}>
        {action.isLoading ? (
          <DetailSurface shouldReduceMotion={shouldReduceMotion}>
            <BrailleLoader variant="grid-searching" />
          </DetailSurface>
        ) : action.data ? (
          <DetailSurface shouldReduceMotion={shouldReduceMotion} label={t('detail.sheetLabel')}>
            <div className="flex flex-col gap-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2" data-testid="action-detail-pills">
                {action.data.status ? (
                  <TheoPill tone={pillToneForStatus(statusVariant(action.data.status))}>
                    {actionStatusLabel(t, action.data.status)}
                  </TheoPill>
                ) : null}
                <TheoPill>
                  <ActionIcon className="size-3.5" aria-hidden="true" />
                  {t(`tabs.${action.data.category}`)}
                </TheoPill>
                {/* PAR QUOI l'action est passée (AUTO-01 : « chaque action affiche … l'outil »). Le canal était
                    chargé et jamais montré : sans lui, deux lignes « Export » se ressemblent alors que l'une est
                    partie dans un CRM et l'autre dans un fichier. Absent quand l'action n'a pas de canal — un
                    tiret se lirait comme une donnée manquante plutôt que comme « sans objet ». */}
                {action.data.channel ? (
                  <TheoPill>
                    <Radio className="size-3.5" aria-hidden="true" />
                    {/* i18n keys: channels.* (une clé par canal du contrat) */}
                    {t(`channels.${action.data.channel}`, action.data.channel)}
                  </TheoPill>
                ) : null}
              </div>

              <TheoMetaGrid
                label={t('detail.metaLabel')}
                items={[
                  { label: t('detail.rowAccount'), value: action.data.target.label },
                  // #3388 (recette 30/09) — l'échelle commerciale commune (machine d'état #2967), absente quand le
                  // compte n'a aucun besoin — jamais un stade deviné.
                  ...(action.data.target.commercial_stage
                    ? [
                        {
                          label: t('detail.rowCommercialStage'),
                          value: t(`commercialStage.${action.data.target.commercial_stage}`, { ns: 'common' }),
                        },
                      ]
                    : []),
                  { label: t('detail.rowUser'), value: action.data.actor.name },
                  { label: t('detail.rowDate'), value: formatActionDate(action.data.created_at) },
                ]}
              />

              {action.data.detail ? (
                <section className="flex flex-col gap-2" aria-labelledby="action-detail-what">
                  <h2 id="action-detail-what" className="text-sm font-semibold text-[var(--bellum-text-primary)]">
                    {t('detail.whatTitle')}
                  </h2>
                  <Text size="sm" className="whitespace-pre-line leading-relaxed text-[var(--bellum-text-secondary)]">
                    {action.data.detail}
                  </Text>
                </section>
              ) : null}

              {summaryRows.length > 0 && (
                <section className="flex flex-col gap-3">
                  <TheoSectionTitle>{t('detail.summaryTitle')}</TheoSectionTitle>
                  <TheoMetaGrid items={summaryRows.map(row => ({ label: row.label, value: row.value }))} />
                </section>
              )}

              {runs.length > 0 && (
                <section className="flex flex-col gap-3">
                  <TheoSectionTitle>{t('detail.runsTitle')}</TheoSectionTitle>
                  <ul className="flex flex-col gap-2">
                    {runs.map(run => (
                      <RunRow key={run.id} run={run} t={t} />
                    ))}
                  </ul>
                </section>
              )}

              {/* Doctrine « Fait ne porte jamais de preuve d'envoi » — la note validée (etat-detail-action). */}
              <TheoNote>{t('detail.traceNote')}</TheoNote>
            </div>

            <footer
              className="flex flex-col-reverse gap-2 border-t border-[var(--bellum-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              data-testid="action-detail-footer"
            >
              <Button type="button" variant="plain" size="sm" onClick={() => navigate({ to: backTo })}>
                {t('common:actions.back')}
              </Button>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <CopyIdAction id={action.data.id} />
                {action.data.target.account_id && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={'/accounts/$id'} params={{ id: action.data.target.account_id }}>
                      {t('detail.openAccount')}
                    </Link>
                  </Button>
                )}
                {action.data.target.contact_id && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={'/contacts/$id'} params={{ id: action.data.target.contact_id }}>
                      {t('detail.openContact')}
                    </Link>
                  </Button>
                )}
                {/* Épopée #2771 (#2277.33/.35/.36) — `rollback` est calculé côté serveur (`ActionsService.presentAction`) :
                    `null` tant que cette ligne n'a pas de compensateur, ou qu'il est déjà consommé. Jamais un bouton
                    deviné côté client. */}
                <RollbackAction item={action.data} />
                {/* #2319.114 (épopée #2985) — `crmTaskClosable`, MÊME calcul serveur que `rollback` ci-dessus. */}
                <CloseCrmTaskAction item={action.data} />
              </div>
            </footer>
          </DetailSurface>
        ) : (
          <DetailSurface shouldReduceMotion={shouldReduceMotion}>
            <div className="flex flex-col items-start gap-3 p-5 sm:p-6">
              <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {t('detail.notFoundTitle')}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('detail.notFoundSubtitle')}
              </Text>
              <Button type="button" variant="outline" size="sm" onClick={() => navigate({ to: backTo })}>
                {t('common:actions.back')}
              </Button>
            </div>
          </DetailSurface>
        )}
      </div>
    </CustomerPage>
  )
}

/** « Copier l'identifiant » (notre panneau validé) : l'id de la ligne, pour le citer dans un échange avec le support. */
function CopyIdAction({ id }: { id: string }) {
  const { t } = useTranslation('actions')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id)
      toast.success(t('detail.copyIdDone'))
    } catch {
      toast.error(t('detail.copyIdFailed'))
    }
  }
  return (
    <Button type="button" variant="plain" size="sm" onClick={() => void copy()}>
      {t('detail.copyId')}
    </Button>
  )
}

function RunRow({ run, t }: { run: AnalysisRun; t: TFunction<'actions'> }) {
  const duration = formatRunDuration(t, run.created_at, run.completed_at)
  return (
    <li className="flex items-center justify-between gap-3 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2">
      <TheoPill
        tone={run.status === 'error' ? 'danger' : run.status === 'completed' ? 'success' : 'neutral'}
        className="shrink-0"
      >
        {accountAnalysisStatusLabel(t, run.status)}
      </TheoPill>
      <div className="flex min-w-0 items-center gap-2 text-[var(--bellum-text-secondary)]">
        <Text element="span" size="xs" className="truncate">
          {formatActionDate(run.created_at)}
        </Text>
        {duration && (
          <Text element="span" size="xs" className="shrink-0 font-mono">
            · {duration}
          </Text>
        )}
      </div>
    </li>
  )
}

/**
 * #2277.33/.35/.36 (épopée #2771) — LE bouton d'annulation d'une ligne du
 * Journal, quand elle en a un. `item.rollback` (calculé côté serveur, jamais
 * deviné ici) dit LEQUEL des trois intents cible cette ligne PAR SON ID —
 * exactement la même cible que `snooze` sur un rappel.
 */
export function RollbackAction({ item }: { item: ActionHistoryItem }) {
  const { t } = useTranslation('actions')
  const rollback = item.rollback
  const mutation = useMutation({
    mutationFn: async () => {
      if (!rollback) throw new Error('no rollback for this item')
      const gesture = gestureIdempotency('action-history.rollback', [item.id, rollback])
      try {
        return await actionsApi.dispatch(buildRollbackIntent(item.id, rollback, gesture.key))
      } finally {
        gesture.release()
      }
    },
    onSuccess: result => {
      if (result.status === 'done') toast.success(result.reason ?? t('detail.rollback.doneDefault'))
      else toast.error(result.reason ?? t('detail.rollback.failedDefault'))
      // La ligne (statut, `rollback`) et la liste changent toutes les deux —
      // jamais un bouton qui resterait cliquable sur un rollback déjà consommé.
      void queryClient.invalidateQueries({ queryKey: actionHistoryKeys.all })
    },
    onError: () => toast.error(t('detail.rollback.failedDefault')),
  })

  if (!rollback) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="active:scale-[0.98]"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? t('detail.rollback.running') : t(`detail.rollback.${rollback}`)}
    </Button>
  )
}

function buildRollbackIntent(
  targetId: string,
  rollback: NonNullable<ActionHistoryItem['rollback']>,
  idempotencyKey: string,
): ActionIntent {
  switch (rollback) {
    case 'cancel_reminder':
      return { type: 'cancel_reminder', targetId, idempotencyKey }
    case 'restore_status':
      return { type: 'restore_status', targetId, idempotencyKey }
    case 'remove_crm_task':
      return { type: 'remove_crm_task', targetId, idempotencyKey }
  }
}

/**
 * #2319.114 (épopée #2985) — clôture (marque terminée) une tâche CRM, à côté
 * de `RollbackAction` qui la RETIRE : deux boutons distincts parce que ce
 * sont deux gestes distincts (`close_crm_task` referme réellement la tâche
 * chez le fournisseur, `remove_crm_task` verse une note rectificative).
 * `item.crmTaskClosable` est calculé côté serveur — jamais deviné ici — et
 * les deux boutons ne coexistent jamais (server-side, l'un ferme l'autre).
 */
export function CloseCrmTaskAction({ item }: { item: ActionHistoryItem }) {
  const { t } = useTranslation('actions')
  const mutation = useMutation({
    mutationFn: async () => {
      const gesture = gestureIdempotency('action-history.close-crm-task', [item.id])
      try {
        return await actionsApi.dispatch({ type: 'close_crm_task', targetId: item.id, idempotencyKey: gesture.key })
      } finally {
        gesture.release()
      }
    },
    onSuccess: result => {
      if (result.status === 'done') toast.success(result.reason ?? t('detail.closeCrmTask.doneDefault'))
      else toast.error(result.reason ?? t('detail.closeCrmTask.failedDefault'))
      void queryClient.invalidateQueries({ queryKey: actionHistoryKeys.all })
    },
    onError: () => toast.error(t('detail.closeCrmTask.failedDefault')),
  })

  if (!item.crmTaskClosable) return null

  return (
    <Button
      variant="outline"
      size="sm"
      className="active:scale-[0.98]"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? t('detail.closeCrmTask.running') : t('detail.closeCrmTask.cta')}
    </Button>
  )
}

function buildBreadcrumbs(t: TFunction<'actions'>, backTo: '/actions', actionLabel?: string): PageBreadcrumb[] {
  return [
    { label: t('detail.breadcrumbHistory'), icon: History, to: backTo },
    { label: actionLabel ?? t('detail.fallbackTitle'), icon: Clock },
  ]
}

function DetailSurface({
  children,
  shouldReduceMotion,
  label,
}: {
  children: ReactNode
  shouldReduceMotion: boolean
  label?: string
}) {
  return (
    <motion.section
      aria-label={label}
      initial={{ opacity: 0, transform: shouldReduceMotion ? 'translate3d(0, 0, 0)' : 'translate3d(0, 8px, 0)' }}
      animate={{ opacity: 1, transform: 'translate3d(0, 0, 0)' }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
      className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] shadow-card"
    >
      {children}
    </motion.section>
  )
}

function pillToneForStatus(
  variant: ReturnType<typeof statusVariant>,
): 'neutral' | 'accent' | 'success' | 'warning' | 'danger' {
  switch (variant) {
    case 'success':
      return 'success'
    case 'destructive':
      return 'danger'
    case 'warning':
      return 'warning'
    case 'info':
    case 'primary':
      return 'accent'
    default:
      return 'neutral'
  }
}
