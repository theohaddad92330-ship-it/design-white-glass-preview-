import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { ProjectReadRow } from '@bellum/contracts'
import { Text } from '@bellum/ui'

/**
 * #4291.8 — revient sur #4291.8 (décision Louis 02/11) : le suivi d'un projet GAGNÉ vit dans /planning
 * (`PlanningSignedProjects`, où le clic d'une ligne ouvre `WonMissionDetail`). /projects ne parle plus de mission :
 * une ligne courte qui y renvoie. Aucun gagné ⇒ rien (une absence ne fait aucune ligne, jamais « 0 »).
 */
export function WonProjectsInPlanning({ projects }: { projects: readonly ProjectReadRow[] }) {
  const { t } = useTranslation('projects')
  const count = projects.filter(project => project.stage === 'won').length
  if (count === 0) return null
  return (
    <Text element="p" size="sm" className="flex flex-wrap items-center gap-x-2" data-testid="won-projects-in-planning">
      {t('wonInPlanning.title', { count })}
      <Link to="/missions/planification" className="inline-flex min-h-11 items-center gap-1 underline">
        {t('wonInPlanning.link')}
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </Text>
  )
}
