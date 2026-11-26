import type { ProjectReadRow } from '@bellum/contracts'
import { Box, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { ArrowUpRight, Share2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PrivateSwitch } from '@/components/access/PrivateSwitch'
import { projectQueryKeys } from '../api'
import { useArchiveOpportunity } from '../hooks/useArchiveOpportunity'
import { useExportProjectToCrm } from '../hooks/useExportProjectToCrm'
import { ProjectForecastCategoryControl } from './ForecastCategoryField'
import { ProjectAmountControl } from './ProjectAmountControl'
import { ProjectOwnerControl } from './ProjectOwnerControl'
import { ProjectStageControl } from './ProjectStageControl'
import { SimilarProjectsDialog } from './SimilarProjectsDialog'

/**
 * Théo C projects-fiche.A3/A5/A6/A7 — « MODIFIER » : tout ce que la fiche d'avant posait en panneaux
 * empilés tient dans UNE fenêtre, rien n'est retiré. Changer de porteur (il transfère les tâches ouvertes),
 * la catégorie de prévision — une DÉCLARATION du commercial, sans le moindre chiffre —, l'interrupteur
 * « Privé », le montant, l'étape en entier (les neuf états gouvernés), partager le lien, exporter vers le
 * CRM, archiver / désarchiver (on archive, on ne supprime pas), les affaires similaires et le compte.
 */
export function ProjectEditDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectReadRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const exportToCrm = useExportProjectToCrm()
  const archive = useArchiveOpportunity()
  const [similarOpen, setSimilarOpen] = useState(false)
  const isArchived = Boolean(project.archived_at)

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('edit.title')}</DialogTitle>
            <DialogDescription>{t('edit.description')}</DialogDescription>
          </DialogHeader>
          <Box className="space-y-3">
            <ProjectStageControl opportunity={project} />
            <ProjectOwnerControl opportunity={project} />
            <ProjectForecastCategoryControl opportunity={project} />
            <PrivateSwitch
              kind="projects"
              id={project.id}
              isPrivate={project.is_private}
              invalidate={[projectQueryKeys.all]}
            />
            <ProjectAmountControl opportunity={project} />
            <Box className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 pointer-coarse:min-h-11"
                onClick={() => {
                  const url = `${window.location.origin}/projects/${project.id}`
                  void navigator.clipboard.writeText(url).then(
                    () => toast.success(t('detail.shareCopied')),
                    () => toast.error(t('detail.shareFailed')),
                  )
                }}
              >
                <Share2 className="size-3.5" aria-hidden />
                {t('detail.share')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                disabled={exportToCrm.isPending}
                onClick={() => exportToCrm.mutate(project.id)}
              >
                {exportToCrm.isPending ? t('actions.exporting') : t('actions.exportCrm')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                disabled={archive.isPending}
                onClick={() => archive.mutate({ id: project.id, archived: !isArchived })}
              >
                {isArchived ? t('detail.unarchive') : t('detail.archive')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setSimilarOpen(true)}
              >
                {t('edit.similar')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 pointer-coarse:min-h-11"
                onClick={() => void navigate({ to: '/accounts/$id', params: { id: project.account_id } })}
              >
                {t('detail.openAccount')}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
      <SimilarProjectsDialog
        opportunity={project}
        open={similarOpen}
        onOpenChange={setSimilarOpen}
        onOpenAccount={accountId => void navigate({ to: '/accounts/$id', params: { id: accountId } })}
      />
    </>
  )
}
