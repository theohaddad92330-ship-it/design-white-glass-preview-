import { Box, Button, Spinner, Text } from '@bellum/ui'
import type { ConnectedTool, IntegrationSyncRun } from '@bellum/contracts'
import { isSyncRunTerminal } from '@bellum/contracts'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { integrationCenterApi } from '../api'
import { nextPollDelayMs, waitingMinutes } from '../lib/sync-poll'
import { SYNC_RUN_STEPS, syncRunStateLabelKey } from '../lib/sync-run-state-labels'
import { SyncLaunchPreview } from './SyncLaunchPreview'
import { SyncSummary } from './SyncSummary'

type Phase = 'preview' | 'running' | 'summary' | 'canceled' | 'error'

/**
 * Le déclenchement, l'attente et le résumé d'une première synchronisation
 * (#3014, job réel BullMQ depuis l'épopée #2980) — le mécanisme derrière le
 * CTA (#2207.19) et l'écran de prévisualisation (#2207.20 à #2207.24).
 *
 * `startSync` répond dès l'écriture du run côté serveur, donc l'écran passe
 * directement de la prévisualisation à l'attente — mais le run traverse
 * ensuite plusieurs états intermédiaires (`SYNC_RUN_STATUSES`, jamais un seul
 * `running`) pendant que le worker avance réellement : `isSyncRunTerminal`
 * est la SEULE question que cet écran se pose, jamais un statut nommé en dur.
 */
export function SyncLaunchFlow({
  provider,
  name,
  tool,
  onClose,
}: {
  provider: string
  name: string
  tool?: ConnectedTool
  onClose: () => void
}) {
  const { t, i18n } = useTranslation('integrationCenter')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('preview')
  const [run, setRun] = useState<IntegrationSyncRun | null>(null)
  const [launching, setLaunching] = useState(false)
  const [canceling, setCanceling] = useState(false)
  // #4591 — un sondage qui échoue (429, réseau…) ne fige pas l'écran : on le DIT et on réessaie, en reculant.
  const [pollFailed, setPollFailed] = useState(false)
  // Évite de continuer à poller un composant démonté (l'utilisateur a fermé
  // l'écran pendant l'attente) — le run continue côté serveur, l'écran arrête
  // juste de le regarder.
  const cancelledRef = useRef(false)
  useEffect(
    () => () => {
      cancelledRef.current = true
    },
    [],
  )

  const launch = async () => {
    setLaunching(true)
    try {
      const started = await integrationCenterApi.startSync(provider)
      if (cancelledRef.current) return
      setRun(started)
      setPhase('running')
    } catch {
      toast.error(t('syncSummary.errorTitle'))
    } finally {
      if (!cancelledRef.current) setLaunching(false)
    }
  }

  // #4591 — l'effet dépend de l'IDENTIFIANT du run, pas de l'objet : chaque réponse remplace `run`, et relancer
  // l'effet à chaque réponse faisait un sondage en rafale (donc le 429 de la porte de débit).
  const runId = run?.id
  useEffect(() => {
    if (phase !== 'running' || !runId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    const later = () => {
      timer = setTimeout(() => void poll(), nextPollDelayMs(attempt))
      attempt += 1
    }
    const poll = async () => {
      if (cancelledRef.current) return
      try {
        const next = await integrationCenterApi.syncRun(provider, runId)
        if (cancelledRef.current) return
        setPollFailed(false)
        if (!isSyncRunTerminal(next.status)) {
          setRun(next)
          later()
          return
        }
        setRun(next)
        if (next.status === 'completed' || next.status === 'partial') {
          setPhase('summary')
        } else if (next.status === 'canceled') {
          setPhase('canceled')
        } else {
          setPhase('error')
        }
        // Le compte connecté peut avoir changé (contacts liés, etc.) : la
        // carte et le reste de l'écran doivent le refléter.
        void queryClient.invalidateQueries({ queryKey: ['tool-registry'] })
        void queryClient.invalidateQueries({ queryKey: ['integration-sync', 'latest', provider] })
        // #2406.32 (hard failure Workspace Health, #2977) — un run qui écrit
        // des comptes/contacts réels (résumé `accounts`/`contacts`, voir
        // `SyncSummary`) laissait « Aujourd'hui » sur son cache d'AVANT la
        // synchro : la page pouvait rester vide alors que la synchro venait
        // de réussir. Même geste que `useTasks`/`DayClosureCard` (invalider
        // le préfixe `['briefing']` couvre `today`/`actions`/`since-last-visit`).
        void queryClient.invalidateQueries({ queryKey: ['briefing'] })
      } catch {
        // Un échec de LECTURE n'est pas un échec du run : jamais « terminé », jamais silencieux — on le dit, on réessaie.
        if (cancelledRef.current) return
        setPollFailed(true)
        later()
      }
    }
    void poll()
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [phase, runId, provider, queryClient])

  if (phase === 'preview') {
    return (
      <SyncLaunchPreview
        tool={tool}
        name={name}
        onCancel={onClose}
        onLaunch={() => void launch()}
        launching={launching}
      />
    )
  }

  if (phase === 'running') {
    const cancel = async () => {
      if (!run || canceling) return
      setCanceling(true)
      try {
        await integrationCenterApi.cancelSync(provider, run.id)
      } catch {
        if (!cancelledRef.current) toast.error(t('syncSummary.errorTitle'))
      } finally {
        if (!cancelledRef.current) setCanceling(false)
      }
    }
    const status = run?.status ?? 'pending'
    // #4591 — un run qui ne progresse pas le DIT (« en attente depuis N min ») ; jamais un état terminal fabriqué.
    const waited = status === 'pending' && run ? waitingMinutes(run.started_at, new Date()) : null
    // `running` (historique, GA-08) ne correspond à aucune étape connue : on
    // nomme l'état, sans prétendre savoir où il en est dans la liste.
    const currentStepIndex = (SYNC_RUN_STEPS as readonly string[]).indexOf(status)
    return (
      <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
        <Box className="flex items-center justify-between gap-2">
          <Box display="flex" className="items-center gap-2">
            <Spinner />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t(syncRunStateLabelKey(status))}
            </Text>
          </Box>
          <Button variant="ghost" size="sm" onClick={() => void cancel()} disabled={canceling}>
            {t('syncSummary.cancel')}
          </Button>
        </Box>
        {waited !== null ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('syncSummary.waitingSince', { count: waited })}
          </Text>
        ) : null}
        {pollFailed ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('syncSummary.pollUnavailable')}
          </Text>
        ) : null}
        {currentStepIndex >= 0 ? (
          <Box className="space-y-0.5">
            {SYNC_RUN_STEPS.map((step, index) => (
              <Text
                key={step}
                size="xs"
                weight={index === currentStepIndex ? 'semibold' : 'normal'}
                color={index <= currentStepIndex ? undefined : 'text-[var(--bellum-text-secondary)]'}
              >
                {t(syncRunStateLabelKey(step))}
              </Text>
            ))}
          </Box>
        ) : null}
      </Box>
    )
  }

  if (phase === 'canceled') {
    return (
      <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
        <Text size="xs" weight="semibold">
          {t('syncSummary.canceledTitle')}
        </Text>
        <Box display="flex" className="justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('syncPreview.later')}
          </Button>
        </Box>
      </Box>
    )
  }

  if (phase === 'error') {
    return (
      <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
        <Text size="xs" weight="semibold">
          {t('syncSummary.errorTitle')}
        </Text>
        {run?.error ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {run.error[lang]}
          </Text>
        ) : null}
        <Box display="flex" className="justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('syncPreview.later')}
          </Button>
        </Box>
      </Box>
    )
  }

  return (
    <Box className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-3">
      <Text size="xs" weight="semibold">
        {run?.status === 'partial' ? t('syncSummary.partialTitle') : t('syncSummary.title')}
      </Text>
      <SyncSummary lines={run?.summary ?? []} />
      <Box display="flex" className="justify-end">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('syncPreview.later')}
        </Button>
      </Box>
    </Box>
  )
}
