import { useState } from 'react'
import type { ManagerMemberStats, ManagerSharedActions } from '@bellum/contracts'
import { FilterChips, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatCalendarDate } from '@/lib/deadline'

/**
 * « Actions à traiter (partagées) » — maquette p.11, bloc 8.
 *
 * La délégation d'action existait déjà en base (`action_plan_items.assigned_to`)
 * et à l'écran, mais uniquement action par action, depuis le plan d'UN compte :
 * un manager n'avait aucun moyen de voir la charge d'équipe ni ce qui traîne.
 * Ce bloc lit la file consolidée.
 *
 * Deux principes de lecture :
 * - les compteurs de l'en-tête portent sur la file COMPLÈTE (le dénominateur),
 *   la liste n'en montre que la tête — et le dit quand elle tronque ;
 * - les onglets filtrent la tête de file côté client, sans jamais recalculer un
 *   total : « mes actions » n'affiche pas un compteur qu'on ne connaît pas.
 */
type Tab = 'all' | 'mine' | 'delegated'

export function SharedActionsQueue({
  actions,
  members,
  currentUserId,
}: {
  actions: ManagerSharedActions
  members: ManagerMemberStats[]
  currentUserId: string | null
}) {
  const { t } = useTranslation('manager')
  const [tab, setTab] = useState<Tab>('all')

  const nameOf = (id: string | null) => (id ? (members.find(m => m.user_id === id)?.name ?? id) : null)

  const visible = actions.items.filter(item => {
    if (tab === 'mine') return currentUserId !== null && item.owner_user_id === currentUserId
    if (tab === 'delegated') return currentUserId !== null && item.assigned_to === currentUserId
    return true
  })

  // Une file vide n'est pas un écran vide : c'est une bonne nouvelle, et elle
  // se dit. On la distingue d'un onglet filtré sans résultat.
  const emptyMessage = actions.open === 0 ? t('sharedActions.empty') : t('sharedActions.emptyFiltered')

  return (
    <section className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
          {t('sharedActions.title')}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('sharedActions.summary', {
            open: actions.open,
            overdue: actions.overdue,
            delegated: actions.delegated,
          })}
        </Text>
      </div>

      {/* Les onglets « mes actions » / « déléguées à moi » n'ont de sens que
          pour un utilisateur identifié — sans session, on n'affiche pas des
          filtres qui ne peuvent rien filtrer. */}
      {currentUserId ? (
        <FilterChips
          className="mt-3"
          size="sm"
          ariaLabel={t('sharedActions.title')}
          options={(['all', 'mine', 'delegated'] as const).map(key => ({
            value: key,
            // i18n keys: sharedActions.tabs.all | sharedActions.tabs.mine | sharedActions.tabs.delegated
            label: t(`sharedActions.tabs.${key}`),
          }))}
          value={tab}
          onChange={next => next && setTab(next)}
        />
      ) : null}

      {visible.length === 0 ? (
        <Text size="sm" className="mt-3 text-[var(--bellum-text-secondary)]">
          {emptyMessage}
        </Text>
      ) : (
        <ul className="mt-3 space-y-2">
          {visible.map(item => {
            const assignee = nameOf(item.assigned_to)
            return (
              <li
                key={item.id}
                className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                    {item.label}
                  </Text>
                  {item.overdue ? (
                    <span className="rounded-full bg-[color-mix(in_srgb,var(--bellum-warning-text)_16%,transparent)] px-2 py-0.5 text-xs text-[var(--warning-soft-text)]">
                      {t('sharedActions.badgeOverdue')}
                    </span>
                  ) : null}
                </div>
                <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                  <Link to="/accounts/$id" params={{ id: item.account_id }} className="underline">
                    {item.company_name}
                  </Link>
                  {' · '}
                  {/* Même règle que l'agenda : ce qui n'est pas une date
                      calendaire s'affiche tel quel. `new Date(…)` fabriquait
                      des échéances en 2001 sur « Fri Aug 29 ». */}
                  {item.due_date
                    ? t('sharedActions.due', {
                        date: formatCalendarDate(item.due_date) ?? item.due_date,
                      })
                    : t('sharedActions.noDue')}
                  {' · '}
                  {assignee
                    ? t('sharedActions.assignedTo', { name: assignee })
                    : t('sharedActions.ownedBy', { name: nameOf(item.owner_user_id) ?? item.owner_user_id })}
                </Text>
              </li>
            )
          })}
        </ul>
      )}

      {/* La troncature se DIT : « 15 actions » sous un total de 60 ferait croire
          à une équipe à jour. */}
      {actions.open > actions.items.length ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('sharedActions.truncated', { count: actions.items.length, total: actions.open })}
        </Text>
      ) : null}
    </section>
  )
}
