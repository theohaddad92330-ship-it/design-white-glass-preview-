import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useMissions } from '@/features/missions/api'
import { missionOfProject } from '../model/project-mission'

/**
 * #4291.8 — un projet GAGNÉ dont la mission existe la NOMME : « Suivi comme mission — <nom> », cliquable.
 *
 * On relie et on nomme, on ne crée rien (doctrine « ce qui n'écrit pas tout seul »). Le lien est
 * `missions.opportunity_id`. Tant que la mission n'est pas lue (chargement, droit absent, erreur), l'appelant garde
 * son geste d'avant (`fallback`) : jamais un nom deviné, jamais une ligne vide.
 */
export function ProjectMissionLink({
  project,
  fallback,
}: {
  project: { id: string; account_id: string }
  fallback: ReactNode
}) {
  const { t } = useTranslation('projects')
  const missions = useMissions({ accountId: project.account_id })
  const mission = missionOfProject(project.id, missions.data?.missions)
  if (!mission) return <>{fallback}</>
  return (
    <Link
      to="/missions/$id"
      params={{ id: mission.id }}
      data-testid="project-mission-link"
      className="inline-flex min-h-11 items-center gap-1 text-sm underline"
    >
      {t('detail.trackedAsMission', { name: mission.label })}
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  )
}
