import type { Submission, SubmissionOutcomeReason, SubmissionStage, SubmissionSubstatus } from '@bellum/contracts'
import { SUBMISSION_OUTCOME_REASONS, SUBSTATUS_TO_STAGE, canTransition, nextSubstatuses } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useAdvanceSubmission, useAdvanceSubstatus, useSubmissions } from '../api'
import { InterviewBriefDialog } from './InterviewBriefDialog'
import { NextActionDialog } from './NextActionDialog'
import { ScheduleInterviewDialog } from './ScheduleInterviewDialog'
import { SubmissionConsultantFeedbackDialog } from './SubmissionConsultantFeedbackDialog'
import { SubmissionDetailsDialog } from './SubmissionDetailsDialog'
import { SubmissionFeedbackDialog } from './SubmissionFeedbackDialog'
import { SubmissionTimelineDialog } from './SubmissionTimelineDialog'

const STAGE_VARIANT: Partial<Record<SubmissionStage, 'default' | 'success' | 'warning' | 'secondary'>> = {
  shortlisted: 'secondary',
  submitted: 'default',
  interview: 'warning',
  accepted: 'success',
  rejected: 'secondary',
  withdrawn: 'secondary',
}

/**
 * Les PROFILS POSITIONNÉS sur un projet.
 *
 * Deux choses que l'écran refuse de faire :
 *
 *  - **proposer une transition impossible.** Les boutons affichés sont ceux que
 *    la machine du contrat autorise depuis l'étape courante ; en montrer
 *    d'autres ferait cliquer sur un refus.
 *  - **clore sans motif.** Une clôture demande sa raison, parce que « pourquoi
 *    perd-on ? » ne se répond qu'en agrégeant des motifs comparables — et parce
 *    que « sans retour » est un motif à part entière, le plus fréquent, que la
 *    plupart des outils forcent à ranger dans « refusé ».
 */
export function SubmissionsPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation('submissions')
  const { data, isLoading, isError } = useSubmissions({ projectId })
  const advance = useAdvanceSubmission()
  // #2177.11 / .12 / .13 / .15 / .21 — avancer le SOUS-statut, séparément de l'étape.
  const advanceSubstatus = useAdvanceSubstatus()
  const [closing, setClosing] = useState<{ id: string; needId: string | null; stage: SubmissionStage } | null>(null)

  if (isLoading) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  }
  if (isError) {
    // Un échec de lecture ne se rend jamais comme « aucun profil » : c'est la
    // faute trouvée en production le 17/08 sur les notes.
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('states.loadError')}
        </Text>
      </Box>
    )
  }

  const items = data?.items ?? []
  const funnel = data?.funnel

  return (
    <Box className="space-y-3">
      <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-1">
        <Text element="span" size="sm" weight="medium">
          {t('title')}
        </Text>
        {funnel ? (
          <>
            <Text element="span" size="xs" color="text-muted-foreground">
              {t('funnel.submitted', { count: funnel.submitted })}
            </Text>
            <Text element="span" size="xs" color="text-muted-foreground">
              {/* `null` et non « 0 % » : trois profils envoyés ce mois-ci ne
                  doivent pas se lire « 0 % de succès » mais « pas encore
                  mesurable ». */}
              {funnel.acceptanceRate === null
                ? t('funnel.rateUnknown')
                : t('funnel.rate', { value: Math.round(funnel.acceptanceRate * 100) })}
            </Text>
            <Text element="span" size="xs" color="text-muted-foreground">
              {/* Le délai médian était CALCULÉ depuis toujours et n'atteignait
                  aucun écran — la borne du 26/08 (cinq retours minimum) ne
                  protégeait donc rien. Sous le plancher, on le DIT : un blanc,
                  un tiret ou un « 0 » se liraient « le client répond tout de
                  suite », qui est l'inverse de ce qu'on sait. */}
              {funnel.medianDaysToFeedback === null
                ? t('funnel.medianUnknown')
                : t('funnel.median', { count: funnel.medianDaysToFeedback })}
            </Text>
            {funnel.noFeedback > 0 ? (
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('funnel.noFeedback', { count: funnel.noFeedback })}
              </Text>
            ) : null}
          </>
        ) : null}
      </Box>

      {items.length === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" color="text-muted-foreground">
            {t('states.empty')}
          </Text>
        </Box>
      ) : (
        <Box className="space-y-2">
          {items.map(submission => (
            <SubmissionRow
              key={submission.id}
              submission={submission}
              pending={advance.isPending}
              onAdvance={stage => {
                if (stage === 'accepted' || stage === 'rejected' || stage === 'withdrawn') {
                  setClosing({ id: submission.id, needId: submission.needId, stage })
                  return
                }
                advance.mutate({ id: submission.id, stage })
              }}
              substatusPending={advanceSubstatus.isPending}
              onAdvanceSubstatus={substatus => advanceSubstatus.mutate({ id: submission.id, substatus })}
            />
          ))}
        </Box>
      )}

      {closing ? (
        <CloseReasonPicker
          stage={closing.stage}
          onCancel={() => setClosing(null)}
          onPick={reason => {
            advance.mutate(
              { id: closing.id, needId: closing.needId, stage: closing.stage, outcomeReason: reason },
              { onSuccess: () => setClosing(null) },
            )
          }}
        />
      ) : null}
    </Box>
  )
}

function SubmissionRow({
  submission,
  onAdvance,
  pending,
  onAdvanceSubstatus,
  substatusPending,
}: {
  submission: Submission
  onAdvance: (stage: SubmissionStage) => void
  pending: boolean
  onAdvanceSubstatus: (substatus: SubmissionSubstatus) => void
  substatusPending: boolean
}) {
  const { t } = useTranslation('submissions')
  // Le retour du client n'a de sens qu'une fois le profil PRÉSENTÉ : le
  // proposer avant ferait noter un retour qui n'a pas eu lieu.
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const canRecordFeedback = submission.stage !== 'shortlisted'
  // #2335.5 — le retour CONSULTANT a sa propre porte, son propre dialogue,
  // jamais celui du retour client juste au-dessus.
  const [consultantFeedbackOpen, setConsultantFeedbackOpen] = useState(false)
  // #2173.41 — même garde qu'un retour client : planifier un entretien avant
  // que le CV soit parti ferait poser un rendez-vous sur un profil que le
  // client n'a pas encore vu.
  const [interviewOpen, setInterviewOpen] = useState(false)
  const canScheduleInterview = submission.stage !== 'shortlisted'
  // #2335.3 — chaque étape avec sa date, ouverte depuis la fiche.
  const [timelineOpen, setTimelineOpen] = useState(false)
  // #2177.6 / .8 / .24 / .25 / .28 / .30 — le détail, ouvert depuis la fiche.
  const [detailsOpen, setDetailsOpen] = useState(false)
  // #2189.23-.30 (épopée #2940) — le brief d'entretien, séparé de l'entretien
  // planifié et du brief de soutenance.
  const [interviewBriefOpen, setInterviewBriefOpen] = useState(false)
  // #2189.39 — la prochaine action de CE positionnement, toujours datée et attribuée.
  const [nextActionOpen, setNextActionOpen] = useState(false)
  // Seules les transitions AUTORISÉES depuis l'étape courante : proposer les
  // autres ferait cliquer sur un refus.
  const next = (['submitted', 'interview', 'accepted', 'rejected', 'withdrawn'] as SubmissionStage[]).filter(stage =>
    canTransition(submission.stage, stage),
  )
  // #2177.11 / .12 / .13 / .15 / .21 — les cibles de sous-statut ATTEIGNABLES
  // depuis le sous-statut courant, cantonnées à la MÊME étape : une cible qui
  // retomberait sur une autre étape ferait mentir le badge d'étape à côté.
  const nextSubs = submission.substatus
    ? nextSubstatuses(submission.substatus).filter(
        target => SUBSTATUS_TO_STAGE[target] === SUBSTATUS_TO_STAGE[submission.substatus as SubmissionSubstatus],
      )
    : []

  return (
    <Box className="rounded-md border border-border bg-card p-3">
      <Box display="flex" className="flex-wrap items-center justify-between gap-2">
        <Box display="flex" className="min-w-0 items-center gap-2">
          <Text element="span" size="sm" weight="medium" className="truncate">
            {submission.consultantName ?? t('unknownTalent')}
          </Text>
          <Badge variant={STAGE_VARIANT[submission.stage] ?? 'default'}>{t(`stages.${submission.stage}`)}</Badge>
          {/* #2335.1 — le niveau de détail EN PLUS de `stage`. `null` sur une
              ligne créée avant #2335 : rien ne s'affiche, jamais deviné. */}
          {submission.substatus ? <Badge variant="outline">{t(`substatuses.${submission.substatus}`)}</Badge> : null}
          {submission.needRole ? (
            <Text element="span" size="xs" color="text-muted-foreground">
              {submission.needRole}
            </Text>
          ) : null}
        </Box>
        <Text element="span" size="xs" color="text-muted-foreground">
          {/* Un TJM absent n'est PAS 0 € : il n'a pas été chiffré. */}
          {submission.proposedRateCents === null
            ? t('noRate')
            : t('rate', { value: Math.round(submission.proposedRateCents / 100) })}
        </Text>
      </Box>

      {submission.outcomeReason ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {t(`reasons.${submission.outcomeReason}`)}
        </Text>
      ) : null}

      {/* #2189.39 — une absence ne fait AUCUNE ligne : rien ne s'affiche tant
          qu'aucune prochaine action n'a été posée. */}
      {submission.nextActionLabel ? (
        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
          {submission.nextActionLabel}
          {submission.nextActionDueAt ? ` — ${formatDate(submission.nextActionDueAt) ?? ''}` : ''}
          {submission.nextActionOwnerName ? ` (${submission.nextActionOwnerName})` : ''}
        </Text>
      ) : null}

      {/* #2335.3 — le bouton Historique est TOUJOURS proposé : une fiche à
          l'étape « à qualifier » a déjà au moins sa création tracée. Les
          autres boutons restent conditionnés à ce que la machine autorise. */}
      <Box display="flex" className="mt-2 flex-wrap gap-1">
        {next.map(stage => (
          <Button key={stage} variant="ghost" size="sm" disabled={pending} onClick={() => onAdvance(stage)}>
            {t(`actions.${stage}`)}
          </Button>
        ))}
        {/* #2177.11 / .12 / .13 / .15 / .21 — les seize sous-statuts
            existaient déjà (#2335.1), affichés en badge, mais rien ne les
            faisait avancer manuellement une fois posés par défaut. */}
        {nextSubs.map(target => (
          <Button
            key={target}
            variant="outline"
            size="sm"
            disabled={substatusPending}
            onClick={() => onAdvanceSubstatus(target)}
          >
            {t(`substatuses.${target}`)}
          </Button>
        ))}
        {/* #2173.41 — le contrat (`scheduleInterviewSchema`), la route et le
              hook web (`useScheduleInterview`) existaient depuis le chantier
              ATS — et n'avaient AUCUN appelant. Voir `ScheduleInterviewDialog`. */}
        {canScheduleInterview ? (
          <Button variant="ghost" size="sm" onClick={() => setInterviewOpen(true)}>
            {t('interview.open')}
          </Button>
        ) : null}
        {/* Le retour du client sur ce profil. Les quatre axes, la table, le
              service et la route existaient depuis le chantier ATS — et les
              hooks web n'avaient AUCUN appelant. */}
        {canRecordFeedback ? (
          <Button variant="ghost" size="sm" onClick={() => setFeedbackOpen(true)}>
            {t('feedback.open')}
          </Button>
        ) : null}
        {/* #2335.5 — bouton SÉPARÉ du retour client juste au-dessus : les
              deux blocs ne se mélangent jamais, ni en base ni à l'écran. */}
        {canRecordFeedback ? (
          <Button variant="ghost" size="sm" onClick={() => setConsultantFeedbackOpen(true)}>
            {t('consultantFeedback.open')}
          </Button>
        ) : null}
        {/* #2335.3 — chaque étape avec sa date, la fiche d'UN positionnement. */}
        <Button variant="ghost" size="sm" onClick={() => setTimelineOpen(true)}>
          {t('timeline.open')}
        </Button>
        {/* #2177.6 / .8 / .24 / .25 / .28 / .30 — destinataire, canal, message
            préparé, disponibilité, conditions : toujours proposé, quelle que
            soit l'étape, comme l'Historique juste au-dessus. */}
        <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
          {t('details.open')}
        </Button>
        {/* #2189.23-.30 (épopée #2940) — toujours proposé, comme Historique et
            Détails juste au-dessus : préparer une rencontre ne dépend pas de l'étape. */}
        <Button variant="ghost" size="sm" onClick={() => setInterviewBriefOpen(true)}>
          {t('interviewBrief.open')}
        </Button>
        {/* #2189.39 — toujours proposé, comme Historique juste au-dessus. */}
        <Button variant="ghost" size="sm" onClick={() => setNextActionOpen(true)}>
          {t('nextAction.open')}
        </Button>
      </Box>

      <SubmissionFeedbackDialog
        submissionId={submission.id}
        talentName={submission.consultantName ?? t('unknownTalent')}
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
      />
      <SubmissionConsultantFeedbackDialog
        submissionId={submission.id}
        talentName={submission.consultantName ?? t('unknownTalent')}
        open={consultantFeedbackOpen}
        onClose={() => setConsultantFeedbackOpen(false)}
      />
      <ScheduleInterviewDialog
        submissionId={submission.id}
        talentName={submission.consultantName ?? t('unknownTalent')}
        open={interviewOpen}
        onClose={() => setInterviewOpen(false)}
      />
      <SubmissionTimelineDialog
        submissionId={submission.id}
        talentName={submission.consultantName ?? t('unknownTalent')}
        open={timelineOpen}
        onClose={() => setTimelineOpen(false)}
      />
      <SubmissionDetailsDialog submission={submission} open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <InterviewBriefDialog
        submissionId={submission.id}
        consultantId={submission.consultantId}
        projectId={submission.projectId}
        consultantName={submission.consultantName ?? t('unknownTalent')}
        open={interviewBriefOpen}
        onClose={() => setInterviewBriefOpen(false)}
      />
      <NextActionDialog submission={submission} open={nextActionOpen} onClose={() => setNextActionOpen(false)} />
    </Box>
  )
}

/** Une clôture demande son motif — sinon « pourquoi perd-on ? » reste sans réponse. */
function CloseReasonPicker({
  stage,
  onPick,
  onCancel,
}: {
  stage: SubmissionStage
  onPick: (reason: SubmissionOutcomeReason) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('submissions')
  return (
    <Box className="rounded-md border border-border bg-[var(--bellum-surface-2)] p-3">
      <Text element="p" size="xs" weight="medium">
        {t('close.title', { stage: t(`stages.${stage}`) })}
      </Text>
      <Box display="flex" className="mt-2 flex-wrap gap-1">
        {SUBMISSION_OUTCOME_REASONS.map(reason => (
          <Button key={reason} variant="outline" size="sm" onClick={() => onPick(reason)}>
            {t(`reasons.${reason}`)}
          </Button>
        ))}
      </Box>
      <Button variant="ghost" size="sm" className="mt-1" onClick={onCancel}>
        {t('common:actions.cancel')}
      </Button>
    </Box>
  )
}
