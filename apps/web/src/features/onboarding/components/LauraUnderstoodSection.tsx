import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Download, FileText, PenLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { FRAMING_DECISIONS, type FramingDecision, type FramingOrientationId } from '@bellum/contracts'
import { Button, SelectField, Text } from '@bellum/ui'
import { FramingExportDialog } from '@/features/onboarding/components/FramingExportDialog'
import { onboardingQuestionRevealId } from '@/features/onboarding/components/SubStepQuestions'
import {
  buildContextGrid,
  buildOrientations,
  buildPointsToDecide,
  buildThreadFacts,
} from '@/features/onboarding/lib/framing-readout'
import type { Question } from '@/features/onboarding/lib/questions'
import { THEMES, type Theme } from '@/features/onboarding/lib/theme-catalog'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

const THEME_OF_KEY = new Map<string, { theme: Theme; question: Question }>(
  THEMES.flatMap(theme => theme.questions.map(q => [q.key, { theme, question: q }] as const)),
)

type Props = {
  answers: OnboardingAnswers
  /** Le prénom déclaré (« Comment souhaites-tu que Laura t'appelle ? ») ; absent, le titre ne nomme personne. */
  firstName: string | null
  /** Le nombre de repères renseignés — jamais affiché à zéro. */
  answeredCount: number
  validated: boolean
  decisions: Partial<Record<FramingOrientationId, FramingDecision>>
  onDecide: (orientation: FramingOrientationId, decision: FramingDecision) => void
  decisionPending: boolean
  /** « Corriger mon contexte » : la première question modifiable, jamais un renvoi deviné. */
  onCorrect: (() => void) | null
}

/**
 * Théo O onboarding-relecture.R4 — « Ce que Laura a compris », la seconde moitié
 * de la relecture (la stratégie). Laura parle à la première personne : « voici
 * le cap que je te propose ». Puis l'objectif déclaré et le premier geste, et
 * les orientations à retenir, chacune avec sa décision (enregistrée), son
 * premier geste et les réponses qui la motivent.
 *
 * Les six lignes lues sur les réponses vivent dans la grille « Ton contexte »,
 * en tête de page (une donnée à un seul endroit) ; les points à trancher, dans
 * « Les points à clarifier » (`PointsToDecide`).
 */
export function LauraUnderstoodSection({
  answers,
  firstName,
  answeredCount,
  validated,
  decisions,
  onDecide,
  decisionPending,
  onCorrect,
}: Props) {
  const { t } = useTranslation('onboarding')
  const [exportOpen, setExportOpen] = useState(false)
  const orientations = buildOrientations(answers)
  const facts = buildThreadFacts(answers, t)
  const horizon = buildContextGrid(answers, t).find(cell => cell.key === 'horizon')?.value ?? null
  const firstMove = orientations[0] ? t(`orientation.${orientations[0].id}.firstMove`) : null

  return (
    <section aria-labelledby="understood-title" className="space-y-10" data-testid="review-understood">
      <header className="space-y-5 border-b border-[var(--bellum-border)] pb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-3">
            <Text
              element="p"
              size="xs"
              weight="semibold"
              className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
            >
              {t('understood.heading')}
            </Text>
            <Text element="h2" size="3xl" weight="semibold" id="understood-title" className="tracking-tight">
              {firstName ? t('understood.v23.title', { name: firstName }) : t('understood.v23.titleNoName')}
            </Text>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {facts.company ? `${facts.company} · ${t('understood.v23.lead')}` : t('understood.v23.lead')}
            </Text>
          </div>
          <Button type="button" variant="plain" onClick={() => setExportOpen(true)}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('framingBar.export')}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <FileText aria-hidden="true" className="h-4 w-4 text-[var(--bellum-text-accent)]" />
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {validated ? t('understood.v23.applied') : t('understood.v23.draft')}
            </Text>
          </span>
          {answeredCount > 0 && (
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t('understood.v23.count', { count: answeredCount })}
            </Text>
          )}
        </div>
      </header>

      {(facts.goal || facts.offer || facts.territory || horizon || firstMove) && (
        <div className="grid gap-8 border-b border-[var(--bellum-border)] pb-8 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-3">
            <Text
              element="p"
              size="xs"
              weight="semibold"
              className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
            >
              {t('understood.v23.goalEyebrow')}
            </Text>
            <Text element="h3" size="2xl" weight="semibold">
              {facts.goal ?? t('understood.toSpecify')}
            </Text>
            {(facts.offer || facts.territory) && (
              <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                {[
                  facts.offer ? t('understood.v23.offerLine', { offer: facts.offer }) : null,
                  facts.territory ? t('understood.v23.territoryLine', { territory: facts.territory }) : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
              </Text>
            )}
            {horizon && (
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('understood.v23.horizonLine', { horizon })}
              </Text>
            )}
          </div>
          {(firstMove || onCorrect) && (
            <div className="space-y-3 border-l-2 border-[var(--bellum-primary)] pl-6">
              {firstMove && (
                <>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-accent)]">
                    {t('understood.v23.firstMove')}
                  </Text>
                  <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                    {firstMove}
                  </Text>
                </>
              )}
              {onCorrect && (
                <Button type="button" variant="plain" onClick={onCorrect}>
                  <PenLine aria-hidden="true" className="mr-2 h-4 w-4" />
                  {t('understood.v23.correct')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {orientations.length > 0 && (
        <div data-testid="review-orientations">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--bellum-border)] pb-5">
            <Text element="h3" size="xl" weight="semibold">
              {t('orientation.heading')}
            </Text>
            <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('orientation.intro')}
            </Text>
          </div>
          <ol className="divide-y divide-[var(--bellum-border)] border-b border-[var(--bellum-border)]">
            {orientations.map((orientation, index) => {
              const title = t(`orientation.${orientation.id}.title`)
              const current = decisions[orientation.id]
              return (
                <li
                  key={orientation.id}
                  data-orientation={orientation.id}
                  className="grid gap-4 py-7 md:grid-cols-[2rem_minmax(0,1fr)_10rem] md:gap-6"
                >
                  <Text element="span" size="xs" className="pt-1.5 font-mono text-[var(--bellum-text-accent)]">
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                  <div className="min-w-0 space-y-4">
                    <Text element="h4" size="lg" weight="semibold">
                      {title}
                    </Text>
                    <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                      {t(`orientation.${orientation.id}.why`)}
                    </Text>
                    <div className="space-y-2 rounded-control border-l-2 border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-1)] px-4 py-4">
                      <Text
                        element="p"
                        size="xs"
                        weight="semibold"
                        className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
                      >
                        {t('orientation.firstMove')}
                      </Text>
                      <Text element="p" size="sm">
                        {t(`orientation.${orientation.id}.firstMove`)}
                      </Text>
                    </div>
                    <details>
                      <summary className="flex min-h-11 w-fit cursor-pointer items-center text-xs text-[var(--bellum-text-secondary)]">
                        {t('orientation.evidence')}
                      </summary>
                      <ul className="space-y-1">
                        {orientation.evidenceKeys.map(key => {
                          const found = THEME_OF_KEY.get(key)
                          if (!found) return null
                          return (
                            <li key={key}>
                              <Link
                                to="/onboarding/themes/$themeId"
                                params={{ themeId: found.theme.slug }}
                                hash={onboardingQuestionRevealId(key)}
                                className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] hover:underline"
                              >
                                {t(found.question.label)}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </details>
                  </div>
                  <div className="space-y-1.5">
                    <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                      {t('framingDecision.short')}
                    </Text>
                    <SelectField
                      size="sm"
                      value={current ?? undefined}
                      onChange={next => !decisionPending && onDecide(orientation.id, next as FramingDecision)}
                      options={FRAMING_DECISIONS.map(decision => ({
                        value: decision,
                        label: t(`framingDecision.${decision}`),
                      }))}
                      placeholder={t('framingDecision.placeholder')}
                      ariaLabel={t('framingDecision.label', { title })}
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      )}
      <FramingExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </section>
  )
}

/** « Les points à trancher » : ce qui reste ouvert, chacun avec son lien pour y répondre (relecture.N6/N7). */
export function PointsToDecide({ answers }: { answers: OnboardingAnswers }) {
  const { t } = useTranslation('onboarding')
  const points = buildPointsToDecide(answers, t)
  if (points.length === 0) return null
  return (
    <div className="space-y-2" data-testid="review-points-to-decide">
      <Text element="h3" size="sm" weight="semibold">
        {t('pointsToDecide.heading')}
      </Text>
      <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('pointsToDecide.intro')}
      </Text>
      <ul>
        {points.map(point => (
          <li key={point.key}>
            <Link
              to="/onboarding/themes/$themeId"
              params={{ themeId: point.themeSlug }}
              className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--bellum-text-accent)] hover:underline"
            >
              {t(point.labelKey)}
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
