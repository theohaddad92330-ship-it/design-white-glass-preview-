import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, LayoutGrid } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { BrailleLoader, Button, cn, Text } from '@bellum/ui'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { FramingFooterBar, FramingHeading, FramingPage } from '@/features/onboarding/components/FramingLayout'
import { onboardingQuestionRevealId } from '@/features/onboarding/components/SubStepQuestions'
import { ThemeQuestionCard } from '@/features/onboarding/components/ThemeQuestionCard'
import { useFramingAutosave } from '@/features/onboarding/hooks/useFramingAutosave'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import { statusOf } from '@/features/onboarding/lib/answer-status'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { findTheme } from '@/features/onboarding/lib/theme-catalog'
import { revealTarget } from '@/lib/reveal-target'
import { formatSavedAt } from '@/features/onboarding/lib/saved-at'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * Théo O onboarding-theme.R1 — le détail d'un des 16 thèmes, UN GROUPE À LA
 * FOIS (maquette V23 : le titre est le groupe, « Précisions suivantes » ouvre le
 * suivant) ; « Vue du thème » rend tous les groupes d'un coup. Chaque question
 * garde ses CINQ statuts ; « Dans ce thème » saute de groupe en groupe. Sur
 * mobile, le menu passe SOUS le contenu (jamais caché).
 */
export function OnboardingThemePage({ themeSlug }: { themeSlug: string }) {
  const { t, i18n } = useTranslation('onboarding')
  const { data: state, isLoading, isError } = useOnboardingState()
  const hydrate = useOnboardingStore(s => s.hydrate)
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const lastSavedAt = useOnboardingStore(s => s.lastSavedAt)
  const theme = findTheme(themeSlug)
  const questions = useMemo(() => theme?.questions ?? [], [theme])
  const navigate = useNavigate()
  // Une question visée par le catalogue (recherche, « à reprendre ») ouvre SON groupe, puis s'y montre.
  const hash = useLocation({ select: location => location.hash })
  const targetGroup =
    theme?.groups.findIndex(g => g.questions.some(q => onboardingQuestionRevealId(q.key) === hash)) ?? -1
  const [groupIndex, setGroupIndex] = useState<number | 'all'>(Math.max(targetGroup, 0))
  useEffect(() => {
    if (targetGroup >= 0) setGroupIndex(targetGroup)
  }, [targetGroup])

  useEffect(() => {
    if (state) hydrate(state.answers)
  }, [state, hydrate])
  useFramingAutosave(questions, !!state && !!theme)
  useEffect(() => {
    if (state && hash) revealTarget(hash)
  }, [state, hash, groupIndex])

  if (isError) {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <QueryLoadError />
      </div>
    )
  }
  if (isLoading || !state) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <BrailleLoader variant="grid-searching" />
      </div>
    )
  }
  if (!theme) return null

  const savedTime = formatSavedAt(lastSavedAt, i18n.language)
  const groups = theme.groups
  const showAll = groupIndex === 'all'
  const index = showAll ? 0 : Math.min(groupIndex, Math.max(groups.length - 1, 0))
  const group = groups[index]
  const shown = showAll ? groups : group ? [group] : []
  const isLast = index >= groups.length - 1
  const goGroup = (next: number | 'all'): void => {
    setGroupIndex(next)
    document.getElementById('framing-scroll')?.scrollTo({ top: 0 })
  }
  const resume = TEMPS1_SUBSTEPS[0]
  // Numéro CONTINU sur ce qui est affiché (01…N) : un groupe repart à 01, la vue du thème numérote tout.
  let counter = 0
  return (
    <FramingPage
      footer={
        <FramingFooterBar
          onBack={() => (showAll || index === 0 ? void navigate({ to: '/onboarding/themes' }) : goGroup(index - 1))}
          secondary={
            <Button asChild variant="plain">
              <Link to="/onboarding/$id/review" params={{ id: state.id }}>
                {t('themePage.readSummary')}
              </Link>
            </Button>
          }
          // Théo O onboarding-theme.R4 — l'heure n'apparaît qu'une fois une réponse réellement écrite.
          saved={savedTime ? t('themePage.savedAt', { time: savedTime }) : null}
          primary={
            !showAll && !isLast ? (
              <Button type="button" onClick={() => goGroup(index + 1)}>
                <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('themePage.next')}
              </Button>
            ) : (
              <Button asChild>
                <Link to="/onboarding/themes">
                  <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                  {t('themePage.back')}
                </Link>
              </Button>
            )
          }
        />
      }
    >
      <div className="space-y-10">
        <FramingHeading
          eyebrow={
            <span className="normal-case tracking-normal">
              {t('themePage.kicker', { number: String(theme.number).padStart(2, '0') })} · {t(theme.labelKey)}
            </span>
          }
          title={showAll || !group ? t(theme.labelKey) : t(group.labelKey)}
          lead={t('themePage.lead')}
          action={
            groups.length > 1 && (
              <Button type="button" variant="plain" onClick={() => goGroup(showAll ? 0 : 'all')}>
                <LayoutGrid aria-hidden="true" className="mr-2 h-4 w-4" />
                {showAll ? t('themePage.groupView') : t('themePage.themeView')}
              </Button>
            )
          }
        />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_14.375rem]">
          <main className="min-w-0 space-y-12">
            {groups.length === 0 && (
              <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
                {t('catalog.footerEmpty')}
              </Text>
            )}
            {shown.map(item => (
              <section key={item.slug} id={`group-${item.slug}`} aria-labelledby={`group-title-${item.slug}`}>
                <Text
                  element="h2"
                  size={showAll ? 'xl' : 'sm'}
                  weight="semibold"
                  id={`group-title-${item.slug}`}
                  className={showAll ? 'mb-6' : 'sr-only'}
                >
                  {String(groups.indexOf(item) + 1).padStart(2, '0')} · {t(item.labelKey)}
                </Text>
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 md:grid-cols-2">
                  {item.questions.map(question => {
                    counter += 1
                    return <ThemeQuestionCard key={question.key} question={question} index={counter} />
                  })}
                </div>
              </section>
            ))}
          </main>

          <aside
            className="lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-[var(--bellum-border)] lg:pl-4"
            aria-labelledby="theme-groups-title"
            data-testid="theme-groups"
          >
            <Text element="h2" size="sm" weight="semibold" id="theme-groups-title" className="mb-3">
              {t('themePage.groupsTitle')}
            </Text>
            <nav aria-labelledby="theme-groups-title">
              <ol className="flex flex-col gap-1">
                {groups.map((item, itemIndex) => {
                  const done = item.questions.filter(
                    q => statusOf(q, answers[q.key], statuses[q.key]) === 'answered',
                  ).length
                  const active = !showAll && itemIndex === index
                  return (
                    <li key={item.slug}>
                      <button
                        type="button"
                        aria-current={active ? 'step' : undefined}
                        onClick={() => goGroup(itemIndex)}
                        className={cn(
                          'flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 text-left text-sm duration-immediate ease-bellum-out',
                          active
                            ? 'bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
                            : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]',
                        )}
                      >
                        <span className="font-mono text-xs text-[var(--bellum-text-muted)]">
                          {String(itemIndex + 1).padStart(2, '0')}
                        </span>
                        <span className="min-w-0 flex-1">{t(item.labelKey)}</span>
                        {done > 0 && (
                          <span className="text-xs text-[var(--bellum-text-muted)]">
                            {done}/{item.questions.length}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            </nav>
            <div className="mt-6 border-t border-[var(--bellum-border)] pt-4">
              {resume && (
                <Button asChild variant="plain">
                  <Link
                    to="/onboarding/$id/$stage/$slug"
                    params={{ id: state.id, stage: resume.stageCode, slug: resume.slug }}
                  >
                    <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
                    {t('themePage.backToWork')}
                  </Link>
                </Button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </FramingPage>
  )
}
