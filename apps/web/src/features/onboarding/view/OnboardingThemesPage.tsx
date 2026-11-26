import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, BrailleLoader, Button, SearchInput, Text } from '@bellum/ui'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { FramingFooterBar, FramingHeading, FramingPage } from '@/features/onboarding/components/FramingLayout'
import { onboardingQuestionRevealId } from '@/features/onboarding/components/SubStepQuestions'
import { useOnboardingState } from '@/features/onboarding/hooks/useOnboarding'
import {
  THEMES,
  pendingAnswers,
  recommendedThemes,
  searchCatalog,
  themeProgress,
  type Theme,
} from '@/features/onboarding/lib/theme-catalog'
import { statusOf, type AnswerStatus } from '@/features/onboarding/lib/answer-status'
import { formatSavedAt } from '@/features/onboarding/lib/saved-at'
import { THEME_ICONS } from '@/features/onboarding/lib/theme-icons'
import { TEMPS1_SUBSTEPS } from '@/features/onboarding/lib/questions'
import { useOnboardingStore } from '@/stores/onboardingStore'

function ThemeFooter({ theme }: { theme: Theme }) {
  const { t } = useTranslation('onboarding')
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const { answered, total } = themeProgress(theme, answers, statuses)
  // GA-18 : une absence n'est jamais « 0 réponse ».
  // Un thème sans repère dans le catalogue ne s'annonce pas « 0 repère disponible ».
  return (
    <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
      {total === 0
        ? t('catalog.footerEmpty')
        : answered === null
          ? t('catalog.footerNotStarted', { total })
          : t('catalog.footerProgress', { count: answered, total })}
    </Text>
  )
}

/** La couleur dit l'état : « à compléter plus tard » attend, « à vérifier » renvoie à l'équipe. */
const STATUS_TONE: Partial<Record<AnswerStatus, 'warning' | 'info' | 'outline'>> = {
  answer_later: 'warning',
  to_verify_with_team: 'info',
  not_yet_known: 'outline',
  not_applicable: 'outline',
}

/**
 * Théo O onboarding-catalogue.R1 — « Les thèmes à approfondir » : les 16 thèmes
 * du catalogue, une recherche qui parcourt TOUTES les questions, les réponses
 * mises de côté à reprendre, et ce qu'il est utile de regarder ensuite. Le
 * premier cadrage suffit pour commencer : rien ici n'oblige à tout remplir.
 */
export function OnboardingThemesPage() {
  const { t, i18n } = useTranslation('onboarding')
  const navigate = useNavigate()
  const { data: state, isLoading, isError } = useOnboardingState()
  const lastSavedAt = useOnboardingStore(s => s.lastSavedAt)
  const savedTime = formatSavedAt(lastSavedAt, i18n.language)
  const hydrate = useOnboardingStore(s => s.hydrate)
  const answers = useOnboardingStore(s => s.answers)
  const statuses = useOnboardingStore(s => s.statuses)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (state) hydrate(state.answers)
  }, [state, hydrate])

  const hits = useMemo(() => searchCatalog(query, t), [query, t])
  const pending = useMemo(() => pendingAnswers(answers, statuses), [answers, statuses])
  const recommended = useMemo(() => recommendedThemes(answers, statuses), [answers, statuses])
  const answeredCount = THEMES.flatMap(theme => theme.questions).filter(
    q => statusOf(q, answers[q.key], statuses[q.key]) === 'answered',
  ).length

  // #3666.k — une lecture en échec n'est pas un catalogue vide.
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

  const firstSub = TEMPS1_SUBSTEPS[0]
  const searching = query.trim().length >= 2
  const resumeParams = firstSub ? { id: state.id, stage: firstSub.stageCode, slug: firstSub.slug } : null
  const rowClass =
    'flex min-h-11 items-center justify-between gap-3 px-6 py-3.5 duration-immediate ease-bellum-out hover:bg-[var(--bellum-row-hover)]'

  return (
    <FramingPage
      footer={
        <FramingFooterBar
          onBack={
            resumeParams ? () => void navigate({ to: '/onboarding/$id/$stage/$slug', params: resumeParams }) : undefined
          }
          saved={savedTime ? `${t('guided.actions.saved')} · ${savedTime}` : null}
          primary={
            <Button asChild>
              <Link to="/onboarding/$id/review" params={{ id: state.id }}>
                <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                {t('catalog.review')}
              </Link>
            </Button>
          }
        />
      }
    >
      <div className="space-y-8">
        <FramingHeading
          eyebrow={t('catalog.kicker')}
          title={t('catalog.title')}
          lead={t('catalog.intro')}
          action={
            resumeParams && (
              <Button asChild variant="soft">
                <Link to="/onboarding/$id/$stage/$slug" params={resumeParams}>
                  <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
                  {t('catalog.resume')}
                </Link>
              </Button>
            )
          }
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <SearchInput
            className="min-w-64 flex-1"
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
            placeholder={t('catalog.searchPlaceholder')}
            ariaLabel={t('catalog.searchLabel')}
          />
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {answeredCount === 0
              ? t('catalog.counterNone', { themes: THEMES.length })
              : t('catalog.counter', { count: answeredCount, themes: THEMES.length })}
          </Text>
        </div>

        <div aria-live="polite">
          {searching && hits.length === 0 && (
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {t('catalog.noResults', { query: query.trim() })}
            </Text>
          )}
          {searching && hits.length > 0 && (
            <ul className="divide-y divide-[var(--bellum-border)] overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
              {hits.slice(0, 40).map(({ question, theme }) => (
                <li key={question.key}>
                  <Link
                    to="/onboarding/themes/$themeId"
                    params={{ themeId: theme.slug }}
                    hash={onboardingQuestionRevealId(question.key)}
                    className={rowClass}
                  >
                    <span className="min-w-0">
                      <Text element="span" size="sm" weight="medium" className="block">
                        {t(question.label)}
                      </Text>
                      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                        {t(theme.labelKey)}
                      </Text>
                    </span>
                    <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!searching && (
          <>
            {pending.length > 0 && (
              <section
                aria-labelledby="pending-title"
                data-testid="catalog-pending"
                className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
              >
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--bellum-border)] px-6 py-4">
                  <Text element="h2" size="lg" weight="semibold" id="pending-title">
                    {t('catalog.pendingTitle')}
                  </Text>
                  <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('catalog.pendingCount', { count: pending.length })}
                  </Text>
                </header>
                <ul className="divide-y divide-[var(--bellum-border)]">
                  {pending.map(({ question, theme, status }) => (
                    <li key={question.key}>
                      <Link
                        to="/onboarding/themes/$themeId"
                        params={{ themeId: theme.slug }}
                        hash={onboardingQuestionRevealId(question.key)}
                        className={rowClass}
                      >
                        <span className="min-w-0">
                          <Text element="span" size="sm" weight="medium" className="block">
                            {t(question.label)}
                          </Text>
                          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                            {t(theme.labelKey)}
                          </Text>
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <Badge variant={STATUS_TONE[status] ?? 'outline'}>{t(`answerStatus.${status}`)}</Badge>
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {recommended.length > 0 && (
              <section
                aria-labelledby="recommended-title"
                data-testid="catalog-recommended"
                className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
              >
                <header className="border-b border-[var(--bellum-border)] px-6 py-4">
                  <Text element="h2" size="lg" weight="semibold" id="recommended-title">
                    {t('catalog.recommendedTitle')}
                  </Text>
                </header>
                <ul className="grid grid-cols-1 md:grid-cols-2">
                  {recommended.map(({ theme, progress }) => {
                    const Icon = THEME_ICONS[theme.slug]
                    return (
                      <li
                        key={theme.slug}
                        className="border-b border-[var(--bellum-border)] md:odd:border-r [&:nth-last-child(-n+2)]:md:border-b-0 last:border-b-0"
                      >
                        <Link
                          to="/onboarding/themes/$themeId"
                          params={{ themeId: theme.slug }}
                          className="flex h-full min-h-11 items-start gap-3 px-6 py-5 duration-immediate ease-bellum-out hover:bg-[var(--bellum-row-hover)]"
                        >
                          <Icon
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-accent)]"
                          />
                          <span className="min-w-0 flex-1 space-y-1.5">
                            <Text element="span" size="sm" weight="semibold" className="block">
                              {t(theme.labelKey)}
                            </Text>
                            <Text element="span" size="xs" className="block text-[var(--bellum-text-secondary)]">
                              {t(theme.descriptionKey)}
                            </Text>
                            <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                              {progress.started
                                ? t('catalog.recommendedStarted', { count: progress.answered })
                                : t('catalog.recommendedFresh')}
                            </Text>
                          </span>
                          <ChevronRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            <section aria-labelledby="all-title">
              <Text element="h2" size="base" weight="semibold" id="all-title" className="sr-only">
                {t('catalog.allTitle')}
              </Text>
              <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="catalog-themes">
                {THEMES.map(theme => {
                  const Icon = THEME_ICONS[theme.slug]
                  return (
                    <li key={theme.slug}>
                      <Link
                        to="/onboarding/themes/$themeId"
                        params={{ themeId: theme.slug }}
                        className="flex h-full flex-col rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-5 pb-4 pt-5 duration-immediate ease-bellum-out hover:border-[var(--bellum-border-strong)]"
                      >
                        <span className="flex items-center justify-between">
                          <Text element="span" size="xs" className="font-mono text-[var(--bellum-text-muted)]">
                            {String(theme.number).padStart(2, '0')}
                          </Text>
                          <Icon aria-hidden="true" className="h-4 w-4 text-[var(--bellum-text-muted)]" />
                        </span>
                        <Text element="h3" size="base" weight="semibold" className="mt-4">
                          {t(theme.labelKey)}
                        </Text>
                        <Text
                          element="p"
                          size="xs"
                          className="mt-2 flex-1 leading-relaxed text-[var(--bellum-text-secondary)]"
                        >
                          {t(theme.descriptionKey)}
                        </Text>
                        <span className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--bellum-border)] pt-4">
                          <ThemeFooter theme={theme} />
                          <ChevronRight
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]"
                          />
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </div>
    </FramingPage>
  )
}
