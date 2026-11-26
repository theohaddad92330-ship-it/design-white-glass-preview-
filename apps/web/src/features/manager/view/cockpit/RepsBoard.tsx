import { useState, type ReactNode } from 'react'
import type { ManagerMemberStats } from '@bellum/contracts'
import { workspaceRoleValues } from '@bellum/contracts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useMemberPortfolio } from '@/features/team/hooks/useMemberPortfolio'
import { revealTargetProps } from '@/lib/reveal-target'
import { TEAM_ANCHORS } from './ArbitrationQueue'

/**
 * « Par commercial » — #4158.40 (lot L7, Louis 14/10/2026).
 *
 * La table de l'ancienne section « Équipe », RECENTRÉE sur six colonnes :
 * membre · portefeuille · actions ouvertes · dont en retard · activité de la
 * période · dernier passage. Les colonnes retirées, et où elles vivent :
 *  - « comptes en veille » → une carte « À traiter » (c'est un arbitrage) ;
 *  - comptes créés, contacts, e-mails, analyses → l'ACTIVITÉ de la période les
 *    remplace (un volume tout-temps ne dit rien de cette semaine), et les
 *    analyses sont dans le pouls ;
 *  - opportunités ouvertes → « Revue de pipeline », affaire par affaire, avec
 *    son responsable ;
 *  - crédits → « Adoption › Crédits & usage IA », ventilés sur le cycle.
 *
 * ⚠️ Triée par NOM, jamais par performance (doctrine : aucun classement
 * nominatif) — le service, lui, renvoie les membres par portefeuille ; c'est
 * l'écran qui choisit l'ordre qu'il MONTRE, et il choisit l'alphabet.
 *
 * Sous 768 px, la table devient une liste de cartes (#4158.46) : six colonnes
 * ne tiennent pas sur un téléphone, et un défilement horizontal y cache la
 * moitié de la réponse.
 */
const MEMBER_ROLES: readonly string[] = workspaceRoleValues

/**
 * #2405.8 — un siège SANS activité n'est pas d'emblée un désengagement. Deux
 * causes TECHNIQUES se vérifient avant tout jugement sur la personne : un rôle
 * lecture seule, ou aucun portefeuille attribué.
 */
function inactiveSeatCauses(member: ManagerMemberStats): readonly ('role' | 'noPortfolio')[] {
  const causes: ('role' | 'noPortfolio')[] = []
  if (member.role === 'viewer') causes.push('role')
  if (member.assigned_accounts === 0) causes.push('noPortfolio')
  return causes
}

export function RepsBoard({
  members,
  days,
  children,
}: {
  members: ManagerMemberStats[]
  days: number
  /** Ce qui vit SOUS la table : la file d'actions partagées, le coaching. */
  children?: ReactNode
}) {
  const { t, i18n } = useTranslation('manager')
  const [opened, setOpened] = useState<ManagerMemberStats | null>(null)
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, locale, { sensitivity: 'base' }))

  // `—` = champ absent d'une API plus ancienne : inconnu, jamais un 0 fabriqué.
  const cell = (value: number | undefined) => (typeof value === 'number' ? value : '—')

  const lastSeen = (m: ManagerMemberStats) =>
    m.last_activity_at ? (
      new Date(m.last_activity_at).toLocaleDateString(locale)
    ) : (
      <>
        <span>{'—'}</span>
        {inactiveSeatCauses(m).length > 0 ? (
          <Text size="xs" className="block text-[var(--bellum-text-muted)]">
            {inactiveSeatCauses(m)
              .map(cause => t(`table.inactiveCause.${cause}`))
              .join(' · ')}
          </Text>
        ) : null}
      </>
    )

  const nameButton = (m: ManagerMemberStats) => (
    <button
      type="button"
      aria-label={t('board.reps.open', { name: m.name })}
      onClick={() => setOpened(m)}
      className="min-h-11 rounded-lg text-left text-sm font-semibold text-[var(--bellum-text-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
    >
      {m.name}
    </button>
  )

  const roleLine = (m: ManagerMemberStats) => (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
      {MEMBER_ROLES.includes(m.role) ? t(`roles.${m.role}`) : m.role} · {m.email}
    </Text>
  )

  const columns = {
    portfolio: t('board.reps.columns.portfolio'),
    openActions: t('board.reps.columns.openActions'),
    overdue: t('board.reps.columns.overdue'),
    activity: t('board.reps.columns.activity', { days }),
    lastSeen: t('board.reps.columns.lastSeen'),
  }

  return (
    <section aria-label={t('board.reps.eyebrow')} data-board-block="reps" className="space-y-3">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t('board.reps.eyebrow')}
      </Text>
      <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('board.reps.title', { count: members.length })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('board.reps.sortedByName')}
      </Text>

      <div {...revealTargetProps(TEAM_ANCHORS.members)} className="scroll-mt-4 focus:outline-none">
        {/* ≥ 768 px : la table, pleine largeur (D81 — une liste n'a pas de
            mesure de lecture). */}
        <div className="hidden overflow-hidden rounded-xl border border-[var(--bellum-border)] md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bellum-border)] text-left text-[var(--bellum-text-muted)]">
                <Th>{t('board.reps.columns.member')}</Th>
                <Th align="right">{columns.portfolio}</Th>
                <Th align="right">{columns.openActions}</Th>
                <Th align="right">{columns.overdue}</Th>
                <Th align="right">{columns.activity}</Th>
                <Th>{columns.lastSeen}</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(m => (
                <tr key={m.user_id} className="border-b border-[var(--bellum-border)] last:border-0">
                  <td className="px-3 py-2">
                    {nameButton(m)}
                    {roleLine(m)}
                  </td>
                  <Td align="right">{cell(m.assigned_accounts)}</Td>
                  <Td align="right">{cell(m.open_actions)}</Td>
                  <Td align="right" warn={typeof m.overdue_actions === 'number' && m.overdue_actions > 0}>
                    {cell(m.overdue_actions)}
                  </Td>
                  <Td align="right">{cell(m.period_activity)}</Td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--bellum-text-secondary)]">{lastSeen(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* < 768 px : une carte par personne, même ordre, mêmes six faits. */}
        <ul className="space-y-2 md:hidden">
          {sorted.map(m => (
            <li
              key={m.user_id}
              className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-4 py-3"
            >
              {nameButton(m)}
              {roleLine(m)}
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <Fact label={columns.portfolio}>{cell(m.assigned_accounts)}</Fact>
                <Fact label={columns.openActions}>{cell(m.open_actions)}</Fact>
                <Fact label={columns.overdue}>{cell(m.overdue_actions)}</Fact>
                <Fact label={columns.activity}>{cell(m.period_activity)}</Fact>
                <Fact label={columns.lastSeen}>{lastSeen(m)}</Fact>
              </dl>
            </li>
          ))}
        </ul>
      </div>

      {children}

      {opened ? <MemberPortfolioDialog member={opened} onClose={() => setOpened(null)} /> : null}
    </section>
  )
}

/**
 * Le portefeuille d'un membre — la MÊME lecture que la reprise de portefeuille
 * (`useMemberPortfolio`, `GET /workspaces/members/:userId/portfolio`, gardée
 * `team:manage`), en lecture seule : on regarde, on ne transmet rien d'ici.
 */
function MemberPortfolioDialog({ member, onClose }: { member: ManagerMemberStats; onClose: () => void }) {
  const { t } = useTranslation('manager')
  const { portfolio } = useMemberPortfolio(member.user_id, true)
  return (
    <Dialog open onOpenChange={open => (open ? null : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('board.reps.portfolioTitle', { name: member.name })}</DialogTitle>
          <DialogDescription>{t('board.reps.portfolioDescription', { name: member.name })}</DialogDescription>
        </DialogHeader>
        {portfolio.isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('board.reps.portfolioLoading')}
          </Text>
        ) : null}
        {portfolio.isError ? (
          <Text size="sm" className="text-[var(--danger-soft-text)]">
            {t('board.reps.portfolioFailed')}
          </Text>
        ) : null}
        {portfolio.data ? (
          <ul className="space-y-1">
            {portfolio.data.holdings.map(holding => (
              <li
                key={holding.kind}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--bellum-border)] py-1 last:border-b-0"
              >
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t(`team:handover.kinds.${holding.kind}`)}
                </Text>
                {holding.count === null ? (
                  <UnknownValue reason={t('team:handover.countFailed')} />
                ) : (
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {holding.count}
                  </Text>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          to="/accounts"
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('board.reps.seeAccounts')}
        </Link>
      </DialogContent>
    </Dialog>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="tabular-nums text-[var(--bellum-text-primary)]">{children}</dd>
    </div>
  )
}

// `border-collapse` annule l'espacement entre cellules : sans `px-3`, un nombre
// aligné à droite touche la date alignée à gauche qui le suit.
function Th({ children, align }: { children: ReactNode; align?: 'right' }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-xs font-medium uppercase tracking-wide ${align === 'right' ? 'text-right' : ''}`}
    >
      {children}
    </th>
  )
}

function Td({ children, align, warn = false }: { children: ReactNode; align?: 'right'; warn?: boolean }) {
  return (
    <td
      className={`px-3 py-2 ${warn ? 'text-[var(--warning-soft-text)]' : 'text-[var(--bellum-text-primary)]'} ${align === 'right' ? 'text-right tabular-nums' : ''}`}
    >
      {children}
    </td>
  )
}
