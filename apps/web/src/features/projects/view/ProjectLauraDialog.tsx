import type { ProjectReadRow } from '@bellum/contracts'
import { Box, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { LauraIntroScope } from '@/features/laura/bubble/laura-intro-scope'
import { ProjectSynthesisPanel } from './ProjectSynthesisPanel'

/**
 * Théo C projects-fiche.R8/A4 — « AVEC LAURA » : la réponse courte de Laura sur l'affaire, et la synthèse en
 * sept questions en un REPLI fermé dessous (rien de l'ancien panneau ne se perd). L'approfondissement
 * (« Actualiser et approfondir ») vit dans ce repli, avec son coût dit avant le clic quand il y en a un —
 * jamais de crédits affichés ailleurs. Laura prépare, elle n'écrit rien sur la fiche d'ici.
 */
export function ProjectLauraDialog({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectReadRow
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('projects')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('lauraDialog.title')}</DialogTitle>
          <DialogDescription>{t('lauraDialog.description')}</DialogDescription>
        </DialogHeader>
        {/* GA-283 — un `<AskLaura>` rendu dans une surcouche porte son repère de portée : sans lui, la bulle masquée
            par le dialogue ferait perdre le geste. */}
        <LauraIntroScope>
          <Box className="space-y-3">
            <AskLaura
              label={t('detail.askLauraLabel')}
              question={t('detail.askLauraQuestion', { project: project.label })}
              accountId={project.account_id}
              // #4345.3 — le dialogue se ferme, la bulle s'ouvre sur place : plus de navigation vers /chat?prompt=…
              releaseOverlay={() => onOpenChange(false)}
            />
            <details className="rounded-card border border-[var(--bellum-border)] p-3">
              <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
                <Text element="span" size="sm" weight="medium">
                  {t('lauraDialog.sevenQuestions')}
                </Text>
              </summary>
              <ProjectSynthesisPanel projectId={project.id} />
            </details>
          </Box>
        </LauraIntroScope>
      </DialogContent>
    </Dialog>
  )
}
