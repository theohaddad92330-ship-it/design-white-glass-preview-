import {
  Badge,
  Button,
  Card,
  Separator,
  Text,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@bellum/ui'
import type { AgentWarning, AnalysisPartial, SourceHealth } from '@bellum/contracts'
import { AlertTriangle, CheckCircle2, Clock3, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AnimatedProgressLabel } from '@/components/feedback/AnimatedProgressLabel'
// #2630.2 — le libellé d'une phase vit à UN seul endroit (GA-26) : la table qui
// sert déjà l'abonnement WS. Le recopier ici ferait diverger les deux au premier
// ajout de phase.
import { phaseLabel } from '@/lib/analysis-subscription'
import { isRunQuiet } from '@/lib/analysis-wait'
import { analysisStepLabel } from '@/lib/analysis-step-progress'
import { useOptionalContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import { useAnalysisRun, type StepKey } from '@/stores/analysisStore'

const HEALTH_DOT: Record<SourceHealth, string> = {
  ok: 'bg-green-500',
  degraded: 'bg-amber-400',
  down: 'bg-red-500',
  skipped: 'bg-[var(--text-ghost)]',
}

/**
 * #2630.2 — CE QUI EST DÉJÀ TROUVÉ, pendant que l'analyse tourne.
 *
 * Trois à six minutes devant une barre qui avance sans rien dire, c'est le
 * retour qui a ouvert ce point. La matière était pourtant déjà sur le fil : le
 * worker envoie la sortie de chaque phase avec sa complétion, et le navigateur
 * la jetait. Elle arrive maintenant sous la forme BORNÉE du contrat partagé —
 * des décomptes et au plus trois libellés.
 *
 * ⚠️ Ce bloc ne s'affiche QUE s'il y a quelque chose à dire. Il n'a aucun état
 * « rien trouvé », aucun zéro, aucune barre de complétude : `analysisPartialFrom`
 * ne produit rien quand une phase n'a rien ramené, donc une absence ne peut
 * faire aucune ligne ici.
 *
 * ⚠️ Et ce n'est PAS un aperçu du dossier : la course efface ses partiels à la
 * fin (`setComplete`), parce que deux listes de contacts côte à côte — l'une
 * partielle, l'autre complète — se liraient comme un désaccord.
 */
function AnalysisPartials({ partials }: { partials: AnalysisPartial[] }) {
  const { t } = useTranslation('analysis')

  if (partials.length === 0) return null

  return (
    <motion.div layout data-testid="analysis-partials" className="mb-6 max-w-3xl">
      <Text element="p" size="xs" weight="medium" color="text-[var(--text-ghost)]" className="mb-2 tracking-[0.02em]">
        {t('progressCard.partialsTitle')}
      </Text>
      <ul className="flex flex-col gap-1.5">
        {partials.map(partial =>
          partial.findings.map(finding => (
            <li key={`${partial.phase}:${finding.kind}`} className="flex flex-wrap items-baseline gap-x-2">
              <Text element="span" size="sm" weight="medium" className="text-[var(--text-primary)]">
                {t(`progressCard.partialKind.${finding.kind}`, { count: finding.count })}
              </Text>
              {finding.samples.length > 0 && (
                <Text element="span" size="sm" className="text-[var(--text-secondary)]">
                  {t('progressCard.partialsSamples', { names: finding.samples.join(', ') })}
                </Text>
              )}
              <Text element="span" size="xs" className="text-[var(--text-ghost)]">
                {t('progressCard.partialsBy', { phase: phaseLabel(partial.phase) })}
              </Text>
            </li>
          )),
        )}
      </ul>
    </motion.div>
  )
}

function AnalysisStepPreview({ step }: { step: StepKey }) {
  const { t } = useTranslation('analysis')
  // i18n keys: previews.scope | previews.crosscheck | previews.account_sheet | previews.decision_makers |
  // previews.orga_chain | previews.classification | previews.messages |
  // previews.reuse_existing | previews.current_research | previews.thematic_research (chacune : .eyebrow / .title / .body)

  return (
    <motion.div layout className="mb-6 max-w-3xl">
      <Text element="p" size="xs" weight="medium" color="text-[var(--text-ghost)]" className="mb-2 tracking-[0.02em]">
        {t(`previews.${step}.eyebrow`)}
      </Text>
      <Text element="p" size="lg" weight="semibold" className="text-[var(--text-primary)]">
        {t(`previews.${step}.title`)}
      </Text>
      <Text element="p" size="sm" className="mt-2 leading-7 text-[var(--text-secondary)]">
        {t(`previews.${step}.body`)}
      </Text>
    </motion.div>
  )
}

function SourceHealthBadge({
  warnings,
  sourceHealth,
}: {
  warnings: AgentWarning[]
  sourceHealth: Record<string, SourceHealth>
}) {
  const { t } = useTranslation('analysis')
  const healthEntries = Object.entries(sourceHealth)
  if (warnings.length === 0 && healthEntries.length === 0) return null

  const degraded = warnings.length > 0

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'mt-2 gap-1.5 cursor-default',
              degraded
                ? 'border-amber-500/30 bg-amber-500/10 text-[var(--bellum-warning-text)]'
                : 'border-green-500/30 bg-green-500/10 text-[var(--bellum-success-text)]',
            )}
          >
            {degraded ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}
            {degraded ? t('progressCard.badgePartial') : t('progressCard.badgeComplete')}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          {healthEntries.length > 0 && (
            <div className="space-y-1">
              {healthEntries.map(([source, status]) => (
                <div key={source} className="flex items-center gap-2">
                  <span className={cn('size-1.5 rounded-full', HEALTH_DOT[status])} />
                  <span className="capitalize">{source}</span>
                  {/* i18n keys: sourceHealth.ok | sourceHealth.degraded | sourceHealth.down | sourceHealth.skipped */}
                  <span className="ml-auto text-[var(--text-muted)]">{t(`sourceHealth.${status}`)}</span>
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[var(--text-muted)]">
              {warnings.map(w => (
                <li key={w.code}>{w.message}</li>
              ))}
            </ul>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

type AnalysisProgressCardProps = {
  companyName: string
  phase: string
  onCancel?: () => void
  /** Compact variant when embedded inside AccountDetail (no centered title, smaller padding). */
  variant?: 'page' | 'embed'
  /** Account ID — required so we can read the live step state pushed by
   *  the backend over Socket.IO from the analysis store. */
  accountId?: string | null
}

export function AnalysisProgressCard({
  companyName,
  phase,
  onCancel,
  variant = 'page',
  accountId,
}: AnalysisProgressCardProps) {
  const { t } = useTranslation('analysis')
  const engagement = useOptionalContactEngagement()
  const hasEngagementTabs = Boolean(engagement?.lastEngagement)
  const run = useAnalysisRun(accountId ?? null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const quiet = run ? isRunQuiet(run, now) : false
  const completedSet = new Set<StepKey>(run?.completedSteps ?? [])
  const currentStep = run?.currentStep ?? null
  const phaseLabel = run?.phase ?? phase
  const liveEvents = run?.events ?? []
  const currentLiveLabel = liveEvents[liveEvents.length - 1]?.label ?? phaseLabel
  // #3666 (Louis 13/10, « étapes, pas de % ») — l'étape MESURÉE du job parmi
  // ses étapes réelles ; inconnue, « En cours » — jamais un chiffre inventé.
  const stepLabel = analysisStepLabel(currentStep, run?.optionalSteps ?? [])
  const layoutTransition = {
    type: 'spring',
    stiffness: 220,
    damping: 26,
    mass: 0.9,
  } as const

  // #3143 (retour bêta, 27/09/2026) — « énorme bloc gris qui prend toute la
  // hauteur de la page ». `embed` rend une actualisation SUR le dossier déjà
  // lisible (`AccountDetailStatusBanners`) : la carte complète (titre,
  // séparateur, aperçu d'étape, pied avec durée) — pensée pour occuper tout
  // un écran d'attente (`SearchAnalyzingState`, variant `page`) — n'a aucune
  // raison d'exister ici. Une ligne compacte suffit : état, étape en cours,
  // progression — le nom du compte est déjà celui de la page.
  if (variant === 'embed') {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] px-4 py-3"
        data-testid="analysis-progress-compact"
      >
        <Clock3 className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Text element="span" size="sm" weight="medium" noWrap className="text-[var(--text-primary)]">
              {t('progressCard.refreshing')}
            </Text>
            <Text element="span" size="sm" className="min-w-0 truncate text-[var(--bellum-text-secondary)]">
              {currentLiveLabel}
            </Text>
          </div>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('progressCard.refreshingHint')}
          </Text>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
            <motion.div
              className="h-full w-1/3 rounded-full bg-[var(--bellum-primary-500)] dark:bg-[var(--bellum-primary-400)]"
              animate={{ x: ['-100%', '300%'] }}
              transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
            />
          </div>
        </div>
        <Text
          element="span"
          size="xs"
          className="shrink-0 tabular-nums text-[var(--bellum-text-accent)]"
          title={stepLabel ? undefined : t('progressCard.progressUnknownHint')}
        >
          {stepLabel ?? t('progressCard.progressUnknown')}
        </Text>
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            icon={<X className="size-3.5" />}
            className="h-7 shrink-0 gap-1.5 rounded-full px-2.5 text-xs text-[var(--danger-soft-text)] font-medium hover:bg-[var(--bg-glass)] hover:text-[var(--danger-soft-text)]"
          >
            {t('progressCard.cancel')}
          </Button>
        )}
        {/* #2436.6 — même annonce que la carte complète : la PHASE, jamais le
            pourcentage qui bouge en continu. */}
        <div className="sr-only" role="status" aria-live="polite">
          {currentLiveLabel}
        </div>
      </div>
    )
  }

  return (
    <Card className="flex min-h-0 w-full flex-1 flex-col rounded-xl border-[var(--border-default)] bg-[var(--bg-surface)] p-7 shadow-[var(--shadow-elevated)]">
      <div>
        <Text element="p" size="lg" weight="bold" noWrap className="text-[var(--text-primary)]">
          {companyName}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
          {t('progressCard.inProgress')}
        </Text>
        <SourceHealthBadge warnings={run?.warnings ?? []} sourceHealth={run?.sourceHealth ?? {}} />
      </div>

      <Separator className="my-5 bg-[var(--border-subtle)]" />

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Text element="span" size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
            {t('progressCard.progressLabel')}
          </Text>
          <Text
            element="span"
            size="xs"
            className="tabular-nums text-[var(--bellum-text-accent)] dark:text-[var(--bellum-text-accent)]"
            title={stepLabel ? undefined : t('progressCard.progressUnknownHint')}
          >
            {stepLabel ?? t('progressCard.progressUnknown')}
          </Text>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
          <motion.div
            className="h-full w-1/3 rounded-full bg-[var(--bellum-primary-500)] dark:bg-[var(--bellum-primary-400)]"
            animate={{ x: ['-100%', '300%'] }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
          />
        </div>
      </div>

      <motion.div layout transition={{ layout: layoutTransition }}>
        {currentLiveLabel ? <AnimatedProgressLabel label={currentLiveLabel} className="mb-3" /> : null}
      </motion.div>

      {/* #2436.6 (GA-376) — trois à six minutes devant une barre qui avance,
          et rien qui ne le dise à un lecteur d'écran. Annonce la PHASE
          (`currentLiveLabel`, qui ne change qu'à quelques reprises pendant la
          course), jamais un pourcentage : il bougeait en continu, et
          l'annoncer à chaque tick serait le défaut que #1944.18 a déjà corrigé
          côté Chat — ici c'est le même principe, appliqué à l'autre job long. */}
      <div className="sr-only" role="status" aria-live="polite">
        {currentLiveLabel}
      </div>

      {/* #2630.2 — ce qui est DÉJÀ trouvé, au-dessus de l'aperçu de l'étape en
          cours : on montre ce qu'on a avant d'expliquer ce qu'on fait. Une
          course d'avant ce déploiement n'a pas le champ — d'où le repli, qui ne
          rend alors rien du tout. */}
      <AnalysisPartials partials={run?.partials ?? []} />

      <AnimatePresence mode="wait">
        {currentStep ? (
          <motion.div
            key={currentStep}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut', layout: layoutTransition }}
          >
            <AnalysisStepPreview step={currentStep} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnalyseFooter onCancel={onCancel} raised={hasEngagementTabs} quiet={quiet} />
    </Card>
  )
}

const AnalyseFooter = ({ onCancel, raised, quiet }: { onCancel?: () => void; raised: boolean; quiet: boolean }) => {
  const { t } = useTranslation('analysis')
  return (
    <motion.div
      layout
      initial={false}
      animate={{ paddingBottom: raised ? 40 : 0 }}
      transition={{
        layout: { type: 'spring', stiffness: 220, damping: 26, mass: 0.9 },
        paddingBottom: { duration: 0.24, ease: [0.23, 1, 0.32, 1] },
      }}
      className="mt-auto flex flex-col items-center justify-center gap-3 pt-6"
    >
      <Separator className="mb-4 bg-[var(--border-subtle)]" />

      {quiet && (
        <div className="flex flex-col items-center gap-1 text-center" data-testid="analysis-quiet-wait">
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('progressCard.quietHint')}
          </Text>
          <Link
            to="/accounts"
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline"
          >
            {t('progressCard.continueBrowsing')}
          </Link>
        </div>
      )}

      <div className="flex flex-row items-center gap-3">
        <div className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-glass)] px-3 py-1">
          <Clock3 className="size-3.5 shrink-0" />

          <Text
            element="p"
            size="xs"
            color="text-[var(--bellum-text-secondary)]"
            noWrap
            className="text-center leading-5"
          >
            {t('progressCard.durationHint')}
          </Text>
        </div>

        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            icon={<X className="size-3.5" />}
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-[var(--danger-soft-text)] font-medium hover:bg-[var(--bg-glass)] hover:text-[var(--danger-soft-text)]"
          >
            {t('progressCard.cancel')}
          </Button>
        )}
      </div>
    </motion.div>
  )
}
