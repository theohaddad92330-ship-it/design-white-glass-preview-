import type { JobTrackingCard } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { RUN_STATUS_TONE_CLASS, runStatusView } from '@/features/accounts/lib/analysisRuns'
import { useCancelAnalysis } from '@/features/accounts/hooks/useCancelAnalysis'
import { notificationDestination } from '@/features/notifications/notification-link'
import { useCancelLauraJob } from '../api'

/**
 * #2147.5 (épopée #2785) — LA CARTE DE SUIVI D'UN JOB EN COURS, DANS
 * « AUJOURD'HUI ».
 *
 * ⚠️ CORRECTIF (26/09 soir) — voir le docblock de `jobTrackingCardSchema`
 * (`@bellum/contracts`) : le job composite de Laura (`kind: 'laura_job'`,
 * #2276) existe déjà, sous ce nom, et porte RÉELLEMENT les cinq champs qu'une
 * analyse de compte (`kind: 'account_analysis'`) ne porte pas. Ce bloc les
 * rend maintenant quand ils sont présents ; `null` reste omis, jamais un zéro
 * ni une valeur devinée (doctrine : « on n'affiche pas ce qu'on n'a pas »).
 *
 * Les deux types de job n'ouvrent ni n'annulent de la même façon : un
 * `account_analysis` ouvre `/accounts/:id` (route typée, `<Link>`) ; un
 * `laura_job` ouvre le fil qui l'a proposé, via la MÊME traduction lien→route
 * qu'une notification (`notificationDestination`, GA-26) — jamais une
 * seconde fois recopiée ici.
 */
export function RunningJobsBlock({ jobs }: { jobs: readonly JobTrackingCard[] | undefined }) {
  const { t } = useTranslation('briefing')
  const navigate = useNavigate()
  const cancelAnalysis = useCancelAnalysis()
  const cancelLauraJob = useCancelLauraJob()

  if (!jobs || jobs.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('runningJobs.empty')}
      </Text>
    )
  }

  return (
    <Box className="flex flex-col gap-2">
      {jobs.map(job => {
        const { label, tone } = runStatusView(job.currentStepLabel)
        const toneClass = RUN_STATUS_TONE_CLASS[tone]
        const isLauraJob = job.kind === 'laura_job'
        // `openHref` est TOUJOURS `/accounts/:id` pour un `account_analysis`
        // (`BriefingService.buildAnalysisRunCards`) — le job ne porte pas
        // d'`accountId` séparé, jamais recopié une seconde fois (GA-26).
        const accountId = !isLauraJob ? (job.openHref.split('/').pop() ?? '') : ''
        // `null` = ce lien ne mène nulle part de connu : aucun geste d'ouverture
        // (même doctrine que `notificationDestination`, jamais une route devinée).
        const lauraJobDestination = isLauraJob ? notificationDestination(job.openHref) : null
        return (
          <Box
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
          >
            <Box className="flex min-w-0 flex-col gap-0.5">
              <Text element="span" size="sm" weight="semibold">
                {job.title}
              </Text>
              <Badge className={`w-fit ${toneClass}`}>{label}</Badge>
              {/* #3666 (Louis 13/10) — les étapes terminées du job, jamais un %. */}
              {job.progressSteps !== null && (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('runningJobs.steps', { count: job.progressSteps.done, total: job.progressSteps.total })}
                </Text>
              )}
              {job.estimatedDurationMinutes !== null && (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('runningJobs.estimatedDuration', { minutes: job.estimatedDurationMinutes })}
                </Text>
              )}
              {job.pendingValidations && job.pendingValidations.length > 0 && (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('runningJobs.pendingValidations', { count: job.pendingValidations.length })}
                </Text>
              )}
              {job.intermediateResults && job.intermediateResults.length > 0 && (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('runningJobs.intermediateResults', { count: job.intermediateResults.length })}
                </Text>
              )}
            </Box>
            <Box display="flex" className="shrink-0 items-center gap-2">
              {isLauraJob ? (
                lauraJobDestination ? (
                  <Button size="sm" variant="ghost" onClick={() => void navigate(lauraJobDestination)}>
                    {t('runningJobs.open')}
                  </Button>
                ) : null
              ) : (
                <Link to="/accounts/$id" params={{ id: accountId }} className="underline">
                  <Text element="span" size="sm">
                    {t('runningJobs.open')}
                  </Text>
                </Link>
              )}
              {job.cancelable ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isLauraJob ? cancelLauraJob.isPending : cancelAnalysis.isPending}
                  onClick={() => (isLauraJob ? cancelLauraJob.mutate(job.id) : cancelAnalysis.mutate(accountId))}
                >
                  {t('runningJobs.cancel')}
                </Button>
              ) : null}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
