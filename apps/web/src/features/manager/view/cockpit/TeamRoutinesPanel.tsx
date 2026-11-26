import type { ManagerMemberStats, ManagerRoutinesOverview } from '@bellum/contracts'
import { Badge, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #2399.8 (axe WORKSPACE) — vue manager des routines d'équipe, LECTURE SEULE.
 *
 * `RoutinesController` (réglages personnels) reste `@PersonalScope` : aucune de
 * ses routes ne sert jamais la donnée d'un AUTRE membre. Ce panneau vient donc
 * du MÊME payload que le reste du cockpit (`GET /manager/team-stats`, gardé par
 * `team:manage`), jamais d'une route qui percerait la promesse personnelle.
 *
 * « On n'affiche pas ce qu'on n'a pas » : `routines.members` ne contient déjà
 * que les membres avec au moins un abonnement matérialisé (voir
 * `ManagerService.teamRoutines`) — un membre absent d'ici n'a simplement jamais
 * ouvert Réglages › Routines, ce que ce panneau ne prétend pas savoir de plus.
 */
export function TeamRoutinesPanel({
  routines,
  members,
}: {
  routines: ManagerRoutinesOverview
  members: ManagerMemberStats[]
}) {
  const { t, i18n } = useTranslation('manager')
  // Le libellé de statut (active/en pause/désactivée) existe déjà pour l'écran
  // personnel de réglages (`routines:status.*`) : réutilisé tel quel plutôt que
  // dupliqué dans ce namespace (GA-26, un seul réglage traduit une seule fois).
  const { t: tRoutines } = useTranslation('routines')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const nameOf = (id: string) => members.find(m => m.user_id === id)?.name ?? t('activity.unknownMember')

  if (routines.members.length === 0) return null

  return (
    <section className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('routines.title')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('routines.subtitle')}
      </Text>

      <ul className="mt-3 space-y-3">
        {routines.members.map(member => (
          <li key={member.user_id} className="rounded-lg border border-[var(--bellum-border)] p-3">
            <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {nameOf(member.user_id)}
            </Text>
            <ul className="mt-2 space-y-1.5">
              {member.routines.map(entry => (
                <li key={entry.key} className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text size="xs" className="min-w-0 text-[var(--bellum-text-secondary)]">
                    {entry.name[locale]}
                  </Text>
                  <span className="flex items-center gap-1.5 whitespace-nowrap">
                    <Badge variant={entry.status === 'active' ? 'success' : 'outline'} className="text-xs">
                      {tRoutines(`status.${entry.status}`)}
                    </Badge>
                    {entry.lastFailed ? (
                      <Badge variant="warning" className="text-xs">
                        {t('routines.lastFailed')}
                      </Badge>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
