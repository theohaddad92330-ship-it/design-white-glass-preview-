import type { BriefingAction, DailyBriefing } from '@bellum/contracts'
import { Box, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Building2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { briefingHeroGesture, briefingHeroSegments, briefingWorstSurfaceState } from '../hero'
import { briefingActionHeadline } from '../lib/action-task-transform'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { PriorityCard } from './PriorityCard'

/**
 * Refonte Théo (A · today-jour, `.v18-callout`) — « COMMENCER ICI ».
 *
 * La carte qui ouvre la file : la PREMIÈRE action de la file unique (triée par
 * urgence), son contexte, et le geste qui la fait avancer. C'est l'ancien « geste
 * principal » de l'en-tête (#2113.10) : quand rien n'est à commencer, la carte
 * propose de réparer l'étape qui manque (#2111.49) ; quand ni l'un ni l'autre
 * n'atterrit, aucun bouton — un bouton qui ne mène nulle part apprend à ne plus
 * faire confiance aux autres.
 *
 * Le résumé du jour (#2113.9) vit ici aussi : des faits comptés, jamais un zéro
 * (GA-18). Le copilote prépare, le commercial avance : rien ne part d'ici.
 */
export function TodayStartCallout({
  data,
  first,
  onOpenMeetingPrep,
}: {
  data: DailyBriefing
  /** La tête de la file unique — `undefined` quand la file est vide. */
  first: BriefingAction | undefined
  /** La porte « Préparer le rendez-vous » de la carte de priorité, ouverte dans le tiroir « Pourquoi ». */
  onOpenMeetingPrep?: (actionId: string) => void
}) {
  const { t } = useTranslation('briefing')
  const [whyOpen, setWhyOpen] = useState(false)
  const segments = briefingHeroSegments(data)
  const decisionCount = data.actions?.length ?? 0
  const repair = first?.href ? null : briefingHeroGesture(briefingWorstSurfaceState(data))
  const account = first?.businessObject?.kind === 'account' ? first.businessObject : null

  return (
    <Box
      as="section"
      aria-labelledby="today-start-title"
      data-testid="today-start"
      className="flex flex-col gap-3 rounded-card border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-5"
    >
      <Text size="xs" weight="semibold" className="uppercase tracking-wider text-[var(--bellum-text-secondary)]">
        {data.firstName ? t('today.start.kickerWithName', { name: data.firstName }) : t('today.start.kicker')}
      </Text>
      <Text id="today-start-title" element="h2" size="xl" weight="semibold">
        {first ? briefingActionHeadline(first, t) : t('today.start.nothing')}
      </Text>
      {first?.context ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t(first.context.labelKey.replace(/^briefing\./, ''), first.context.labelVars)}
        </Text>
      ) : null}
      {segments.length > 0 ? (
        <Text size="sm" weight="medium" data-testid="briefing-hero-summary">
          {segments.map(segment => t(`hero.summary.${segment.key}`, { count: segment.count })).join(' · ')}
        </Text>
      ) : decisionCount === 0 ? (
        <Text size="sm" weight="medium" data-testid="briefing-hero-summary">
          {t('hero.notEnoughContext')}
        </Text>
      ) : null}
      {first || repair ? (
        <Box className="flex flex-wrap items-center gap-2">
          {first?.href ? (
            <Link to={first.href} data-testid="briefing-hero-cta" className="w-fit">
              <Button size="sm">
                <ArrowRight className="size-3.5" aria-hidden="true" />
                {t('today.start.advance')}
              </Button>
            </Link>
          ) : repair ? (
            <Link to={repair.to} search={repair.search} data-testid="briefing-hero-cta" className="w-fit">
              <Button size="sm">
                <ArrowRight className="size-3.5" aria-hidden="true" />
                {t(`surfaceState.gesture.${repair.gesture}`)}
              </Button>
            </Link>
          ) : null}
          {account ? (
            <Link to="/accounts/$id" params={{ id: account.id }} className="w-fit">
              <Button size="sm" variant="ghost">
                <Building2 className="size-3.5" aria-hidden="true" />
                {t('today.start.seeAccount')}
              </Button>
            </Link>
          ) : null}
          {/* Louis 23/10 — ramené de la vue jour PR11 (`StartHereCard`) : « Pourquoi celle-ci ? » ouvre la carte de
              priorité ENTIÈRE dans un tiroir — sa raison, ses axes pesés ET non évaluables nommés, ses gestes de
              report. Le score n'est jamais nu (maquette Théo : « Pourquoi en premier ? »). */}
          {first ? (
            <button
              type="button"
              onClick={() => setWhyOpen(true)}
              className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-secondary)] underline underline-offset-2"
            >
              {t('day.startHere.why')}
            </button>
          ) : null}
        </Box>
      ) : null}
      {first ? (
        <Dialog open={whyOpen} onOpenChange={setWhyOpen}>
          <DialogContent closeLabel={t('day.startHere.close')}>
            <DialogHeader>
              <DialogTitle>{t('day.startHere.whyTitle')}</DialogTitle>
              <DialogDescription>{briefingActionHeadline(first, t)}</DialogDescription>
            </DialogHeader>
            {/* Le repère de portée pose « Demander à Laura » sur CE dossier, pas sur l'écran derrière (GA-283). */}
            <LauraIntroScope>
              <PriorityCard action={first} rank={1} onOpenMeetingPrep={onOpenMeetingPrep} />
            </LauraIntroScope>
          </DialogContent>
        </Dialog>
      ) : null}
    </Box>
  )
}
