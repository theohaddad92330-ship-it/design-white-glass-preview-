import { Box, Text } from '@bellum/ui'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * Théo C projects-pipeline.A1 — « En sommeil » : la seconde SORTIE du pipe, avec « Perdue ». Ce n'est pas une colonne
 * du kanban (une affaire en sommeil n'avance pas) mais elle reste atteignable : on la retrouve, on la rouvre depuis sa
 * fiche. Même forme que `LostProjectsList`. Une absence ne fait AUCUNE ligne : pas de date inventée.
 */
export function DormantProjectsList({ projects }: { projects: readonly ProjectReadinessRow[] }) {
  const { t } = useTranslation('projects')
  const dormant = projects.filter(project => project.stage === 'dormant')

  if (dormant.length === 0) {
    return (
      <Box className="rounded-md border border-dashed border-border p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('dormantList.empty')}
        </Text>
      </Box>
    )
  }

  return (
    <div className="space-y-3">
      <Text size="sm" color="text-muted-foreground">
        {t('dormantList.intro')}
      </Text>
      <ul className="space-y-2" aria-label={t('dormantList.listLabel')}>
        {dormant.map(project => {
          const since = project.stage_entered_at ? formatDate(project.stage_entered_at) : null
          return (
            <li key={project.id} className="rounded-md border border-border bg-card p-3">
              <Link to="/projects/$id" params={{ id: project.id }} className="text-sm font-medium underline">
                {project.label}
              </Link>
              <Text element="p" size="xs" color="text-muted-foreground">
                {[project.company_name, since ? t('dormantList.since', { date: since }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
