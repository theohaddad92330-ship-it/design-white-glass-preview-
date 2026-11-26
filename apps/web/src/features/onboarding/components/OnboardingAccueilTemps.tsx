import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, LauraFace, Text } from '@bellum/ui'

const PILLS = ['guided', 'pace', 'strategy'] as const
const FINALE = ['situation', 'orientations', 'work'] as const
const STEPS = ['where', 'approach', 'follow'] as const
const WHY = ['offer', 'goal', 'limits'] as const
const EXAMPLES = ['sales', 'staffing', 'adv'] as const

/**
 * Théo O onboarding-accueil.R1 — `.ob23-welcome` : UNE carte en deux colonnes.
 * À gauche la promesse, « Commencer » et « Explorer les thèmes », les trois
 * repères cochés et « Ce que deviennent tes réponses » (repli) ; à droite, sur
 * le creux, « Ce que tu retrouves à la fin » en trois lignes numérotées.
 *
 * `start` est absent quand un espace existant doit d'abord être tranché
 * (#2016) ; `meta` porte la durée annoncée (#2013.3) ; `privacy` les six
 * lignes « Tes données, en clair » (#2019), rangées DANS le repli.
 */
export function AccueilBienvenue({
  onStart,
  meta,
  privacy,
}: {
  onStart?: () => void
  meta: ReactNode
  privacy: ReactNode
}) {
  const { t } = useTranslation('onboarding')
  return (
    <section
      data-testid="welcome-card"
      className="grid overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] lg:grid-cols-[1.15fr_1fr]"
    >
      <div className="space-y-6 p-6 md:p-9">
        <Text element="h2" size="2xl" weight="semibold" className="tracking-tight md:text-3xl">
          <span className="block">{t('welcome.v23.headline')}</span>
          <span className="block">{t('welcome.v23.headlineRest')}</span>
        </Text>
        <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
          {t('welcome.v23.intro')}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          {onStart && (
            <Button onClick={onStart}>
              <ArrowRight aria-hidden="true" className="mr-2 h-4 w-4" />
              {t('welcome.v23.start')}
            </Button>
          )}
          <Button asChild variant="plain">
            <Link to="/onboarding/themes">{t('welcome.v23.explore')}</Link>
          </Button>
        </div>
        <div className="space-y-4 border-t border-[var(--bellum-border)] pt-5">
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {PILLS.map(key => (
              <li key={key} className="flex items-center gap-1.5">
                <Check aria-hidden="true" className="h-3.5 w-3.5 text-[var(--bellum-text-accent)]" />
                <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t(`welcome.v23.pills.${key}`)}
                </Text>
              </li>
            ))}
          </ul>
          {meta}
          <details data-testid="welcome-answers">
            <summary className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-xs text-[var(--bellum-text-accent)]">
              <Lock aria-hidden="true" className="h-3.5 w-3.5" />
              {t('welcome.v23.answers.title')}
            </summary>
            <div className="space-y-4 pt-2">
              <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('welcome.v23.answers.body')}
              </Text>
              {privacy}
            </div>
          </details>
        </div>
      </div>

      <aside
        aria-labelledby="accueil-finale"
        className="border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-6 md:p-8 lg:border-l lg:border-t-0"
      >
        <Text
          element="h2"
          id="accueil-finale"
          size="xs"
          weight="semibold"
          className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
        >
          {t('welcome.v23.finale.title')}
        </Text>
        <ol className="mt-6 divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
          {FINALE.map((key, index) => (
            <li key={key} className="flex gap-5 py-6">
              <Text element="span" size="xs" className="pt-1 font-mono text-[var(--bellum-text-muted)]">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <span className="space-y-2">
                <Text element="h3" size="base" weight="semibold">
                  {t(`welcome.v23.finale.${key}.title`)}
                </Text>
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t(`welcome.v23.finale.${key}.description`)}
                </Text>
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </section>
  )
}

/** `.ob23-bottomline` — Laura nommée sous la carte, un filet en dessous. */
export function AccueilLauraLigne() {
  const { t } = useTranslation('onboarding')
  return (
    <div className="flex items-center gap-3 border-b border-[var(--bellum-border)] pb-6">
      <LauraFace size={40} decorative />
      <div>
        <Text size="sm" weight="medium">
          {t('welcome.v23.lauraTag')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('welcome.v23.lauraTagline')}
        </Text>
      </div>
    </div>
  )
}

function PanelFooter({
  onBack,
  next,
  onNext,
  nextHint,
}: {
  onBack: () => void
  next: string
  onNext: () => void
  /** #4970.1 — une phrase sous le bouton : ce que le pas suivant apporte. */
  nextHint?: string
}) {
  const { t } = useTranslation('onboarding')
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--bellum-border)] pt-6">
      <Button variant="plain" onClick={onBack}>
        <ArrowLeft className="mr-2 size-4" aria-hidden />
        {t('welcome.v23.back')}
      </Button>
      <Text size="xs" className="ml-auto text-[var(--bellum-text-muted)]">
        {t('welcome.v23.draftSaved')}
      </Text>
      <div className="flex flex-col items-end gap-1">
        <Button onClick={onNext}>
          <ArrowRight className="mr-2 size-4" aria-hidden />
          {next}
        </Button>
        {nextHint ? (
          <Text
            size="xs"
            data-testid="onboarding-next-hint"
            className="max-w-sm text-right text-[var(--bellum-text-muted)]"
          >
            {nextHint}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

/** Théo O onboarding-accueil.R2 — « Comprendre Bellum » : trois lignes numérotées, et « Pourquoi ces questions ? » en panneau. */
export function AccueilComprendre({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation('onboarding')
  return (
    <div className="space-y-10">
      <div className="grid gap-8 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        <ol className="divide-y divide-[var(--bellum-border)] border-y border-[var(--bellum-border)]">
          {STEPS.map((key, index) => (
            <li key={key} className="flex gap-6 py-7">
              <Text element="span" size="sm" className="pt-1 font-mono text-[var(--bellum-text-accent)]">
                {String(index + 1).padStart(2, '0')}
              </Text>
              <span className="space-y-3">
                <Text element="h2" size="xl" weight="semibold">
                  {t(`welcome.v23.understandPanel.steps.${key}.title`)}
                </Text>
                <Text element="p" size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                  {t(`welcome.v23.understandPanel.steps.${key}.description`)}
                </Text>
              </span>
            </li>
          ))}
        </ol>
        <aside className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6">
          <Text element="h2" size="lg" weight="semibold">
            {t('welcome.v23.understandPanel.whyTitle')}
          </Text>
          <Text element="p" size="sm" className="mt-3 text-[var(--bellum-text-secondary)]">
            {t('welcome.v23.understandPanel.whyIntro')}
          </Text>
          <dl className="mt-5 divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
            {WHY.map(key => (
              <div key={key} className="grid grid-cols-[8rem_1fr] gap-4 py-3.5">
                <dt className="text-xs font-semibold">{t(`welcome.v23.understandPanel.why.${key}.title`)}</dt>
                <dd className="text-sm text-[var(--bellum-text-secondary)]">
                  {t(`welcome.v23.understandPanel.why.${key}.description`)}
                </dd>
              </div>
            ))}
          </dl>
          <Text element="p" size="xs" className="mt-4 text-[var(--bellum-text-muted)]">
            {t('welcome.v23.understandPanel.noTool')}
          </Text>
        </aside>
      </div>
      <PanelFooter onBack={onBack} next={t('welcome.v23.understandPanel.next')} onNext={onNext} />
    </div>
  )
}

/** Théo O onboarding-accueil.R2 — « Ton copilote » : une carte, Laura et ses trois exemples, puis « Tu gardes la main ». */
export function AccueilLaura({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation('onboarding')
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
        <div className="flex flex-col gap-5 p-6 sm:flex-row md:p-7">
          <LauraFace size={64} decorative />
          <div className="space-y-3">
            <Text element="h2" size="xl" weight="semibold">
              {t('welcome.v23.lauraPanel.talkTitle')}
            </Text>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('welcome.v23.lauraPanel.talkIntro')}
            </Text>
          </div>
        </div>
        <ul className="grid border-t border-[var(--bellum-border)] md:grid-cols-3">
          {EXAMPLES.map(key => (
            <li
              key={key}
              className="space-y-3 border-b border-[var(--bellum-border)] p-6 md:border-b-0 md:border-r md:last:border-r-0"
            >
              <Text size="xs" weight="semibold" className="text-[var(--bellum-text-accent)]">
                {t(`welcome.v23.lauraPanel.examples.${key}.label`)}
              </Text>
              <Text size="sm" className="leading-relaxed text-[var(--bellum-text-secondary)]">
                {t(`welcome.v23.lauraPanel.examples.${key}.text`)}
              </Text>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-[var(--bellum-border)] p-6 md:px-7">
          <Text element="h3" size="base" weight="semibold">
            {t('welcome.v23.lauraPanel.controlTitle')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('welcome.v23.lauraPanel.controlBody')}
          </Text>
        </div>
      </section>
      <PanelFooter
        onBack={onBack}
        next={t('welcome.v23.lauraPanel.next')}
        onNext={onNext}
        nextHint={t('welcome.v23.lauraPanel.nextHint')}
      />
    </div>
  )
}
