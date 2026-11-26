import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { useMissions } from '@/features/missions/api'
import { useProjectOwners } from '../hooks/useProjectOwners'
import { missionOfProject } from '../model/project-mission'

/**
 * #4291.8 — le suivi PROPRE d'un projet gagné : où en est sa mission, et ce qui reste à faire pour qu'elle existe.
 *
 * Appelé par `PlanningSignedProjects` (clic d'un projet signé) et par `ProjectsPage` (stade `won`) ; une opportunité non
 * gagnée garde `ProjectPropertiesContent` seul. Trois états, jamais un suivi vide : mission trouvée (nommée,
 * ouvrable), aucune mission (dit en clair + le geste qui la crée), missions non lues (statut NOMMÉ non évaluable —
 * ni « à créer » ni nom deviné, sinon on ferait créer un doublon). Montant ou porteur absent se NOMME, jamais « 0 ».
 */
export function WonMissionDetail({ project }: { project: ProjectReadinessRow }) {
  const { t, i18n } = useTranslation('projects')
  const navigate = useNavigate()
  const { ownerName } = useProjectOwners()
  const missions = useMissions({ accountId: project.account_id })
  const mission = missionOfProject(project.id, missions.data?.missions)
  const owner = project.owner_id ? ownerName(project.owner_id) : null
  const cents = project.amount_cents
  const amount =
    typeof cents === 'number' && cents > 0
      ? new Intl.NumberFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }).format(cents / 100)
      : t('pipeline.noAmountYet')

  return (
    <Box data-testid="won-mission-detail" className="space-y-3 px-5 pt-4">
      <Text element="h3" className="text-base font-semibold">
        {t('missionDetail.title')}
      </Text>
      {mission ? (
        <Link
          to="/missions/$id"
          params={{ id: mission.id }}
          className="inline-flex min-h-11 items-center gap-1 text-sm underline"
        >
          {t('detail.trackedAsMission', { name: mission.label })}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      ) : missions.data ? (
        <Box className="space-y-2">
          <Text className="text-sm">{t('missionDetail.none')}</Text>
          <Text className="text-sm text-[var(--text-muted)]">{t('missionDetail.remaining')}</Text>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => void navigate({ to: '/missions/nouvelle', search: { project_id: project.id } })}
          >
            {t('detail.createMission')}
            <ArrowUpRight className="ml-1 size-3.5" aria-hidden />
          </Button>
        </Box>
      ) : (
        <Text className="text-sm text-[var(--text-muted)]">{t('missionDetail.unreadable')}</Text>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-[var(--text-muted)]">{t('missionDetail.engaged')}</dt>
        <dd>{amount}</dd>
        <dt className="text-[var(--text-muted)]">{t('missionDetail.owner')}</dt>
        <dd>{owner ?? t('missionTracking.noOwner')}</dd>
      </dl>
    </Box>
  )
}
