import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArchiveRestore } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useArchiveOpportunity } from '../hooks/useArchiveOpportunity'
import { useArchivedProjects } from '../hooks/useArchivedProjects'

/**
 * #4137 — l'onglet « Archivés » du pipe : on archive, on ne supprime pas.
 *
 * Une liste, pas un kanban : un dossier rangé n'a plus d'étape à faire avancer.
 * « Désarchiver » appelle la route existante (`unarchive`) et le dossier retrouve
 * l'étape qu'il portait — `archived_at` seul a bougé. Une absence ne fait AUCUNE
 * ligne ; un échec de lecture ne se lit jamais « aucun archivé ».
 */
export function ArchivedProjectsList() {
  const { t, i18n } = useTranslation('projects')
  const { data, isLoading, isError } = useArchivedProjects()
  const unarchive = useArchiveOpportunity()
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR'

  if (isLoading) {
    return (
      <Text size="sm" color="text-muted-foreground">
        {t('common:states.loading')}
      </Text>
    )
  }
  if (isError) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('archived.loadError')}
        </Text>
      </Box>
    )
  }
  const rows = data ?? []
  if (rows.length === 0) {
    return (
      <Box className="rounded-md border border-dashed border-border p-4">
        <Text size="sm" color="text-muted-foreground">
          {t('archived.empty')}
        </Text>
      </Box>
    )
  }

  return (
    <ul className="space-y-2" aria-label={t('archived.listLabel')}>
      {rows.map(project => {
        // Une date absente ne se dit pas : jamais « archivé aujourd'hui » par défaut.
        const archivedOn = project.archived_at
          ? new Date(project.archived_at).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : null
        return (
          <li
            key={project.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-3"
          >
            <Box className="min-w-0">
              <Link to="/projects/$id" params={{ id: project.id }} className="text-sm font-medium underline">
                {project.label}
              </Link>
              <Text element="p" size="xs" color="text-muted-foreground">
                {[project.company_name, archivedOn ? t('archived.archivedOn', { date: archivedOn }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Box>
            <Button
              variant="outline"
              size="sm"
              icon={ArchiveRestore}
              disabled={unarchive.isPending}
              aria-label={t('archived.unarchiveNamed', { label: project.label })}
              onClick={() => unarchive.mutate({ id: project.id, archived: false })}
            >
              {t('archived.unarchive')}
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
