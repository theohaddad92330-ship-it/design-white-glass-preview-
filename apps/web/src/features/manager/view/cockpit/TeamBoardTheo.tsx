import { useState } from 'react'
import type { ManagerMemberStats, ManagerTeamStats } from '@bellum/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  LauraFace,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Building2, CircleHelp, Clock, GitBranch, ListChecks, MessageSquare } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { appLocale, formatCount, formatDateTime } from '@/lib/locale'
import { useTeamObjectives } from '../../hooks/useObjectives'

/**
 * Théo D team-vue — la vue d'ensemble de l'équipe, telle que la page appliquée
 * la dessine : le cap du mois, les trois priorités, quatre compteurs de STOCK,
 * qui porte quoi, le regard de Laura, les derniers mouvements.
 *
 * Aucun de ces blocs ne calcule une mesure neuve : chacun relit ce que
 * `GET /manager/team-stats` et `GET /objectives/team` servent déjà. Sans
 * donnée, un bloc ne fait AUCUNE ligne — une absence n'est jamais « 0 »
 * (GA-18 / GA-19). Et rien de ce qui s'affiche ici ne classe des personnes :
 * « La répartition du travail, sans classement des personnes ».
 */

const SECTION = 'rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 md:p-6'
const CAP_SECTION = 'rounded-2xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-4 md:p-6'
const EYEBROW = 'uppercase tracking-wide text-[var(--bellum-text-muted)]'
const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

function formatEur(amount: number): string {
  return new Intl.NumberFormat(appLocale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    amount,
  )
}

/**
 * Théo D team-vue.R5 — « Le cap du mois » : le signé des membres qui ont
 * déclaré une cible de chiffre, rapporté à la somme de ces cibles. Un montant
 * absent n'est pas transformé en zéro : sans aucune cible chiffrée, le bloc
 * disparaît (il ne dit pas « 0 % »).
 */
export function TeamCap({ members, detail = true }: { members: ManagerMemberStats[]; detail?: boolean }) {
  const { t, i18n } = useTranslation('manager')
  const team = useTeamObjectives()
  if (!team.isSuccess) return null

  const contributors = team.data.members.filter(
    (m): m is typeof m & { targets: { revenue: number } } => m.targets.revenue !== null && m.targets.revenue > 0,
  )
  if (contributors.length === 0) return null

  const target = contributors.reduce((sum, m) => sum + m.targets.revenue, 0)
  const signed = contributors.reduce((sum, m) => sum + m.achieved.revenue, 0)
  const percent = Math.min(100, Math.round((signed / target) * 100))
  const month = new Intl.DateTimeFormat(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${team.data.period_month.slice(0, 7)}-01T00:00:00Z`))

  return (
    <section aria-label={t('board.cap.region')} data-board-block="cap" className={`${CAP_SECTION} space-y-3`}>
      <div className="flex items-start justify-between gap-3">
        <Text size="xs" weight="semibold" className={EYEBROW}>
          {t('board.cap.eyebrow', { month })}
        </Text>
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label={t('board.cap.helpLabel')}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              <CircleHelp aria-hidden className="size-5" />
            </button>
          </DialogTrigger>
          <DialogContent closeLabel={t('board.cap.helpClose')} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('board.cap.helpTitle')}</DialogTitle>
              <DialogDescription>{t('board.cap.helpBody')}</DialogDescription>
            </DialogHeader>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('board.cap.helpRate')}
            </Text>
          </DialogContent>
        </Dialog>
      </div>
      <Text element="p" className="text-4xl font-semibold tabular-nums text-[var(--bellum-text-primary)] md:text-5xl">
        {formatEur(signed)}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('board.cap.won')}
      </Text>
      <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2">
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('board.cap.declaredTarget')}
        </Text>
        <span className="text-base font-semibold tabular-nums text-[var(--bellum-text-primary)]">
          {formatEur(target)}
        </span>
      </div>
      <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
        <div className="h-full rounded-full bg-[var(--bellum-primary-500)]" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('board.cap.percent', { percent })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('board.cap.remaining', { amount: formatEur(Math.max(0, target - signed)) })}
        </Text>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--accent-soft-border)] pt-3">
        <span className="flex items-center gap-2">
          <span aria-hidden className="flex -space-x-1">
            {contributors.map(member => (
              <span
                key={member.user_id}
                className="flex size-6 items-center justify-center rounded-full border border-[var(--accent-soft-border)] bg-[var(--bellum-surface-1)] text-xs font-semibold text-[var(--bellum-text-primary)]"
              >
                {initialsOf(members.find(m => m.user_id === member.user_id)?.name ?? '?').charAt(0)}
              </span>
            ))}
          </span>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('board.cap.contributors', { count: contributors.length, total: members.length })}
          </Text>
        </span>
        {detail ? (
          <Link to="/team" search={{ onglet: 'objectifs' }} className={LINK_CLASS}>
            {t('board.cap.detail')}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </div>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('board.cap.scope')}
      </Text>
    </section>
  )
}

type Priority = {
  key: string
  title: string
  body: string
  cta: string
  accountId: string
  why: string
}

function buildPriorities(data: ManagerTeamStats, t: TFunction<'manager'>): Priority[] {
  const cards: Priority[] = []

  const overdue = data.shared_actions?.items.find(item => item.overdue)
  if (overdue && data.shared_actions) {
    cards.push({
      key: 'overdue',
      title: t('board.priorities.overdue.title', { count: data.shared_actions.overdue }),
      body: overdue.label,
      cta: t('board.priorities.overdue.cta'),
      accountId: overdue.account_id,
      why: t('board.priorities.overdue.why', { company: overdue.company_name }),
    })
  }

  const review = data.pipeline_review
  const waiting = review?.items.find(item => item.reasons.includes('stuck') || item.reasons.includes('no_activity'))
  if (review && waiting) {
    const stuck = waiting.reasons.includes('stuck')
    cards.push({
      key: 'follow',
      title: waiting.company_name,
      body: waiting.label,
      cta: t('board.priorities.follow.cta'),
      accountId: waiting.account_id,
      why: stuck
        ? t('board.priorities.follow.whyStuck', { days: review.stuck_days })
        : t('board.priorities.follow.whyQuiet', { days: review.inactivity_days }),
    })
  }

  const dateless = review?.items.find(item => item.reasons.includes('no_next_step') && item !== waiting)
  if (dateless) {
    cards.push({
      key: 'dateless',
      title: t('board.priorities.dateless.title'),
      body: `${dateless.company_name} · ${dateless.label}`,
      cta: t('board.priorities.dateless.cta'),
      accountId: dateless.account_id,
      why: t('board.priorities.dateless.why', { company: dateless.company_name }),
    })
  }

  return cards
}

/**
 * Théo D team-vue.R2 — « Là où tu peux aider » : au plus trois cartes, trois
 * verbes (Replanifier · Revoir la suite · Créer la prochaine action) et un
 * « Pourquoi » qui déplie la raison. Chaque carte mène au compte ; rien ne part.
 * Les sujets de structure (doublons, comptes sans responsable, invitations…)
 * vivent dans Objectifs & affaires › Portefeuilles (team-vue.A2).
 */
const PRIORITY_ICONS = { overdue: Clock, follow: Building2, dateless: GitBranch } as const
/** Théo : `urgent` (rouge doux), `opportunity` (accent), `attention` (ambre) — la couleur dit l'état. */
const PRIORITY_TONES = {
  overdue: 'border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
  follow: 'border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
  dateless: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
} as const

export function TeamPriorities({ data }: { data: ManagerTeamStats }) {
  const { t } = useTranslation('manager')
  const [open, setOpen] = useState<string | null>(null)
  const cards = buildPriorities(data, t)
  if (cards.length === 0) return null

  return (
    <section aria-label={t('board.priorities.region')} data-board-block="priorities" className={`${SECTION} space-y-3`}>
      <Text size="xs" weight="semibold" className={EYEBROW}>
        {t('board.priorities.eyebrow')}
      </Text>
      <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('board.priorities.title', { count: cards.length })}
      </Text>
      <div className="divide-y divide-[var(--bellum-border)]">
        {cards.map(card => {
          const expanded = open === card.key
          const Icon = PRIORITY_ICONS[card.key as keyof typeof PRIORITY_ICONS] ?? ListChecks
          return (
            <article key={card.key} data-kind={card.key} className="flex gap-3 py-4 first:pt-1 last:pb-0">
              <span
                aria-hidden
                data-tone={card.key}
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${
                  PRIORITY_TONES[card.key as keyof typeof PRIORITY_TONES] ?? PRIORITY_TONES.dateless
                }`}
              >
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <Text element="h3" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
                  {card.title}
                </Text>
                <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {card.body}
                </Text>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <Link to="/accounts/$id" params={{ id: card.accountId }} className={LINK_CLASS}>
                    <ArrowRight className="size-3.5" aria-hidden />
                    {card.cta}
                  </Link>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`priority-why-${card.key}`}
                    onClick={() => setOpen(expanded ? null : card.key)}
                    className={`${LINK_CLASS} text-[var(--bellum-text-secondary)]`}
                  >
                    {t('board.priorities.whyButton')}
                  </button>
                </div>
                {expanded ? (
                  <Text
                    id={`priority-why-${card.key}`}
                    element="p"
                    size="xs"
                    className="mt-1 text-[var(--bellum-text-secondary)]"
                  >
                    {card.why}
                  </Text>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Théo D team-vue.R3 — les compteurs de STOCK, sans comparaison à la période
 * précédente (le pouls, lui, garde ses écarts dans Activité & échanges). Chaque tuile
 * mène à l'onglet qui détaille son chiffre. Une valeur que l'API ne sert pas ne fait
 * pas de tuile : « Recherches disponibles » attend que les recherches conservées de
 * l'équipe soient ouvertes à la lecture (team-vue.N5).
 */
export function TeamCounters({ data, sharedTopics }: { data: ManagerTeamStats; sharedTopics: number | undefined }) {
  const { t } = useTranslation('manager')
  const actions = data.shared_actions
  const deals = data.pipeline_value?.by_stage.reduce((sum, stage) => sum + stage.total_count, 0)

  const tiles: {
    key: string
    label: string
    value: number
    sub: string
    search: { onglet: 'plans' | 'objectifs' | 'activite'; sous?: 'affaires' | 'echanges' }
    icon: typeof ListChecks
  }[] = []
  if (actions) {
    tiles.push({
      key: 'actions',
      label: t('board.counters.actions'),
      value: actions.open,
      sub:
        actions.overdue > 0 ? t('board.counters.actionsLate', { count: actions.overdue }) : t('board.counters.noLate'),
      search: { onglet: 'plans' },
      icon: ListChecks,
    })
  }
  if (deals !== undefined && deals > 0) {
    tiles.push({
      key: 'deals',
      label: t('board.counters.deals'),
      value: deals,
      sub: t('board.counters.dealsSub'),
      search: { onglet: 'objectifs', sous: 'affaires' },
      icon: GitBranch,
    })
  }
  if (sharedTopics !== undefined) {
    tiles.push({
      key: 'topics',
      label: t('board.counters.topics'),
      value: sharedTopics,
      sub: t('board.counters.topicsSub'),
      search: { onglet: 'activite', sous: 'echanges' },
      icon: MessageSquare,
    })
  }
  if (tiles.length === 0) return null

  return (
    <section aria-label={t('board.counters.region')} data-board-block="counters">
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(tile => {
          const Icon = tile.icon
          return (
            <li key={tile.key}>
              <Link
                to="/team"
                search={tile.search}
                className={`${SECTION} block min-h-11 transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]`}
              >
                <span className="flex items-center justify-between gap-2 text-[var(--bellum-text-secondary)]">
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden className="size-4" />
                    <Text size="sm" weight="medium" className="text-[var(--bellum-text-secondary)]">
                      {tile.label}
                    </Text>
                  </span>
                  <ArrowRight aria-hidden className="size-4" />
                </span>
                <Text
                  element="p"
                  className="mt-3 text-4xl font-semibold tabular-nums text-[var(--bellum-text-primary)]"
                >
                  {formatCount(tile.value)}
                </Text>
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {tile.sub}
                </Text>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function initialsOf(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/**
 * Théo D team-vue.R4 — « Qui porte quoi » : UNE LIGNE PAR PERSONNE (comptes,
 * affaires, actions ouvertes, en retard, signé sur la cible), triées par nom — jamais par
 * performance. Un compteur que l'API ne sert pas s'écrit « — », jamais 0. Une personne sans
 * rien de signé dit « Rien de signé » : une absence ne s'écrit pas 0. Chaque ligne mène au
 * portefeuille de la personne (Objectifs & affaires › Portefeuilles).
 */
export function TeamWhoCarries({ members }: { members: ManagerMemberStats[] }) {
  const { t, i18n } = useTranslation('manager')
  const objectives = useTeamObjectives()
  if (members.length === 0) return null
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))
  const num = (value: number | undefined) => (typeof value === 'number' ? formatCount(value) : '—')
  const progressOf = (id: string) => objectives.data?.members.find(entry => entry.user_id === id)

  return (
    <section aria-label={t('board.who.title')} data-board-block="who" className={`${SECTION} space-y-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('board.who.title')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('board.who.subtitle')}
          </Text>
        </div>
        <Link to="/team" search={{ onglet: 'objectifs', sous: 'portefeuilles' }} className={LINK_CLASS}>
          {t('board.who.portfolios')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      <ul className="divide-y divide-[var(--bellum-border)]">
        {sorted.map(member => {
          const progress = progressOf(member.user_id)
          const target = progress?.targets.revenue ?? null
          const signed = progress?.achieved.revenue ?? null
          return (
            <li key={member.user_id}>
              <Link
                to="/team"
                search={{ onglet: 'objectifs', sous: 'portefeuilles' }}
                aria-label={t('board.who.open', { name: member.name })}
                className="flex min-h-11 flex-wrap items-center gap-x-5 gap-y-2 py-4 hover:bg-[var(--bellum-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
              >
                <span className="flex min-w-[10rem] flex-1 items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft-bg)] text-sm font-semibold text-[var(--accent-soft-text)]"
                  >
                    {initialsOf(member.name).charAt(0)}
                  </span>
                  <Text
                    element="h3"
                    size="sm"
                    weight="semibold"
                    className="min-w-0 truncate text-[var(--bellum-text-primary)]"
                  >
                    {member.name}
                  </Text>
                </span>
                <span className="flex gap-5 text-xs text-[var(--bellum-text-secondary)]">
                  <span>
                    <strong className="block text-base text-[var(--bellum-text-primary)]">
                      {num(member.assigned_accounts)}
                    </strong>
                    {t('board.who.accounts')}
                  </span>
                  <span>
                    <strong className="block text-base text-[var(--bellum-text-primary)]">
                      {num(member.opportunities)}
                    </strong>
                    {t('board.who.deals')}
                  </span>
                </span>
                <span className="min-w-[10rem] text-xs text-[var(--bellum-text-secondary)]">
                  <strong className="block text-sm text-[var(--bellum-text-primary)]">
                    {typeof member.open_actions === 'number'
                      ? t('board.who.openActions', { count: member.open_actions })
                      : '—'}
                  </strong>
                  {typeof member.overdue_actions !== 'number'
                    ? t('board.who.lateUnknown')
                    : member.overdue_actions > 0
                      ? t('board.who.late', { count: member.overdue_actions })
                      : t('board.counters.noLate')}
                </span>
                {target !== null && target > 0 ? (
                  <span className="min-w-[8rem] text-right text-xs text-[var(--bellum-text-secondary)]">
                    <strong className="block text-sm tabular-nums text-[var(--bellum-text-primary)]">
                      {signed !== null && signed > 0 ? formatEur(signed) : t('board.who.nothingSigned')}
                    </strong>
                    {t('board.who.onTarget', { amount: formatEur(target) })}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Théo D team-vue.R7 — « Le regard de Laura » : une phrase GABARITÉE depuis les
 * mêmes chiffres que le reste de la page — aucun appel au modèle, donc aucun
 * coût à annoncer. Rien à lire : aucune ligne.
 */
export function TeamLauraGlance({ data }: { data: ManagerTeamStats }) {
  const { t } = useTranslation('manager')
  const overdue = data.shared_actions && data.shared_actions.overdue > 0 ? data.shared_actions.overdue : null
  const waiting = data.pipeline_review && data.pipeline_review.total > 0 ? data.pipeline_review.total : null
  if (overdue === null && waiting === null) return null

  return (
    <section aria-label={t('board.glance.region')} data-board-block="glance" className={`${CAP_SECTION} space-y-2`}>
      <div className="flex items-center gap-3">
        <LauraFace decorative size={40} className="rounded-full" />
        <div>
          <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
            {t('board.glance.region')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('board.glance.computed')}
          </Text>
        </div>
      </div>
      <Text element="h3" size="base" weight="semibold" className="pt-2 text-[var(--bellum-text-primary)]">
        {overdue !== null ? t('board.glance.overdue.title') : t('board.glance.follow.title')}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {overdue !== null
          ? t('board.glance.overdue.body', { count: overdue })
          : t('board.glance.follow.body', { count: waiting })}
      </Text>
      <Link
        to="/team/review/$step"
        params={{ step: '1' }}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent-soft-border)] text-sm font-medium text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        <ArrowRight className="size-4" aria-hidden />
        {t('board.glance.cta')}
      </Link>
    </section>
  )
}

const LAST_MOVES = 3

/**
 * Théo D team-vue.R6 — « Derniers mouvements » : les trois derniers gestes de
 * l'équipe, la société en lien ; « Tout voir » mène au journal complet
 * (Activité & échanges).
 */
export function TeamLastMoves({ data }: { data: ManagerTeamStats }) {
  const { t } = useTranslation('manager')
  const items = data.period_activity?.items.slice(0, LAST_MOVES) ?? []
  if (items.length === 0) return null
  const nameOf = (id: string | null) =>
    (id ? data.members.find(m => m.user_id === id)?.name : null) ?? t('activity.unknownMember')

  return (
    <section aria-label={t('board.moves.title')} data-board-block="moves" className={`${SECTION} space-y-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('board.moves.title')}
        </Text>
        <Link to="/team" search={{ onglet: 'activite', sous: 'journal' }} className={LINK_CLASS}>
          {t('board.moves.all')}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
      {items.map(event => (
        <article
          key={event.id}
          className="space-y-0.5 border-t border-[var(--bellum-border)] pt-3 first:border-0 first:pt-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
              {nameOf(event.user_id)}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {formatDateTime(event.created_at)}
            </Text>
          </div>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(`activity.events.${event.action_type}`, { defaultValue: t('activity.events.unknown') })}
          </Text>
          {event.account_id && event.company_name ? (
            <Link to="/accounts/$id" params={{ id: event.account_id }} className={LINK_CLASS}>
              {event.company_name}
            </Link>
          ) : null}
        </article>
      ))}
    </section>
  )
}
