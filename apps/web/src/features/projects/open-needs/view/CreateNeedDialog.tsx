import type { NeedProvenance, ProjectNeed } from '@bellum/contracts'
import { Box, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { NeedWizard, NeedWizardTips } from './NeedWizard'

/**
 * LA PORTE MANQUANTE (#1097 bis), DEVENUE UN ASSISTANT (08-creer-un-besoin.png).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE DIALOGUE FAIT GRANDIR
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreateNeedDialog` (30/08/2026) posait un formulaire à deux champs — titre et
 * projet de rattachement — sur `POST /projects/:id/needs`. Cette porte reste la
 * MÊME : le contenu grandit en assistant à quatre étapes (`NeedWizard`), le
 * point d'entrée ne change pas. `OpenNeedsPage` continue de monter CE
 * composant, avec le MÊME bouton « Créer un besoin ».
 *
 * La colonne « Conseils de Laura » (08-creer-un-besoin.png) vit à côté de
 * l'assistant, pas dedans : elle ne dépend d'AUCUNE étape, elle reste visible
 * du début à la fin.
 */
export function CreateNeedDialog({
  open,
  onOpenChange,
  onCreated,
  /** #2942, #2152.17 — voir `NeedWizard.tsx` : posé par `ProjectsPage` à
   *  `'model'` quand ce dialogue s'ouvre depuis la carte « besoin compilé »
   *  de Laura. Absent = pas d'affirmation d'origine. */
  provenance,
  /** #2942 — voir `NeedWizard.tsx` : le titre/contexte compilés par Laura,
   *  posés par `ProjectsPage` depuis la carte `compile_need`. */
  initialTitle,
  initialContext,
  /** #2942 (reste du 26/09) — voir `NeedWizard.tsx` : les compétences (liste
   *  jointe par virgules, même forme que l'aperçu de la carte) et le TJM
   *  compilés par Laura. */
  initialSkills,
  initialTjmCents,
  /** #2942 (recette écran 27/09/2026) — voir `NeedWizard.tsx` : le compte
   *  visé, résolu (`initialAccountId`, un identifiant réel) ou seulement lu
   *  dans la source (`initialAccountName`), compilés par Laura. */
  initialAccountId,
  initialAccountName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Le besoin fraîchement créé — l'écran appelant décide de la suite. */
  onCreated: (need: ProjectNeed) => void
  provenance?: NeedProvenance
  initialTitle?: string
  initialContext?: string
  initialSkills?: string
  initialTjmCents?: number
  initialAccountId?: string
  initialAccountName?: string
}) {
  const { t } = useTranslation('projects')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('openNeeds.createNeed.title')}</DialogTitle>
          <DialogDescription>{t('openNeeds.createNeed.description')}</DialogDescription>
        </DialogHeader>

        <Box display="flex" className="flex-col-reverse gap-4 lg:flex-row">
          <Box className="min-w-0 flex-1">
            <NeedWizard
              onOpenChange={onOpenChange}
              onCreated={onCreated}
              provenance={provenance}
              initialTitle={initialTitle}
              initialContext={initialContext}
              initialSkills={initialSkills}
              initialTjmCents={initialTjmCents}
              initialAccountId={initialAccountId}
              initialAccountName={initialAccountName}
            />
          </Box>
          <NeedWizardTips />
        </Box>
      </DialogContent>
    </Dialog>
  )
}
