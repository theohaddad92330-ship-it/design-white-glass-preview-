import { hasPermission } from '@bellum/contracts'
import { Box } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'

/**
 * Le sélecteur « Moi / Équipe » de « Aujourd'hui » (refonte Théo, 23/10/2026).
 *
 * Tableau de bord et cockpit sont fusionnés sous un seul sélecteur : « Moi » est cette
 * page, « Équipe » est la lecture collective qui existe déjà (`/team`) — aucune route
 * neuve, aucune seconde lecture d'équipe (GA-254). Le sélecteur n'apparaît que pour qui
 * a `team:manage` : un membre sans la permission ne voit pas un lien qui refuserait.
 *
 * Deux liens et non deux onglets d'état : le bouton « Précédent » du navigateur retrouve
 * la bonne vue. Cible ≥ 44 px (GA-32).
 */
export function TodayScopeSwitch({ name }: { name?: string | null } = {}) {
  const { t } = useTranslation('briefing')
  const { team } = useTeam()
  const role = team?.workspace.role ?? 'member'
  if (!hasPermission(role, 'team:manage')) return null
  const base =
    'inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-medium transition-colors duration-immediate ease-bellum-out focus-visible:outline focus-visible:outline-2'
  return (
    <Box
      role="group"
      aria-label={t('scope.label')}
      className="flex w-fit gap-1 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-1"
    >
      <Link to="/briefing" aria-current="page" className={`${base} bg-card text-[var(--bellum-text-accent)]`}>
        {/* Refonte Théo (`.v18-choice`) — l'initiale teintée de qui lit, puis son prénom. */}
        {name ? (
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-full bg-[var(--accent-soft-bg)] text-xs font-semibold text-[var(--accent-soft-text)]"
          >
            {name.trim().charAt(0).toUpperCase()}
          </span>
        ) : null}
        {name?.trim() || t('scope.me')}
      </Link>
      <Link
        to="/team"
        className={`${base} text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]`}
      >
        <Users className="size-4" aria-hidden="true" />
        {t('scope.team')}
      </Link>
    </Box>
  )
}
