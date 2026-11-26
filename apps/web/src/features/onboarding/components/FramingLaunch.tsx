import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { CircleCheck, Mail, MessageSquare, RefreshCw, UserPlus, Users, Wallet, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Text } from '@bellum/ui'
import { FirstSelectionCard } from '@/features/onboarding/components/FirstSelectionCard'
import { FramingHeading } from '@/features/onboarding/components/FramingLayout'
import { buildFirstExchangePrompt, buildUnderstood, hasDeclaredTools } from '@/features/onboarding/lib/framing-readout'
import { formatDate } from '@/lib/locale'
import { useOnboardingStore } from '@/stores/onboardingStore'

/**
 * Théo O onboarding-lancement — « Entrer dans le produit » : l'écran d'après la
 * validation. Trois gestes, dans cet ordre : relire la demande à Laura (déjà
 * rédigée, modifiable, « Recomposer » la rédige de nouveau), voir une première
 * sélection de comptes, puis les pas qui démarrent ensuite.
 *
 * Le bouton OUVRE un brouillon dans le chat, il ne l'envoie jamais. Aucun outil
 * déclaré n'est connecté, aucun crédit n'est montré : chaque pas renvoie vers
 * l'écran où il se fait, au moment où il sert.
 */
export function FramingLaunch({ validatedAt }: { validatedAt: string | null }) {
  const { t } = useTranslation('onboarding')
  const navigate = useNavigate()
  const answers = useOnboardingStore(s => s.answers)
  const composed = buildFirstExchangePrompt(buildUnderstood(answers, t), t)
  const [edited, setEdited] = useState<string | null>(null)
  const draft = edited ?? composed
  const date = formatDate(validatedAt) ?? null

  const steps: {
    key: string
    title: string
    body: string
    to: '/integrations' | '/settings/team' | '/billing'
    cta: string
  }[] = [
    ...(hasDeclaredTools(answers)
      ? [
          {
            key: 'tools',
            title: t('launch.next.tools.title'),
            body: t('launch.next.tools.body'),
            to: '/integrations' as const,
            cta: t('launch.next.tools.cta'),
          },
        ]
      : []),
    {
      key: 'team',
      title: t('launch.next.team.title'),
      body: t('launch.next.team.body'),
      to: '/settings/team',
      cta: t('launch.next.team.cta'),
    },
    {
      key: 'offer',
      title: t('launch.next.offer.title'),
      body: t('launch.next.offer.body'),
      to: '/billing',
      cta: t('launch.next.offer.cta'),
    },
  ]

  return (
    <div className="space-y-8" data-testid="framing-launch">
      <FramingHeading
        eyebrow={t('launch.eyebrow')}
        title={<span id="launch-title">{t('launch.title')}</span>}
        lead={t('launch.lead')}
      />

      <section
        aria-labelledby="launch-draft-title"
        data-testid="launch-draft"
        className="space-y-5 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
      >
        <Text element="h2" size="xl" weight="semibold" id="launch-draft-title">
          {t('launch.draft.title')}
        </Text>
        <label className="block space-y-1">
          <span className="sr-only">{t('launch.draft.label')}</span>
          <textarea
            value={draft}
            onChange={event => setEdited(event.target.value)}
            rows={12}
            className="w-full rounded-control border border-[var(--bellum-border-strong)] bg-[var(--bellum-bg)] p-5 text-sm leading-relaxed"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void navigate({ to: '/chat', search: { fresh: '1', prompt: draft } })}>
            <MessageSquare aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('launch.draft.open')}
          </Button>
          <Button type="button" variant="plain" onClick={() => setEdited(null)}>
            <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
            {t('launch.draft.recompose')}
          </Button>
        </div>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('launch.draft.note')}
        </Text>
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <FirstSelectionCard />

        <section
          aria-labelledby="launch-next-title"
          data-testid="launch-next"
          className="rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-6"
        >
          <div className="space-y-2">
            <Text
              element="p"
              size="xs"
              weight="semibold"
              className="uppercase tracking-[0.12em] text-[var(--bellum-text-accent)]"
            >
              {t('launch.next.eyebrow')}
            </Text>
            <Text element="h2" size="xl" weight="semibold" id="launch-next-title">
              {t('launch.next.title')}
            </Text>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('launch.next.lead')}
            </Text>
          </div>
          <ul className="mt-5 divide-y divide-[var(--bellum-border)] border-t border-[var(--bellum-border)]">
            <li className="flex items-start gap-4 py-4">
              <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-success-text)]" />
              <span className="min-w-0">
                <Text element="span" size="sm" weight="semibold" className="block">
                  {t('launch.next.validated.title')}
                </Text>
                <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                  {date ? t('launch.next.validated.bodyDated', { date }) : t('launch.next.validated.body')}
                </Text>
              </span>
            </li>
            {steps.map(step => {
              const Icon = STEP_ICONS[step.key] ?? Users
              return (
                <li key={step.key} className="flex items-start gap-4 py-4">
                  <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--bellum-text-muted)]" />
                  <span className="min-w-0 flex-1">
                    <Text element="span" size="sm" weight="semibold" className="block">
                      {step.title}
                    </Text>
                    <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                      {step.body}
                    </Text>
                  </span>
                  <Button asChild variant="plain" size="sm" className="shrink-0">
                    <Link to={step.to}>{step.cta}</Link>
                  </Button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}

const STEP_ICONS: Record<string, LucideIcon> = { tools: Mail, team: UserPlus, offer: Wallet }
