import type { ReactNode } from 'react'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Text } from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { Layers, ListChecks, Radar, SlidersHorizontal, Target, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useManagerStats } from '@/features/manager/hooks/useManagerStats'

type TeamEquipeTab = 'overview' | 'plans' | 'searches' | 'admin'

const TAB_CLASS =
  'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'
const ACTIVE = 'border-[var(--bellum-primary-500)] font-semibold text-[var(--bellum-text-primary)]'
const IDLE = 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]'

const ALL_TEAM = '__all__'

/** Le mois d'objectif affiché dans la barre de contrôle (« Octobre 2026 »). */
interface ObjectivesMonthControl {
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
}

/**
 * Théo D team-member / team-plans / team-recherches / team-review — l'en-tête
 * commun des écrans de l'espace Équipe, dans l'ordre de la maquette : surtitre,
 * titre à point d'accent, phrase, à droite « Préparer le point d'équipe » ; puis
 * la barre des espaces (icône + libellé, compteur d'actions ouvertes) ; puis la
 * barre de contrôle « Portée » (toute l'équipe ou un membre → sa fiche) et,
 * quand l'écran lit des objectifs, « Objectifs » (le mois).
 *
 * La barre ne liste que les espaces qui existent (un onglet mort est pire
 * qu'une absence) : « Objectifs & affaires » et « Activité & échanges » sont
 * portés par un autre lot.
 */
export function TeamEquipeShell({
  active,
  title,
  tagline,
  memberId,
  objectives,
  children,
}: {
  active: TeamEquipeTab
  title: string
  tagline: string
  /** La portée courante : un membre (sa fiche) ou toute l'équipe. */
  memberId?: string
  objectives?: ObjectivesMonthControl
  children: ReactNode
}) {
  const { t } = useTranslation('manager')
  const navigate = useNavigate()
  const { data } = useManagerStats(7)
  const openActions = data?.shared_actions?.open
  const members = data?.members ?? []
  const cls = (tab: TeamEquipeTab) => `${TAB_CLASS} ${active === tab ? ACTIVE : IDLE}`
  const current = (tab: TeamEquipeTab) => (active === tab ? ('page' as const) : undefined)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 space-y-2">
          <Text size="xs" weight="semibold" className="uppercase tracking-widest text-[var(--bellum-text-muted)]">
            {t('equipe.eyebrow')}
          </Text>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--bellum-text-primary)] md:text-5xl">
            {title}
            <span className="text-[var(--bellum-text-accent)]">.</span>
          </h1>
          <Text size="base" className="text-[var(--bellum-text-secondary)]">
            {tagline}
          </Text>
        </div>
        <Button asChild variant="default" icon={Users}>
          <Link to="/team/review/$step" params={{ step: '1' }}>
            {t('equipe.prepareReview')}
          </Link>
        </Button>
      </header>

      <nav
        aria-label={t('board.tabs.label')}
        className="flex gap-1 overflow-x-auto border-b border-[var(--bellum-border)]"
      >
        <Link to="/team" className={cls('overview')} aria-current={current('overview')}>
          <Layers aria-hidden="true" className="size-4" />
          {t('board.tabs.vue')}
        </Link>
        <Link to="/team" search={{ vue: 'plans' }} className={cls('plans')} aria-current={current('plans')}>
          <ListChecks aria-hidden="true" className="size-4" />
          {t('equipe.tabs.plans')}
          {openActions !== undefined && openActions > 0 ? (
            <span className="rounded-md bg-[var(--accent-soft-bg)] px-1.5 text-xs text-[var(--accent-soft-text)]">
              {openActions}
            </span>
          ) : null}
        </Link>
        <Link to="/team" search={{ vue: 'recherches' }} className={cls('searches')} aria-current={current('searches')}>
          <Radar aria-hidden="true" className="size-4" />
          {t('equipe.tabs.searches')}
        </Link>
        <Link to="/settings/team" className={cls('admin')} aria-current={current('admin')}>
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {t('board.tabs.administration')}
        </Link>
      </nav>

      <div role="group" aria-label={t('equipe.control.label')} className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-muted)]">
          <Users aria-hidden="true" className="size-4" />
          {t('equipe.control.scope')}
          <Select
            value={memberId ?? ALL_TEAM}
            onValueChange={next =>
              void navigate(next === ALL_TEAM ? { to: '/team' } : { to: '/team', search: { membre: next } })
            }
          >
            <SelectTrigger aria-label={t('equipe.control.scope')} className="min-h-11 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_TEAM}>{t('equipe.control.allTeam')}</SelectItem>
              {members.map(member => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        {objectives ? (
          <label className="flex items-center gap-2 text-sm text-[var(--bellum-text-muted)]">
            <Target aria-hidden="true" className="size-4" />
            {t('equipe.control.objectives')}
            <Select value={objectives.value} onValueChange={objectives.onChange}>
              <SelectTrigger aria-label={t('equipe.control.objectives')} className="min-h-11 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {objectives.options.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        ) : null}
      </div>

      {children}
    </div>
  )
}
