import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { useNavigate } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CvDropZone } from './CvDropZone'

/**
 * #3811 — « Importer » ne proposait que CSV, archive, e-mail et disponibilités :
 * déposer UN CV ou UN dossier de compétences (PDF, DOCX) obligeait à passer par
 * « Ajouter un consultant ». Même flux, même dépôt (`CvDropZone`, donc mêmes
 * refus nommés, même détection de doublon, même fiche à relire) — une seconde
 * porte, pas un second mécanisme. La fiche créée s'ouvre, où la lecture et la
 * revue du CV l'attendent.
 */
export function CvSingleImportDialog() {
  const { t } = useTranslation('consultants')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button variant="outline" size="sm" icon={FileText} onClick={() => setOpen(true)}>
        {t('batchImport.single.cta')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('batchImport.single.title')}</DialogTitle>
            <DialogDescription>{t('batchImport.single.description')}</DialogDescription>
          </DialogHeader>
          <CvDropZone
            onCreated={id => {
              setOpen(false)
              void navigate({ to: '/consultants/$id', params: { id } })
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
