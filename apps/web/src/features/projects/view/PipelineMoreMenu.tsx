import type { ProjectRow } from '@bellum/contracts'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@bellum/ui'
import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { buildProjectsCsv, type ProjectsExportColumn } from '../lib/projects-export'
import type { ProjectColumnKey } from '../model/project-columns'
import { describeOrigin } from '../model/project-provenance'
import { useOpenNeeds } from '../open-needs/hooks/useOpenNeeds'
import { useNeedsExport } from '../open-needs/hooks/useNeedsExport'

/**
 * #4499 (Louis 23/10) — le menu « … » discret à droite de Kanban | Liste. Il porte les deux exports qui quittent
 * l'en-tête de page : « Exporter » (le CSV de la VUE affichée, #4295.14) et « Exporter pour un partenaire » (les
 * besoins ouverts, sans tarif ni porteur). « Exporter les besoins » vit dans l'onglet Besoins (`NeedsExportButton`).
 *
 * Les deux entrées passent par la règle d'espace « qui peut exporter » (`useDataExit`) : sans autorisation, aucune
 * entrée — et sans entrée, aucun menu (un « … » qui s'ouvre sur du vide est une promesse non tenue).
 */
export function PipelineMoreMenu({
  projects,
  columns,
  ownerName,
}: {
  /** La liste FILTRÉE à l'écran ; `null` hors pipe (perdues, en sommeil, archivées : rien à exporter). */
  projects: readonly ProjectRow[] | null
  columns: readonly ProjectColumnKey[]
  ownerName: (ownerId: string | null) => string | null
}) {
  const { t } = useTranslation('projects')
  const { allowed, grant } = useDataExit()
  const { data } = useOpenNeeds({ offset: 0, limit: 200 })
  const needIds = (data?.data ?? []).map(need => need.id)
  const needsExport = useNeedsExport(needIds)

  const canExportProjects = Boolean(allowed && grant && projects && projects.length > 0)
  const canExportPartner = needsExport.allowed && needIds.length > 0
  if (!canExportProjects && !canExportPartner) return null

  const exportProjects = () => {
    if (!grant || !projects) return
    const csv = buildProjectsCsv(projects, columns, {
      header: (column: ProjectsExportColumn) => t(`export.columns.${column}`),
      stageLabel: stage => t(`stage.states.${stage}`, { defaultValue: stage }),
      originOf: project => describeOrigin(project, t),
      ownerName,
    })
    downloadCSV(csv, `affaires-${new Date().toISOString().slice(0, 10)}.csv`, grant)
    toast.success(t('export.done', { count: projects.length }))
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label={t('pipeTheo.more.label')}
          className="md:shrink-0 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
        >
          <Ellipsis className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {canExportProjects && projects ? (
          <DropdownMenuItem onSelect={exportProjects} title={t('export.hint', { count: projects.length })}>
            {t('export.trigger')}
          </DropdownMenuItem>
        ) : null}
        {canExportPartner ? (
          <DropdownMenuItem
            disabled={needsExport.exporting}
            title={t('openNeeds.export.partnerHint')}
            onSelect={() => void needsExport.exportAs('csv', 'partner')}
          >
            {t('openNeeds.export.partner')}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
