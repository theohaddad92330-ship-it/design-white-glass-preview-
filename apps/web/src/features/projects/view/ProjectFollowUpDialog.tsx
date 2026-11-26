import type { ProjectReadRow, ProjectStage } from '@bellum/contracts'
import { Box, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCreateTask } from '@/features/tasks/hooks/useTasks'
import { TaskComposer } from '@/features/tasks/view/TaskComposer'

/**
 * Théo C projects-fiche — « SUIVI » : le tiroir des gestes de l'affaire. De trois choix chez Théo à SIX :
 * la prochaine tâche, une note, un rendez-vous (A8), la proposition commerciale et l'appel d'offres (A2),
 * « Mettre en veille ou clore » (N4, à la place de « Perdu » / « En sommeil » du sélecteur d'étape).
 *
 * Aucun geste n'envoie quoi que ce soit : la tâche rejoint Actions, le rendez-vous passe par le même
 * compositeur qu'une tâche datée (aucun connecteur d'agenda n'est supposé), la proposition ouvre la
 * présentation de l'affaire. Clore conserve les présentations, les documents et l'historique ; aucune
 * mission existante n'est annulée.
 */
export function ProjectFollowUpDialog({
  project,
  open,
  onOpenChange,
  onNote,
  onChooseStage,
}: {
  project: ProjectReadRow
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ouvre l'onglet Activité, où la note s'ajoute à l'historique. */
  onNote: () => void
  onChooseStage: (stage: ProjectStage) => void
}) {
  const { t } = useTranslation('projects')
  const createTask = useCreateTask()
  const [composerTitle, setComposerTitle] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)

  const close = () => {
    setClosing(false)
    onOpenChange(false)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : close())}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('followUp.title')}</DialogTitle>
            <DialogDescription>{t('followUp.description')}</DialogDescription>
          </DialogHeader>
          {closing ? (
            <Box className="space-y-2">
              <Text size="xs" color="text-muted-foreground">
                {t('followUp.closeNote')}
              </Text>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  onChooseStage('qualified')
                  close()
                }}
              >
                {t('followUp.resume')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  onChooseStage('dormant')
                  close()
                }}
              >
                {t('followUp.dormant')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  onChooseStage('lost')
                  close()
                }}
              >
                {t('followUp.lost')}
              </Button>
            </Box>
          ) : (
            <Box className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  close()
                  setComposerTitle('')
                }}
              >
                {t('followUp.task')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  close()
                  onNote()
                }}
              >
                {t('followUp.note')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => {
                  close()
                  setComposerTitle(t('detail.meetingDefaultTitle'))
                }}
              >
                {t('followUp.meeting')}
              </Button>
              <Button asChild variant="outline" className="w-full justify-start pointer-coarse:min-h-11">
                <Link to="/propositions" search={{ project: project.id }}>
                  {t('followUp.proposal')}
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start pointer-coarse:min-h-11">
                <Link to="/projects" search={{ lens: 'rfp' }}>
                  {t('followUp.tender')}
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start pointer-coarse:min-h-11"
                onClick={() => setClosing(true)}
              >
                {t('followUp.hold')}
              </Button>
            </Box>
          )}
        </DialogContent>
      </Dialog>
      {composerTitle !== null ? (
        <TaskComposer
          open
          initialTitle={composerTitle}
          onOpenChange={next => setComposerTitle(next ? composerTitle : null)}
          isPending={createTask.isPending}
          onSubmit={draft =>
            createTask.mutate({ ...draft, projectId: project.id }, { onSuccess: () => setComposerTitle(null) })
          }
        />
      ) : null}
    </>
  )
}
