import {
  PROJECT_STAGES,
  type ManagerMemberStats,
  type ManagerPipelineReview,
  type PipeInspectionRow,
} from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FilterChips,
  Input,
  SelectField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePipeInspection } from '@/features/pilotage/pipe/api'
import { useUpdateCloseDate } from '@/features/projects/hooks/useUpdateProjectForecast'
import { useUpdateProjectOwner } from '@/features/projects/hooks/useUpdateProjectOwner'
import { formatCents } from '@/lib/money'

const KNOWN_STAGES: readonly string[] = PROJECT_STAGES

/** Théo `t8-stage-pill stage-0…3` — la pastille d'étape est teintée, de l'amont vers la décision. */
const STAGE_TONES: Record<string, string> = {
  detected: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
  potential: 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
  confirmed: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  qualified: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  profiles_submitted: 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
  negotiation: 'border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
}
const NEUTRAL_TONE = STAGE_TONES.detected

const PANEL = 'rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6'
const LINK = 'inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline'

/**
 * Objectifs & affaires › Revue des affaires — Théo D team-business (`t8-panel` « Faire avancer
 * les affaires, une décision à la fois. »). LES MÊMES affaires que Pilotage › Pipe : la ligne
 * vient de `/pilotage/pipe/inspection` (jamais une seconde lecture), et la raison d'agir vient
 * de la revue de pipeline du serveur (`pipeline_review`) — sans prochaine étape, sans activité,
 * bloquée dans son étape. Aucune probabilité de signature, aucun pondéré.
 *
 * « Revoir » ouvre la suite de l'affaire : la décision visée (date de signature prévue) et le
 * responsable, écrits par les MÊMES portes que la fiche et le pipe (`useUpdateCloseDate`,
 * `useUpdateProjectOwner`). Rien ne part sans « Enregistrer la suite ».
 *
 * Aucune affaire ouverte : l'état vide le dit en une phrase, jamais « 0 affaire · 0 € ».
 */
export function TeamDealsReview({
  review,
  members,
}: {
  review: ManagerPipelineReview | undefined
  members: ManagerMemberStats[]
}) {
  const { t } = useTranslation('manager')
  const { t: tProjects } = useTranslation('projects')
  const { data, isLoading, isError } = usePipeInspection()
  const [stages, setStages] = useState<string[]>([])

  const rows = data?.rows ?? []
  const reasonsById = useMemo(
    () => new Map((review?.items ?? []).map(item => [item.opportunity_id, item.reasons])),
    [review],
  )
  const stageLabel = (stage: string) => (KNOWN_STAGES.includes(stage) ? tProjects(`stage.states.${stage}`) : stage)
  const present = KNOWN_STAGES.filter(stage => rows.some(row => row.stage === stage))
  const shown = stages.length === 0 ? rows : rows.filter(row => stages.includes(row.stage))
  const amounts = shown.map(row => row.amountCents).filter((cents): cents is number => cents !== null)
  const total = amounts.reduce((sum, cents) => sum + cents, 0)

  return (
    <section aria-labelledby="team-deals-title" data-board-block="pipeline-review" className={`${PANEL} space-y-4`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2 id="team-deals-title" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
            {t('board.deals.title')}
          </h2>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.deals.subtitle')}
          </Text>
        </div>
        <Link
          to="/pilotage/pipe"
          className="inline-flex min-h-11 shrink-0 items-center rounded-control border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-row-hover)]"
        >
          {t('board.deals.fullPipe')}
        </Link>
      </div>

      {isLoading ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('states.loading')}
        </Text>
      ) : isError ? (
        <Text size="sm" role="alert" className="text-[var(--bellum-text-secondary)]">
          {t('board.deals.loadError')}
        </Text>
      ) : rows.length === 0 ? (
        <Text size="sm" data-testid="team-deals-empty" className="text-[var(--bellum-text-secondary)]">
          {t('board.deals.empty')}
        </Text>
      ) : (
        <>
          <div data-testid="team-deals-toolbar" className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <FilterChips
              multiple
              size="sm"
              ariaLabel={t('board.deals.stageFilter')}
              options={present.map(stage => ({
                value: stage,
                label: stageLabel(stage),
                count: rows.filter(row => row.stage === stage).length,
              }))}
              values={stages}
              onToggle={value =>
                setStages(prev => (prev.includes(value) ? prev.filter(stage => stage !== value) : [...prev, value]))
              }
            />
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {amounts.length > 0
                ? t('board.deals.count', { count: shown.length, amount: formatCents(total) })
                : t('board.deals.countNoAmount', { count: shown.length })}
            </Text>
            <AmountsHelp />
          </div>

          <div className="overflow-x-auto overscroll-x-contain">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  {(['deal', 'owner', 'stage', 'amount', 'next', 'actions'] as const).map(column => (
                    <TableHead
                      key={column}
                      className={column === 'amount' ? 'text-right' : undefined}
                      aria-label={column === 'actions' ? t('board.deals.columns.actions') : undefined}
                    >
                      {column === 'actions' ? null : t(`board.deals.columns.${column}`)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(row => (
                  <DealRow
                    key={row.id}
                    row={row}
                    reasons={reasonsById.get(row.id) ?? []}
                    review={review}
                    members={members}
                    stageLabel={stageLabel(row.stage)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('board.deals.footnote')}
          </Text>
        </>
      )}
    </section>
  )
}

function DealRow({
  row,
  reasons,
  review,
  members,
  stageLabel,
}: {
  row: PipeInspectionRow
  reasons: readonly string[]
  review: ManagerPipelineReview | undefined
  members: ManagerMemberStats[]
  stageLabel: string
}) {
  const { t, i18n } = useTranslation('manager')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const reasonLabel = (reason: string) =>
    t(`board.pipelineReview.reasons.${reason}`, {
      days: reason === 'stuck' ? review?.stuck_days : review?.inactivity_days,
    })
  const closeOn = row.expectedCloseOn
    ? new Date(`${row.expectedCloseOn.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : null

  return (
    <TableRow data-deal={row.id}>
      <TableCell>
        <Link
          to="/projects/$id"
          params={{ id: row.id }}
          className="block min-h-11 py-1 font-medium text-[var(--bellum-text-primary)] hover:underline"
        >
          {row.label}
          <span className="block text-xs font-normal text-[var(--bellum-text-secondary)]">{row.accountName}</span>
        </Link>
      </TableCell>
      <TableCell>
        {row.ownerName ? (
          <span className="inline-flex items-center gap-2 text-sm text-[var(--bellum-text-primary)]">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
            >
              {row.ownerName.charAt(0).toUpperCase()}
            </span>
            {row.ownerName}
          </span>
        ) : (
          <span className="text-sm text-[var(--bellum-text-muted)]">{t('board.pipelineReview.noOwner')}</span>
        )}
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex min-h-6 items-center rounded-badge border px-2 text-xs font-medium ${STAGE_TONES[row.stage] ?? NEUTRAL_TONE}`}
        >
          {stageLabel}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {row.amountCents === null ? (
          <span className="text-sm text-[var(--bellum-text-muted)]">{t('board.deals.noAmount')}</span>
        ) : (
          <span className="text-sm font-semibold text-[var(--bellum-text-primary)]">
            {formatCents(row.amountCents)}
          </span>
        )}
      </TableCell>
      <TableCell>
        {reasons.length > 0 ? (
          <strong className="block text-sm font-medium text-[var(--warning-soft-text)]">
            {reasons.map(reasonLabel).join(' · ')}
          </strong>
        ) : null}
        <span className="block text-xs text-[var(--bellum-text-secondary)]">
          {closeOn ? t('board.deals.targetDate', { date: closeOn }) : t('board.deals.noTargetDate')}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <ReviewDealDialog row={row} members={members} />
      </TableCell>
    </TableRow>
  )
}

/** « Revoir » — la décision visée et le responsable de l'affaire, écrits par les portes existantes. */
function ReviewDealDialog({ row, members }: { row: PipeInspectionRow; members: ManagerMemberStats[] }) {
  const { t } = useTranslation(['manager', 'common'])
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(row.expectedCloseOn?.slice(0, 10) ?? '')
  const [owner, setOwner] = useState(row.ownerId ?? '')
  const closeDate = useUpdateCloseDate()
  const setProjectOwner = useUpdateProjectOwner()
  const pending = closeDate.isPending || setProjectOwner.isPending
  const failed = closeDate.isError || setProjectOwner.isError

  const save = async () => {
    const writes: Promise<unknown>[] = []
    if (date !== (row.expectedCloseOn?.slice(0, 10) ?? '')) {
      writes.push(closeDate.mutateAsync({ id: row.id, date: date || null }))
    }
    if (owner !== (row.ownerId ?? '')) {
      writes.push(setProjectOwner.mutateAsync({ id: row.id, ownerId: owner || null }))
    }
    try {
      await Promise.all(writes)
      setOpen(false)
    } catch {
      // L'erreur reste affichée dans la fenêtre : rien n'est fermé sur un échec.
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11">
          {t('manager:board.deals.review')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manager:board.deals.reviewTitle')}</DialogTitle>
          <DialogDescription>{`${row.label} · ${row.accountName}`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('manager:board.deals.targetDateLabel')}
            </span>
            <Input type="date" value={date} onChange={event => setDate(event.target.value)} />
          </label>
          <div className="space-y-1">
            <span className="block text-sm font-medium text-[var(--bellum-text-primary)]">
              {t('manager:board.deals.ownerLabel')}
            </span>
            <SelectField
              value={owner}
              ariaLabel={t('manager:board.deals.ownerLabel')}
              options={[
                { value: '', label: t('manager:board.pipelineReview.noOwner') },
                ...members.map(member => ({ value: member.user_id, label: member.name })),
              ]}
              onChange={setOwner}
            />
          </div>
          <Link to="/accounts/$id" params={{ id: row.accountId }} className={LINK}>
            {t('manager:board.deals.accountPlan', { company: row.accountName })}
          </Link>
          {failed ? (
            <Text size="sm" role="alert" className="text-[var(--danger-soft-text)]">
              {t('manager:board.deals.saveError')}
            </Text>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={pending}>
            {t('manager:board.deals.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Comprendre les montants » — ce que les montants sont, et ce qu'ils ne sont pas. */
function AmountsHelp() {
  const { t } = useTranslation(['manager', 'common'])
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="min-h-11">
          {t('manager:board.deals.amountsHelp')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('manager:board.deals.amountsTitle')}</DialogTitle>
          <DialogDescription>{t('manager:board.deals.amountsBody')}</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
