import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Text } from '@bellum/ui'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { AlertTriangle, ArrowRight, CheckCircle2, Circle, CircleDot, Info } from 'lucide-react'
import { ParcoursHeading } from '@/features/onboarding/view/parcours/ParcoursHeading'
import { ParcoursInfo, ParcoursPanel, ParcoursShell } from '@/features/onboarding/view/parcours/ParcoursShell'
import { useGenerateAuditPhases } from '@/features/onboarding/hooks/useGenerateAuditPhases'
import { GENERATION_PHASES, stepOfPhase } from '@/features/onboarding/lib/onboarding-generation-phases'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'

/** #2089.33 — quatre thèmes RÉELS (les sections que l'utilisateur vient de
 *  relire, `review.blocks.*.title` — jamais un libellé inventé pour l'écran). */
const WATCHING_THEME_KEYS = [
  'review.blocks.company.title',
  'review.blocks.offer.title',
  'review.blocks.market.title',
  'review.blocks.goals.title',
] as const

/**
 * #2089.28-.36 — l'écran de génération dédié : plein mais sobre, titre/sous-titre
 * personnalisés (#2089.28), six phases réelles (#2089.29/.30, cf.
 * `onboarding-generation-phases.ts` pour la limite assumée sur leur
 * granularité), aucun faux compteur 0-100 (#2089.31), la possibilité de
 * quitter sans perdre le travail (#2089.32), ce qui est regardé (#2089.33),
 * jamais de pensée interne/prompt exposé (#2089.34 — AUCUNE valeur dynamique
 * issue d'une réponse de modèle n'est rendue ici : seuls des libellés i18n
 * FIXES et les DEUX statuts de mutation), une erreur qui nomme sa phase et se
 * relance SEULE (#2089.35), et la transition finale (#2089.36).
 */
export function OnboardingGeneratingPage() {
  useParams({ from: '/onboarding/$id/generating' })
  const navigate = useNavigate()
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const esnName = typeof answers.esn_name === 'string' && answers.esn_name.trim() ? answers.esn_name : null
  const { phases, failedPhase, succeeded, retryVerify, retryBuild } = useGenerateAuditPhases()
  // #2091.39 — la troisième mention de fin dépend d'un fait DISTINCT de
  // `succeeded` : de vraies suggestions, pas seulement un audit écrit. Même
  // hook, même donnée que `/welcome` — jamais une seconde source qui
  // pourrait diverger. `firstAnalysisSuggestions` reste vide en production
  // tant que #2069 n'est pas résolu : la mention ne s'affiche donc pas
  // aujourd'hui, ce qui est le comportement VOULU tant que ce n'est pas vrai.
  const { data: profileContextResponse } = useProfileContext()
  const hasFirstActions =
    (profileContextResponse?.profile_context?.welcomeSummary?.firstAnalysisSuggestions ?? []).length > 0
  // #2012.12 (épopée #2776) — LA COUVERTURE RÉDUITE, ENFIN VISIBLE. Le signal
  // existe depuis `846aacf3f` (`AgentMeta.source_health`, persisté sur
  // `profiles.source_health`) mais n'atteignait aucun écran. Une absence
  // (aucune source `down`) ne fait AUCUNE ligne (GA-18/19) — jamais un
  // « couverture complète » qu'aucune mesure ne prouve.
  const degradedSources = Object.entries(profileContextResponse?.sourceHealth ?? {})
    .filter(([, health]) => health === 'down')
    .map(([source]) => source)

  const failedPhaseDef = failedPhase ? GENERATION_PHASES.find(p => p.code === failedPhase) : undefined
  const onRetry = (): void => {
    if (!failedPhase) return
    if (stepOfPhase(failedPhase) === 'verify') retryVerify()
    else retryBuild()
  }

  return (
    <ParcoursShell
      actions={
        /* #2537.2 — Ludovic (call bêta 17/09) : la ligne du dessous DISAIT
            « tu peux quitter cette page » (#2089.32) sans offrir aucun moyen
            de le faire — l'onboarding prenait l'application en otage pendant
            la génération. Même pattern que `OnboardingReviewPage.tsx`
            (#2089.27) : un lien RÉEL, le travail continue côté serveur. */
        <Button asChild type="button" variant="ghost" size="sm">
          <Link to="/briefing">{t('actions.quit')}</Link>
        </Button>
      }
    >
      <div className="space-y-8">
        <ParcoursHeading
          kicker={t('generating.kicker')}
          title={esnName ? t('generating.title', { esnName }) : t('generating.titleGeneric')}
          lead={t('generating.subtitle')}
        />

        {/* #2089.32 — quitter ne perd rien : le travail continue côté serveur. */}
        <ParcoursInfo icon={<Info className="size-4" />}>
          {t('generating.canLeave')} {t('generating.noExternalAction')}
        </ParcoursInfo>

        {/* `ob23-work` : la colonne de travail, et sa marge à droite. */}
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
          <div className="space-y-6">
            {/* #2089.29/.30/.31 — six phases, statut catégoriel, jamais un pourcentage. */}
            <ParcoursPanel
              title={t('generating.phasesTitle')}
              meta={t('generating.phasesMeta')}
              labelledBy="generating-phases"
            >
              <ol className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
                {GENERATION_PHASES.map(phase => {
                  const status = phases[phase.code]
                  return (
                    <li key={phase.code} data-phase={phase.code} className="flex items-center gap-3 py-3.5">
                      <PhaseIcon status={status} />
                      <Text element="span" size="sm" className="min-w-0 flex-1 text-[var(--bellum-text-primary)]">
                        {t(phase.titleKey)}
                      </Text>
                      <Badge variant={status === 'error' ? 'destructive' : status === 'done' ? 'success' : 'secondary'}>
                        {t(`generating.status.${status}`)}
                      </Badge>
                    </li>
                  )
                })}
              </ol>

              {/* #2089.35 — la phase en échec, nommée, résultats conservés, relance CIBLÉE. */}
              {failedPhaseDef && (
                <div className="mt-4">
                  <ParcoursInfo tone="warning" role="alert" icon={<AlertTriangle className="size-4" />}>
                    <p className="font-medium text-[var(--danger-soft-text)]">
                      {t('generating.error.title', { phase: t(failedPhaseDef.titleKey) })}
                    </p>
                    <p className="mt-1 text-[var(--bellum-text-muted)]">{t('generating.error.kept')}</p>
                    <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
                      {t('generating.error.retry')}
                    </Button>
                  </ParcoursInfo>
                </div>
              )}
            </ParcoursPanel>

            {/* #2089.36 — fin : « Ton audit est prêt » + CTA « Découvrir mon audit ».
                #2091.39 — trois libellés SOUS le titre, chacun affiché seulement
                s'il est vrai : les deux premiers découlent du même fait mesuré
                que le titre (`succeeded`), le troisième d'un fait DISTINCT
                (`hasFirstActions`) qui peut rester faux (#2069). */}
            {succeeded && (
              <ParcoursPanel title={t('generating.success.title')} labelledBy="generating-success">
                <ul className="list-none divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)] p-0">
                  <SuccessLine label={t('generating.success.auditValidated')} />
                  <SuccessLine label={t('generating.success.lauraConfigured')} />
                  {hasFirstActions && <SuccessLine label={t('generating.success.firstActionsReady')} />}
                </ul>
                {degradedSources.length > 0 && (
                  <div className="mt-4">
                    <ParcoursInfo tone="warning" icon={<AlertTriangle className="size-4" />}>
                      <span className="text-[var(--warning-soft-text)]">
                        {t('generating.success.reducedCoverage', {
                          sources: degradedSources
                            .map(source => t(`generating.success.sourceNames.${source}`, { defaultValue: source }))
                            .join(', '),
                        })}
                      </span>
                    </ParcoursInfo>
                  </div>
                )}
                <Button
                  type="button"
                  variant="violet"
                  className="mt-5"
                  icon={ArrowRight}
                  iconPosition="right"
                  onClick={() => navigate({ to: '/welcome', replace: true })}
                >
                  {t('generating.success.cta')}
                </Button>
              </ParcoursPanel>
            )}
          </div>

          {/* #2089.33 — ce que je regarde, réel : la marge `ob23-live`. */}
          <aside aria-labelledby="generating-watching">
            <ParcoursPanel title={t('generating.watching.title')} labelledBy="generating-watching">
              <ul className="flex flex-wrap gap-2">
                {WATCHING_THEME_KEYS.map(key => (
                  <li key={key}>
                    <Badge variant="secondary">{t(key)}</Badge>
                  </li>
                ))}
              </ul>
            </ParcoursPanel>
          </aside>
        </div>
      </div>
    </ParcoursShell>
  )
}

/** Le repère de statut d'une phase — une forme par état, la couleur dit l'état. */
function PhaseIcon({ status }: { status: string }) {
  if (status === 'done') return <CheckCircle2 aria-hidden className="size-4 shrink-0 text-[var(--success-soft-text)]" />
  if (status === 'error')
    return <AlertTriangle aria-hidden className="size-4 shrink-0 text-[var(--danger-soft-text)]" />
  if (status === 'inProgress' || status === 'partial')
    return <CircleDot aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-accent)]" />
  return <Circle aria-hidden className="size-4 shrink-0 text-[var(--bellum-text-muted)]" />
}

function SuccessLine({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <CheckCircle2 aria-hidden className="size-4 shrink-0 text-[var(--success-soft-text)]" />
      <Text element="span" size="sm" className="text-[var(--bellum-text-secondary)]">
        {label}
      </Text>
    </li>
  )
}
