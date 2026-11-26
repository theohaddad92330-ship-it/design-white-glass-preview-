import type { Submission } from '@bellum/contracts'
import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, CalendarDays, FileText, History, Mail, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ScreenState } from '@/components/primitives/ScreenState'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { ProposalPlanBlock } from '@/features/proposals/view/ProposalPlanBlock'
import { formatDate } from '@/lib/locale'
import { useSubmission, useSubmissionTimeline } from '../api'
import { presentationState } from '../lib/presentationStates'
import { ConsignInterviewDialog } from './ConsignInterviewDialog'
import { InterviewBriefDialog } from './InterviewBriefDialog'
import { NextActionDialog } from './NextActionDialog'
import { PresentationUpdateDialog } from './PresentationUpdateDialog'
import { SubmissionConsultantFeedbackDialog } from './SubmissionConsultantFeedbackDialog'
import { SubmissionDetailsDialog } from './SubmissionDetailsDialog'
import { SubmissionFeedbackDialog } from './SubmissionFeedbackDialog'
import { SubmissionTimelineDialog } from './SubmissionTimelineDialog'

/**
 * LA PRÉSENTATION — `/submissions/:id` (#2953, #2193.48 ; Théo C projects-presentations R4, N1-N5, A2-A6, HT-6).
 *
 * Une PAGE à blocs (R4) à la place des quatre dialogues : Affaire · Présentation, « Où en est cette
 * présentation ? », la proposition commerciale de l'affaire (le Studio de propositions y est FONDU), les
 * gestes, « Historique et retours ». Les dialogues existants restent les portes du détail — chaque geste de
 * l'ancien panneau (sous-statut, retour client à huit axes, retour consultant, brief d'entretien, prochaine
 * action) reste atteignable d'ici : rien ne se perd.
 *
 * Doctrine tenue : l'envoi n'est JAMAIS une preuve — la trace dit « geste déclaratif, pas une preuve
 * d'envoi » ; une absence reste une absence (accord « À obtenir », tarif « non chiffré », jamais 0) ; le
 * retour du consultant est INTERNE, jamais transmis au client ; la mission n'existe qu'après relecture.
 */
export function SubmissionDossierPage({ submissionId }: { submissionId: string }) {
  const { t } = useTranslation('submissions')
  const { data: submission, isPending, isError, refetch } = useSubmission(submissionId)

  if (isPending) {
    return (
      <CustomerPage pageTitle={t('dossier.loading')}>
        {/* Le titre dit déjà « Chargement… » (en-tête de la coque) : le corps montre l'état, sans le répéter. */}
        <ScreenState state="loading" />
      </CustomerPage>
    )
  }

  if (isError || !submission) {
    return (
      <CustomerPage pageTitle={t('dossier.errorTitle')}>
        <Card className="p-6">
          <Text size="sm">{t('dossier.errorBody')}</Text>
          <Box display="flex" className="mt-3 flex-wrap gap-2">
            <Button size="sm" className="pointer-coarse:min-h-11" onClick={() => void refetch()}>
              {t('dossier.retry')}
            </Button>
            <BackToList />
          </Box>
        </Card>
      </CustomerPage>
    )
  }

  return <Presentation submission={submission} />
}

function Presentation({ submission }: { submission: Submission }) {
  const { t } = useTranslation('submissions')
  const state = presentationState(submission)
  const name = submission.consultantName ?? t('unknownTalent')
  const timeline = useSubmissionTimeline(submission.id)
  const need = useOpenNeeds(
    { id: submission.needId ?? undefined, offset: 0, limit: 1 },
    { enabled: Boolean(submission.needId) },
  )
  const targetCents = need.data?.data?.[0]?.target_tjm_cents ?? null

  const [updating, setUpdating] = useState(false)
  const [consigning, setConsigning] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [briefOpen, setBriefOpen] = useState(false)
  const [nextActionOpen, setNextActionOpen] = useState(false)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [consultantFeedbackOpen, setConsultantFeedbackOpen] = useState(false)

  const sentOn = formatDate(submission.submittedAt, { dateStyle: 'medium' })
  const dueOn = formatDate(submission.nextActionDueAt, { dateStyle: 'medium' })
  const agreedOn = formatDate(submission.consultantAgreementDate, { dateStyle: 'medium' })
  const retainedOn = formatDate(submission.closedAt ?? submission.stageEnteredAt, { dateStyle: 'medium' })
  const rate = submission.proposedRateCents === null ? null : Math.round(submission.proposedRateCents / 100)
  const target = targetCents === null ? null : Math.round(targetCents / 100)

  const subtitle = [submission.needRole ?? submission.projectLabel, submission.accountName].filter(Boolean).join(' · ')

  // Maquette `projects-presentations` (panneau d'une présentation) : le titre, la phrase et
  // « Mettre à jour » vivent dans l'en-tête de la coque ; le corps suit l'ordre de Théo —
  // fil vers l'affaire, bandeau « retenue », panneau « Où en est cette présentation ? »
  // en faits sur quatre colonnes, la rangée de gestes, puis l'historique en journal.
  return (
    <CustomerPage
      pageTitle={name}
      pageSubtitle={subtitle || undefined}
      breadcrumbs={[{ label: t('presentations.title'), to: '/projects/presentations' }, { label: name }]}
      headerActions={
        <Button type="button" className="pointer-coarse:min-h-11" onClick={() => setUpdating(true)}>
          {t('presentations.update.cta')}
        </Button>
      }
    >
      <Box className="flex flex-col gap-5 py-4">
        <BackToList />

        {/* A5 — la conversion en mission : même formulaire que « Créer la mission » de la fiche affaire (une porte, deux entrées). */}
        {state === 'retained' ? (
          <Box
            data-testid="presentation-retained"
            className="flex flex-wrap items-center justify-between gap-3 rounded-r-control border-l-2 border-[var(--success-soft-text)] bg-[var(--bellum-surface-2)] px-4 py-3.5"
          >
            <Box className="min-w-0">
              <Text size="sm" weight="semibold" className="block">
                {t('presentations.retained.title', {
                  account: submission.accountName ?? t('row.noAccount'),
                  date: retainedOn ?? '',
                })}
              </Text>
              <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
                {t('presentations.retained.body')}
              </Text>
            </Box>
            <Button asChild size="sm" className="pointer-coarse:min-h-11">
              <Link to="/missions/nouvelle" search={{ project_id: submission.projectId }}>
                {t('presentations.retained.cta')}
              </Link>
            </Button>
          </Box>
        ) : null}

        <FactsPanel title={t('presentations.where.title')} testId="presentation-where">
          <Fact label={t('dossier.stage')}>
            <Badge variant={state === 'retained' ? 'success' : 'primary'}>{t(`presentations.states.${state}`)}</Badge>
          </Fact>
          {/* A4 — le sous-statut détaillé et le motif de clôture, gardés. */}
          {submission.substatus ? (
            <Fact label={t('dossier.substatus')}>{t(`substatuses.${submission.substatus}`)}</Fact>
          ) : null}
          {submission.outcomeReason ? (
            <Fact label={t('presentations.blocks.reason')} note={submission.outcomeDetail ?? undefined}>
              {t(`reasons.${submission.outcomeReason}`)}
            </Fact>
          ) : null}
          <Fact label={t('presentations.where.sentOn')}>
            {sentOn ?? <UnknownValue reason={t('dossier.submittedAtUnknown')} />}
          </Fact>
          <Fact label={t('presentations.columns.channel').split(' / ')[0] ?? ''}>
            {submission.channel ? t(`details.channels.${submission.channel}`) : t('presentations.row.channelUnknown')}
          </Fact>
          <Fact label={t('presentations.where.owner')}>{submission.ownerName ?? t('presentations.where.noOwner')}</Fact>
          <Fact
            label={t('presentations.where.expected')}
            note={dueOn ? (submission.nextActionLabel ?? undefined) : undefined}
          >
            {dueOn ?? t('presentations.row.dueUnknown')}
          </Fact>
          {/* N1 — l'accord à présenter, daté ; absent = « à obtenir », jamais deviné. */}
          <Fact label={t('presentations.where.agreement')}>
            {submission.consultantAgreement === true
              ? t('presentations.where.agreementYes', { date: agreedOn ?? '' })
              : submission.consultantAgreement === false
                ? t('presentations.where.agreementNo', { date: agreedOn ?? '' })
                : t('presentations.where.agreementToGet')}
          </Fact>
          {/* R5 / D-4 — une consignation est un geste DÉCLARATIF, jamais une preuve d'envoi. */}
          <Fact label={t('presentations.where.trace')}>
            {sentOn
              ? t('presentations.where.traceRecorded', {
                  owner: submission.ownerName ?? t('presentations.where.noOwner'),
                })
              : t('presentations.row.noSend')}
          </Fact>
          {/* N2 — la version du dossier de compétences figée pour cette présentation. */}
          <Fact label={t('presentations.where.dossier')}>
            {submission.cvSnapshot ? t('presentations.where.dossierFrozen') : t('presentations.where.dossierToPrepare')}
          </Fact>
          {/* A6 — le tarif proposé et son écart à la cible du client. Un tarif absent n'est pas 0. */}
          <Fact
            label={t('presentations.where.rate')}
            note={
              rate !== null && target !== null
                ? `${t('presentations.where.rateTarget', { target })} · ${t('presentations.where.rateGap', { gap: `${rate - target > 0 ? '+' : ''}${rate - target}` })}`
                : undefined
            }
          >
            {rate === null ? t('noRate') : t('presentations.where.rateValue', { value: rate })}
          </Fact>
        </FactsPanel>

        {/* `.bo11-button-group` — le dossier en aplat doux, les autres gestes en contour. */}
        <Box data-testid="presentation-actions" className="flex flex-wrap items-center gap-2">
          <Button asChild variant="soft" className="pointer-coarse:min-h-11 max-md:w-full">
            <Link to="/consultants/$id" params={{ id: submission.consultantId }}>
              <FileText className="size-4" aria-hidden />
              {t('presentations.actions.dossier')}
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            icon={Mail}
            className="pointer-coarse:min-h-11 max-md:w-full"
            onClick={() => setDetailsOpen(true)}
          >
            {t('presentations.actions.message')}
          </Button>
          {/* PRES.A3 — le brief d'entretien n'apparaît qu'à l'étape « Entretien client ». */}
          {state === 'client_interview' ? (
            <Button
              type="button"
              variant="outline"
              icon={Sparkles}
              className="pointer-coarse:min-h-11 max-md:w-full"
              onClick={() => setBriefOpen(true)}
            >
              {t('presentations.actions.brief')}
            </Button>
          ) : null}
          {state !== 'preselection' && state !== 'to_present' ? (
            <Button
              type="button"
              variant="outline"
              icon={CalendarDays}
              className="pointer-coarse:min-h-11 max-md:w-full"
              onClick={() => setConsigning(true)}
            >
              {t('presentations.actions.consign')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            className="pointer-coarse:min-h-11 max-md:w-full"
            onClick={() => setNextActionOpen(true)}
          >
            {t('presentations.actions.expected')}
          </Button>
        </Box>

        {/* Gardé hors maquette : l'affaire, le besoin, le client et le consultant, en faits. */}
        <FactsPanel title={t('presentations.blocks.deal')} testId="presentation-deal">
          <Fact label={t('dossier.project')}>
            {submission.projectLabel ? (
              <Link to="/projects/$id" params={{ id: submission.projectId }} className="hover:underline">
                {submission.projectLabel}
              </Link>
            ) : (
              <UnknownValue reason={t('dossier.projectUnknown')} />
            )}
          </Fact>
          <Fact label={t('dossier.need')}>
            {submission.needRole ?? <UnknownValue reason={t('dossier.needUnknown')} />}
          </Fact>
          {submission.accountName && submission.accountId ? (
            <Fact label={t('presentations.blocks.client')}>
              <Link to="/accounts/$id" params={{ id: submission.accountId }} className="hover:underline">
                {submission.accountName}
              </Link>
            </Fact>
          ) : null}
          <Fact label={t('dossier.consultant')}>
            <Link to="/consultants/$id" params={{ id: submission.consultantId }} className="hover:underline">
              {name}
            </Link>
          </Fact>
        </FactsPanel>

        <ProposalPlanBlock projectId={submission.projectId} accountId={submission.accountId} />

        <section
          aria-labelledby="presentation-history-title"
          className="rounded-card border border-[var(--bellum-border)] bg-card p-5 md:p-6"
        >
          <Box className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <Text id="presentation-history-title" element="h2" size="base" weight="semibold">
              {t('presentations.history.title')}
            </Text>
            <Box className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setTimelineOpen(true)}
              >
                {t('timeline.open')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setFeedbackOpen(true)}
              >
                {t('feedback.open')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setConsultantFeedbackOpen(true)}
              >
                {t('consultantFeedback.open')}
              </Button>
            </Box>
          </Box>
          {timeline.isError ? (
            <Text size="sm" color="text-muted-foreground">
              {t('states.error')}
            </Text>
          ) : !timeline.data?.length ? (
            <Text size="sm" color="text-muted-foreground">
              {t('timeline.empty')}
            </Text>
          ) : (
            <ul>
              {timeline.data?.map((event, index) => (
                <li
                  key={`${event.occurredAt}-${index}`}
                  className="flex gap-3 border-b border-[var(--bellum-border)] py-3 last:border-b-0"
                >
                  <History className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                  <Box>
                    <Text size="sm" weight="semibold" className="block">
                      {event.subject ?? t('timeline.unnamedStep')}
                    </Text>
                    <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                      {formatDate(event.occurredAt, { dateStyle: 'medium' }) ?? t('timeline.unknownDate')}
                    </Text>
                  </Box>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Box>

      <PresentationUpdateDialog submission={submission} open={updating} onClose={() => setUpdating(false)} />
      <ConsignInterviewDialog
        submissionId={submission.id}
        talentName={name}
        open={consigning}
        onClose={() => setConsigning(false)}
      />
      <SubmissionDetailsDialog submission={submission} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <InterviewBriefDialog
        open={briefOpen}
        submissionId={submission.id}
        consultantId={submission.consultantId}
        projectId={submission.projectId}
        consultantName={name}
        onClose={() => setBriefOpen(false)}
      />
      <NextActionDialog submission={submission} open={nextActionOpen} onClose={() => setNextActionOpen(false)} />
      <SubmissionTimelineDialog
        submissionId={submission.id}
        talentName={name}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
      <SubmissionFeedbackDialog
        submissionId={submission.id}
        talentName={name}
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
      <SubmissionConsultantFeedbackDialog
        submissionId={submission.id}
        talentName={name}
        open={consultantFeedbackOpen}
        onClose={() => setConsultantFeedbackOpen(false)}
      />
    </CustomerPage>
  )
}

function BackToList() {
  const { t } = useTranslation('submissions')
  return (
    <Link to="/projects/presentations" className="inline-flex min-h-11 items-center gap-1 text-sm hover:underline">
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('presentations.back')}
    </Link>
  )
}

/** `.bo11-panel` — une carte titrée dont le corps est une grille de faits, colonnes mesurées au conteneur (GA-373). */
function FactsPanel({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section data-testid={testId} className="rounded-card border border-[var(--bellum-border)] bg-card p-5 md:p-6">
      <Text element="h2" size="base" weight="semibold" className="mb-4 block">
        {title}
      </Text>
      <dl className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">{children}</dl>
    </section>
  )
}

/** `.bo11-fact` — l'étiquette discrète, la valeur, et au besoin une précision sous la valeur. */
function Fact({ label, note, children }: { label: string; note?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1.5 text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="text-sm font-medium leading-snug">{children}</dd>
      {note ? <dd className="mt-1 text-xs text-[var(--bellum-text-muted)]">{note}</dd> : null}
    </div>
  )
}
