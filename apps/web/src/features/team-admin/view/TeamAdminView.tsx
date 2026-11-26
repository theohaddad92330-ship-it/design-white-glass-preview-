import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hasPermission } from '@bellum/contracts'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { RIGHTS_COLUMNS, RIGHTS_MATRIX, TEAM_PROFILES, type TeamProfile } from '@/features/team-admin/lib/team-profiles'
import { useTeam } from '@/features/team/hooks/useTeam'
import { readPortfolioVisibility } from '@/features/team/portfolio-visibility'
import { PortfolioVisibilityCard } from '@/features/team/view/PortfolioVisibilityCard'
import { TeamMembersPanel } from '@/features/team/view/TeamMembersPanel'
import { TeamPolicyCard } from '@/features/team/view/TeamPolicyCard'

type Tab = 'members' | 'rights' | 'rules'
const TABS: readonly Tab[] = ['members', 'rights', 'rules']

/** Théo D team-admin.N2 — la matrice de droits, lisible : profil × ce que chacun ouvre dans Équipe. */
function RightsMatrix() {
  const { t } = useTranslation('teamAdmin')
  return (
    <Card className="overflow-x-auto overscroll-x-contain p-0">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <caption className="px-4 pt-3 text-left text-xs text-[var(--bellum-text-secondary)]">
          {t('rights.matrixCaption')}
        </caption>
        <thead>
          <tr className="border-b border-[var(--bellum-border)]">
            <th scope="col" className="px-4 py-3">
              {t('rights.profile')}
            </th>
            {RIGHTS_COLUMNS.map(column => (
              <th key={column} scope="col" className="px-4 py-3">
                {t(`rights.columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TEAM_PROFILES.map(profile => (
            <tr key={profile} className="border-b border-[var(--bellum-border)] last:border-b-0">
              <th scope="row" className="px-4 py-3 font-medium">
                {t(`profiles.${profile}`)}
              </th>
              {RIGHTS_COLUMNS.map(column => (
                <td key={column} className="px-4 py-3 text-[var(--bellum-text-secondary)]">
                  {t(`rights.cells.${RIGHTS_MATRIX[profile][column]}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/**
 * Théo D team-admin.N3 — « Essayer une autre vue » : ce que VERRAIT un profil dans Équipe. Une lecture :
 * elle ne change aucun droit, n'agit à la place de personne et n'ouvre jamais une messagerie (distinct de
 * l'usurpation du support, `features/impersonation`).
 */
function ViewAsPreview() {
  const { t } = useTranslation('teamAdmin')
  const [open, setOpen] = useState(false)
  const [profile, setProfile] = useState<TeamProfile | null>(null)

  return (
    <Box className="space-y-3">
      <Button variant="secondary" className="min-h-11" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {t('rights.tryOtherView')}
      </Button>
      {open && (
        <Card className="space-y-3 p-4">
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('rights.previewIntro')}
          </Text>
          <div role="radiogroup" aria-label={t('rights.previewChoose')} className="flex flex-wrap gap-2">
            {TEAM_PROFILES.map(key => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={profile === key}
                className={`min-h-11 rounded-md border px-4 text-sm ${
                  profile === key
                    ? 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-2)] font-semibold'
                    : 'border-[var(--bellum-border)]'
                }`}
                onClick={() => setProfile(key)}
              >
                {t(`profiles.${key}`)}
              </button>
            ))}
          </div>
          {profile && (
            <section aria-label={t('rights.previewRegion')} className="space-y-2">
              <Text size="sm" weight="semibold">
                {t('rights.previewTitle', { profile: t(`profiles.${profile}`) })}
              </Text>
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('rights.previewNote')}
              </Text>
              <ul className="space-y-1">
                {RIGHTS_COLUMNS.map(column => (
                  <li key={column} className="text-sm">
                    {t(`rights.columns.${column}`)} : {t(`rights.cells.${RIGHTS_MATRIX[profile][column]}`)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Card>
      )}
    </Box>
  )
}

/**
 * Équipe › Administration (Théo D team-admin). Trois onglets : les personnes (membres, invitations,
 * rôles, départ — un seul endroit, GA-26), les droits et la visibilité, les règles d'équipe. Le partage de
 * données et le marché de l'espace restent dans Réglages › Équipe.
 */
export const TeamAdminView = memo(function TeamAdminView({
  initialTab = 'members',
}: {
  initialTab?: Tab | 'droits' | 'regles'
}) {
  const { t } = useTranslation('teamAdmin')
  const { team, isLoading, isError } = useTeam()
  const [tab, setTab] = useState<Tab>(
    initialTab === 'droits' ? 'rights' : initialTab === 'regles' ? 'rules' : (initialTab as Tab),
  )

  useLauraContext({
    kind: 'screen',
    label: t('title'),
    entityId: null,
    facets: [{ label: t('laura.tab'), value: t(`tabs.${tab}`) }],
    state: isLoading && !team ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
  })

  const role = team?.workspace.role ?? 'member'
  const canManage = hasPermission(role, 'team:manage')

  return (
    <div className="w-full space-y-6">
      <Box display="flex" className="flex-wrap items-start justify-between gap-3">
        <Box>
          <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('eyebrow')}
          </Text>
          <Text element="h1" size="2xl" weight="bold">
            {t('title')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('subtitle')}
          </Text>
        </Box>
        {team && (
          <Badge variant="secondary" className="text-xs">
            {t('members.seats', { count: team.seats.used, used: team.seats.used, total: team.seats.total })}
          </Badge>
        )}
      </Box>

      <div role="tablist" aria-label={t('tabs.label')} className="flex flex-wrap gap-2">
        {TABS.map(key => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`min-h-11 rounded-md border px-4 text-sm ${
              tab === key
                ? 'border-[var(--bellum-border-strong)] bg-[var(--bellum-surface-2)] font-semibold'
                : 'border-[var(--bellum-border)]'
            }`}
            onClick={() => setTab(key)}
          >
            {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {isError && <ScreenState state="error" message={t('errors.load')} />}
      {isLoading && !team && <ScreenState state="loading" message={t('states.loading')} />}

      {team && tab === 'members' && (
        <section className="space-y-4" aria-label={t('tabs.members')}>
          <Box>
            <Text element="h2" size="xl" weight="bold">
              {t('members.heading')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('members.summary', { count: team.seats.used, used: team.seats.used, total: team.seats.total })}
            </Text>
            <Text size="sm" weight="medium" className="mt-2">
              {t('members.nobodyWaiting')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('members.inviteHint')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('members.roleIsNotConsent')}
            </Text>
          </Box>
          <TeamMembersPanel />
        </section>
      )}

      {team && tab === 'rights' && (
        <section className="space-y-4" aria-label={t('tabs.rights')}>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('rights.intro')}
          </Text>
          <RightsMatrix />
          <PortfolioVisibilityCard
            visibility={readPortfolioVisibility(team.workspace)}
            canManage={team.workspace.role === 'owner'}
          />
          <ViewAsPreview />
          <Card className="space-y-2 p-4">
            <Text size="sm" weight="semibold">
              {t('rights.messagesStayTitle')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('rights.messagesStayBody')}
            </Text>
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/integrations">{t('rights.myIntegrations')}</Link>
            </Button>
          </Card>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('rights.sharingPointer')}{' '}
            <Link to="/settings/team" className="underline">
              {t('rights.sharingLink')}
            </Link>
          </Text>
        </section>
      )}

      {team && tab === 'rules' && (
        <section className="space-y-4" aria-label={t('tabs.rules')}>
          <Box>
            <Text element="h2" size="xl" weight="bold">
              {t('rules.heading')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('rules.intro')}
            </Text>
          </Box>
          {/* Les quatre règles (plages de prospection, créneaux protégés, réunions par jour, objectif d'appels)
              sont celles de la politique d'équipe que Laura applique aux journées — un seul endroit pour les saisir. */}
          <TeamPolicyCard canManage={canManage} />
          <Card className="space-y-2 p-4">
            <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
              {t('rules.oneEngineEyebrow')}
            </Text>
            <Text size="sm" weight="semibold">
              {t('rules.oneEngineTitle')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('rules.oneEngineBody')}
            </Text>
            <Button asChild variant="secondary" className="min-h-11">
              <Link to="/actions/automatisations">{t('rules.seeAutomations')}</Link>
            </Button>
          </Card>
        </section>
      )}
    </div>
  )
})
