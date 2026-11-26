import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ChevronRight, Info, LayoutGrid } from 'lucide-react'
import { BrailleLoader, Button, Text } from '@bellum/ui'
import {
  FramingFooterBar,
  FramingHeading,
  FramingPage,
  FramingStepTabs,
} from '@/features/onboarding/components/FramingLayout'
import { OnboardingContradictionCard } from '@/features/onboarding/components/OnboardingContradictionCard'
import { ThemeQuestionCard } from '@/features/onboarding/components/ThemeQuestionCard'
import { useFramingAutosave } from '@/features/onboarding/hooks/useFramingAutosave'
import { useOnboardingState, useSaveAnswers } from '@/features/onboarding/hooks/useOnboarding'
import { buildThreadFacts } from '@/features/onboarding/lib/framing-readout'
import {
  distinctQuestionCount,
  ESSENTIAL_STEPS,
  GUIDED_STEPS,
  initialFramingLocation,
  stepProgress,
  treatedCount,
  type FramingStep,
} from '@/features/onboarding/lib/guided-framing'
import { buildQuestionnaireContradictions } from '@/features/onboarding/lib/onboarding-contradictions'
import type { ReviewEditTarget } from '@/features/onboarding/lib/onboarding-review-blocks'
import { formatSavedAt } from '@/features/onboarding/lib/saved-at'
import { THEMES } from '@/features/onboarding/lib/theme-catalog'
import { THEME_ICONS } from '@/features/onboarding/lib/theme-icons'
import { presentedValue } from '@/features/onboarding/lib/validation'
import { useOnboardingStore } from '@/stores/onboardingStore'

type Phase = 'essential' | 'guided'

/**
 * Théo O onboarding-essentiel + onboarding-guide — LE CADRAGE EN DEUX MARCHES,
 * sur une même adresse (le parcours existant, `/onboarding/$id/$stage/$slug` :
 * aucune route neuve).
 *
 *  · l'essentiel : une page, cinq blocs, dix-huit repères — l'espace est
 *    utilisable dès qu'ils sont posés ;
 *  · le guidé : huit étapes, un rail cliquable, une étape à la fois.
 *
 * Rien ne bloque : chaque question accepte un statut (cinq, dont « Je ne sais
 * pas » et « À compléter plus tard »), donc « Continuer » ne se désactive jamais.
 * Chaque réponse s'enregistre seule (brouillon local puis serveur) ; sortir ne
 * perd rien. La sortie du guide mène à la relecture, qui garde la validation.
 */
export function GuidedFramingShell({ targetKey }: { targetKey: string | null }) {
  const { t, i18n } = useTranslation('onboarding')
  const navigate = useNavigate()
  const { data: state } = useOnboardingState()
  const hydrate = useOnboardingStore(s => s.hydrate)
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const prefillMeta = useOnboardingStore(s => s.prefillMeta)
  const lastSavedAt = useOnboardingStore(s => s.lastSavedAt)
  const save = useSaveAnswers()

  const [location, setLocation] = useState<{ phase: Phase; stepIndex: number } | null>(null)
  // L'essentiel est UNE page : l'onglet actif est le bloc où l'on a sauté.
  const [essentialTab, setEssentialTab] = useState(0)

  useEffect(() => {
    if (state) hydrate(state.answers)
  }, [state, hydrate])

  // Le point d'entrée se décide UNE fois les réponses relues ; une nouvelle cible (« Modifier » de la relecture) le repositionne.
  const hydrated = !!state
  useEffect(() => {
    if (!hydrated) return
    const next = initialFramingLocation(
      targetKey,
      useOnboardingStore.getState().answers,
      useOnboardingStore.getState().statuses,
    )
    setLocation({ phase: next.phase, stepIndex: next.phase === 'guided' ? next.stepIndex : 0 })
  }, [hydrated, targetKey])

  const allQuestions = useMemo(
    () => [...new Map([...ESSENTIAL_STEPS, ...GUIDED_STEPS].flatMap(s => s.questions).map(q => [q.key, q])).values()],
    [],
  )
  useFramingAutosave(allQuestions, hydrated)

  if (!state || !location) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }

  const { phase, stepIndex } = location
  const essential = phase === 'essential'
  const steps = essential ? ESSENTIAL_STEPS : GUIDED_STEPS
  const treatedAll = treatedCount([...ESSENTIAL_STEPS, ...GUIDED_STEPS], answers, statuses)
  const treatedHere = treatedCount(steps, answers, statuses)
  const savedTime = formatSavedAt(lastSavedAt, i18n.language)
  const prefilled = steps.flatMap(s => s.questions).filter(q => prefillMeta[q.key]).length
  const facts = buildThreadFacts(answers, t)
  const contradiction = buildQuestionnaireContradictions(answers, t)[0]
  const current: FramingStep | undefined = essential ? undefined : GUIDED_STEPS[stepIndex]

  /** Écrit les réponses de la page tout de suite : on ne quitte jamais l'écran sur un enregistrement en attente. */
  const flush = async (questions: readonly FramingStep['questions'][number][]): Promise<void> => {
    const payload = Object.fromEntries(questions.map(q => [q.key, presentedValue(q, answers[q.key])]))
    try {
      await save.mutateAsync(payload)
    } catch {
      // Le brouillon local garde les réponses ; l'enregistrement serveur reprend à la prochaine frappe.
    }
  }
  const toReview = async (questions: readonly FramingStep['questions'][number][]): Promise<void> => {
    await flush(questions)
    await navigate({ to: '/onboarding/$id/review', params: { id: state.id } })
  }
  const goGuided = async (index: number): Promise<void> => {
    await flush((essential ? ESSENTIAL_STEPS : [GUIDED_STEPS[stepIndex]]).flatMap(s => s?.questions ?? []))
    setLocation({ phase: 'guided', stepIndex: index })
    document.getElementById('framing-scroll')?.scrollTo({ top: 0 })
  }
  const onModify = (target: ReviewEditTarget): void => {
    void navigate({
      to: '/onboarding/$id/$stage/$slug',
      params: { id: state.id, stage: target.stage, slug: target.slug },
    })
  }

  let counter = 0
  const numbered = (step: FramingStep) =>
    step.questions.map(question => {
      counter += 1
      return <ThemeQuestionCard key={question.key} question={question} index={counter} />
    })

  const tabProgress = (step: FramingStep) => {
    const { treated, total: count } = stepProgress(step, answers, statuses)
    return treated === null ? t('guided.rail.notStarted') : t('guided.rail.treated', { treated, total: count })
  }
  const tabs = steps.map(step => ({ id: step.id, title: t(step.titleKey), progress: tabProgress(step) }))
  const selectTab = (index: number): void => {
    if (!essential) {
      void goGuided(index)
      return
    }
    setEssentialTab(index)
    document.getElementById(`block-${ESSENTIAL_STEPS[index]?.id ?? ''}`)?.scrollIntoView({ block: 'start' })
  }
  const back = (): void => {
    if (essential) void navigate({ to: '/onboarding/company' })
    else if (stepIndex === 0) setLocation({ phase: 'essential', stepIndex: 0 })
    else void goGuided(stepIndex - 1)
  }
  const themeLinks = essential ? ESSENTIAL_THEME_LINKS : (current?.themeSlugs ?? [])
  const fieldGrid = 'grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2'

  return (
    <FramingPage
      footer={
        <FramingFooterBar
          onBack={back}
          secondary={
            essential ? (
              <Button
                type="button"
                variant="plain"
                onClick={() => void toReview(ESSENTIAL_STEPS.flatMap(s => s.questions))}
              >
                {t('guided.actions.reviewNow')}
              </Button>
            ) : stepIndex < GUIDED_STEPS.length - 1 ? (
              <Button type="button" variant="plain" onClick={() => void toReview(current?.questions ?? [])}>
                {t('guided.actions.finish')}
              </Button>
            ) : null
          }
          saved={savedTime ? `${t('guided.actions.saved')} · ${savedTime}` : null}
          primary={
            essential ? (
              <Button type="button" onClick={() => void goGuided(initialGuidedIndex(answers, statuses))}>
                <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('guided.actions.complete')}
              </Button>
            ) : stepIndex < GUIDED_STEPS.length - 1 ? (
              <Button type="button" onClick={() => void goGuided(stepIndex + 1)}>
                <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('guided.actions.continue')}
              </Button>
            ) : (
              <Button type="button" onClick={() => void toReview(current?.questions ?? [])}>
                <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('guided.actions.finish')}
              </Button>
            )
          }
        />
      }
    >
      <div className="space-y-8">
        <FramingStepTabs
          label={t('guided.rail.label')}
          tabs={tabs}
          activeIndex={essential ? essentialTab : stepIndex}
          onSelect={selectTab}
        />

        <FramingHeading
          eyebrow={
            essential
              ? t('guided.essential.eyebrow', { blocks: ESSENTIAL_STEPS.length })
              : t('guided.eyebrowStep', { current: stepIndex + 1, total: GUIDED_STEPS.length })
          }
          title={essential ? t('guided.essential.title') : current ? t(current.titleKey) : null}
          lead={
            essential
              ? t('guided.essential.lead', {
                  blocks: ESSENTIAL_STEPS.length,
                  count: distinctQuestionCount(ESSENTIAL_STEPS),
                })
              : current?.hintKey
                ? t(current.hintKey)
                : null
          }
          action={
            <Button asChild variant="plain">
              <Link to="/onboarding/themes">
                <LayoutGrid aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('guided.allThemes')}
              </Link>
            </Button>
          }
        />

        {!essential && (
          <details className="group">
            <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm text-[var(--bellum-text-accent)]">
              <Info aria-hidden="true" className="h-4 w-4" />
              {t('guided.how.title')}
            </summary>
            <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
              {t('guided.how.body')}
            </Text>
          </details>
        )}

        {prefilled > 0 && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-control border-l-2 border-[var(--bellum-primary)] bg-[var(--bellum-surface-1)] px-4 py-3"
          >
            <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('guided.prefillBanner', { count: prefilled })}
            </Text>
          </div>
        )}

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_15.25rem]">
          <main id="framing-main" className="min-w-0 space-y-12">
            {essential
              ? ESSENTIAL_STEPS.map((step, index) => {
                  const { treated, total: count } = stepProgress(step, answers, statuses)
                  return (
                    <section
                      key={step.id}
                      id={`block-${step.id}`}
                      aria-labelledby={`block-title-${step.id}`}
                      className="scroll-mt-4 space-y-6"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <Text element="h2" size="xl" weight="semibold" id={`block-title-${step.id}`}>
                          {String(index + 1).padStart(2, '0')} · {t(step.titleKey)}
                        </Text>
                        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                          {treated === null
                            ? t('guided.essential.notStarted')
                            : t('guided.essential.treated', { treated, total: count })}
                        </Text>
                      </div>
                      <div className={fieldGrid}>{numbered(step)}</div>
                    </section>
                  )
                })
              : current && <div className={fieldGrid}>{numbered(current)}</div>}

            {contradiction && (
              <ul>
                <OnboardingContradictionCard contradiction={contradiction} onModify={onModify} />
              </ul>
            )}
          </main>

          <aside className="space-y-6 lg:sticky lg:top-4 lg:self-start" aria-labelledby="thread-title">
            <section
              data-testid="framing-thread"
              className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5"
            >
              <Text
                element="h2"
                size="xs"
                weight="semibold"
                id="thread-title"
                className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
              >
                {t('guided.thread.title')}
              </Text>
              {treatedAll === 0 ? (
                <Text element="p" size="sm" className="mt-3 text-[var(--bellum-text-secondary)]">
                  {t('guided.thread.none')}
                </Text>
              ) : (
                <dl className="mt-3 text-sm">
                  {facts.company && (
                    <Text element="p" size="lg" weight="semibold">
                      {facts.company}
                    </Text>
                  )}
                  {facts.goal && (
                    <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
                      {facts.goal}
                    </Text>
                  )}
                  {facts.offer && (
                    <div className="mt-4 space-y-1.5 border-t border-[var(--bellum-border)] pt-4">
                      <dt className="text-xs text-[var(--bellum-text-muted)]">{t('guided.thread.offer')}</dt>
                      <dd className="leading-relaxed">{facts.offer}</dd>
                    </div>
                  )}
                  {facts.territory && (
                    <div className="mt-4 space-y-1.5 border-t border-[var(--bellum-border)] pt-4">
                      <dt className="text-xs text-[var(--bellum-text-muted)]">{t('guided.thread.territory')}</dt>
                      <dd>{facts.territory}</dd>
                    </div>
                  )}
                </dl>
              )}
              {treatedAll > 0 && (
                <Text element="p" size="xs" className="mt-6 text-[var(--bellum-text-muted)]">
                  {t('guided.thread.count', { count: essential ? treatedHere : treatedAll })}
                </Text>
              )}
            </section>

            {themeLinks.length > 0 && (
              <section className="space-y-3">
                <Text element="h2" size="sm" weight="semibold">
                  {t('guided.further.title')}
                </Text>
                <Text element="p" size="xs" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {t('guided.further.body')}
                </Text>
                <ul className="divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
                  {themeLinks.map(slug => {
                    const theme = THEMES.find(item => item.slug === slug)
                    if (!theme) return null
                    const Icon = THEME_ICONS[theme.slug]
                    return (
                      <li key={slug}>
                        <Link
                          to="/onboarding/themes/$themeId"
                          params={{ themeId: slug }}
                          className="flex min-h-11 items-center gap-3 py-2 text-sm text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
                        >
                          <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]" />
                          <span className="min-w-0 flex-1">{t(theme.labelKey)}</span>
                          <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </FramingPage>
  )
}

const ESSENTIAL_THEME_LINKS = ['ton-entreprise', 'offre-et-expertises', 'clients-et-decideurs'] as const

function initialGuidedIndex(
  answers: Parameters<typeof initialFramingLocation>[1],
  statuses: Parameters<typeof initialFramingLocation>[2],
): number {
  const next = initialFramingLocation(null, answers, statuses)
  return next.phase === 'guided' ? next.stepIndex : 0
}
