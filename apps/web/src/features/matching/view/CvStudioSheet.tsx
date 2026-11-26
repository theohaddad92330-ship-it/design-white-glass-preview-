import { Box, ScrollArea, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CvStudioPanel } from '@/features/consultants/view/studio/CvStudioPanel'

/**
 * #2936 (#2176.45, #2176.62) — PRÉPARER LE CV, DEPUIS LE MATCHING.
 *
 * `CvStudioPanel` (§9.1) génère ET rend téléchargeables (docx/pdf) les
 * versions d'un dossier de compétences — déjà écrit pour la fiche talent. Ce
 * lot ne le réécrit pas : il l'ouvre depuis le classement, dans le MÊME
 * patron de panneau que `MatchExplainSheet` (une fiche, jamais deux moteurs
 * pour la même question, GA-26).
 */
export function CvStudioSheet({
  consultantId,
  name,
  onClose,
}: {
  consultantId: string | null
  name: string
  onClose: () => void
}) {
  const { t } = useTranslation('matching')
  if (!consultantId) return null

  return (
    <Sheet open onOpenChange={open => (open ? undefined : onClose())}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">{t('cvStudio.title', { name })}</SheetTitle>
          <SheetDescription>{t('cvStudio.description')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          <Box className="p-5">
            <CvStudioPanel talentId={consultantId} />
          </Box>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
