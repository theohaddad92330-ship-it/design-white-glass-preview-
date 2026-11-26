import { Box, Text } from '@bellum/ui'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'

/**
 * #3295.r42 — l'onglet « Perdus » du pipe : les affaires closes à l'étape `lost`.
 *
 * Aucune colonne « Perdus » dans le kanban (`PipelineBoard` : une perte est sortie du pipe, pas rangée au
 * bout) — mais une perte doit rester ATTEIGNABLE : Pilotage compte « 1 perdue » et la leçon (REX, motif)
 * ne se lit que sur la fiche de l'affaire. Une liste, comme « Archivés » ; la porte vers l'écran des retours
 * d'expérience (`/pilotage/rex`, hors barre depuis #4197) est ici. Une absence ne fait AUCUNE ligne.
 */
export function LostProjectsList({ projects }: { projects: readonly ProjectReadinessRow[] }) {
  const { t } = useTranslation('projects')
  const lost = projects.filter(project => project.stage === 'lost')

  if (lost.length === 0) {
    return (
      <Box className="rounded-md border border-dashed border-border p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('lostList.empty')}
        </Text>
      </Box>
    )
  }

  return (
    <div className="space-y-3">
      <Text size="sm" color="text-muted-foreground">
        {t('lostList.intro')}{' '}
        <Link to="/pilotage/rex" className="font-medium underline">
          {t('lostList.rexLink')}
        </Link>
      </Text>
      <ul className="space-y-2" aria-label={t('lostList.listLabel')}>
        {lost.map(project => {
          const closedOn = project.closed_at ? formatDate(project.closed_at) : null
          const reason = project.loss_reason?.trim() || null
          return (
            <li key={project.id} className="rounded-md border border-border bg-card p-3">
              <Link to="/projects/$id" params={{ id: project.id }} className="text-sm font-medium underline">
                {project.label}
              </Link>
              <Text element="p" size="xs" color="text-muted-foreground">
                {[project.company_name, closedOn ? t('lostList.closedOn', { date: closedOn }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {reason ? (
                <Text element="p" size="xs" className="mt-1">
                  {t('lostList.reason', { reason })}
                </Text>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
