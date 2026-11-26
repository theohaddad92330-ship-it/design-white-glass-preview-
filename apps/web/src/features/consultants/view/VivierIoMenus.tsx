import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Text,
} from '@bellum/ui'
import { Download, Upload } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDataExit } from '@/lib/data-exit'
import { AtsExportButton } from './AtsExportButton'
import { AvailabilityImportDialog } from './AvailabilityImportDialog'
import { BulkExportButton } from './BulkExportButton'
import { CvCsvImportDialog } from './CvCsvImportDialog'
import { CvMailImportDialog } from './CvMailImportDialog'
import { CvSingleImportDialog } from './CvSingleImportDialog'
import { CvZipImportDialog } from './CvZipImportDialog'

/**
 * #3554 / #3556 — UN bouton « Importer » et UN bouton « Exporter », chacun
 * ouvrant une modale qui détaille les options.
 *
 * La barre du Vivier alignait quatre imports et deux exports côte à côte, plus
 * un import de plus dans l'entête : sept boutons pour deux gestes. Décision de
 * Louis (02/10) : deux boutons + modale, pas de menu déroulant, et AUCUNE option
 * supprimée — chaque option garde son dialogue, ses hooks et son rapport ; seul
 * son point d'entrée est déplacé ici. Le dialogue d'une option s'ouvre PAR-DESSUS
 * la modale, qui reste derrière : fermer le rapport ramène au choix.
 */
function OptionRow({ children, description }: { children: ReactNode; description: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {children}
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {description}
      </Text>
    </div>
  )
}

export function VivierImportMenu({ initialOpen = false }: { initialOpen?: boolean }) {
  const { t } = useTranslation('consultants')
  return (
    <Dialog defaultOpen={initialOpen}>
      <DialogTrigger asChild>
        <Button variant="black" icon={Upload}>
          {t('ioMenu.import.cta')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ioMenu.import.title')}</DialogTitle>
          <DialogDescription>{t('ioMenu.import.description')}</DialogDescription>
        </DialogHeader>
        {/* Théo C talents-vivier.R7 / N6 / A1 / A13 — « Importer sans double saisie » : UNE fenêtre, deux blocs.
            D'abord « Dépose des CV ici » (fichiers, dossier, archive, pièce jointe d'e-mail : chaque CV lu crée
            ou complète une fiche qualifiée, l'original est conservé avec son aperçu) ; puis « Objets à importer »
            (profils du vivier en CSV, disponibilités en .csv/.xlsx). Chaque geste garde son propre rapport :
            le CSV est prévisualisé avant tout ajout, rien n'est fusionné sans revue. */}
        <div className="flex flex-col gap-5">
          <section aria-labelledby="vivier-import-cv" className="flex flex-col gap-3">
            <div>
              <Text id="vivier-import-cv" size="sm" weight="semibold">
                {t('ioMenu.import.cvTitle')}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('ioMenu.import.cvBody')}
              </Text>
            </div>
            <OptionRow description={t('ioMenu.import.options.single')}>
              <CvSingleImportDialog />
            </OptionRow>
            <OptionRow description={t('ioMenu.import.options.zip')}>
              <CvZipImportDialog initialOpen={initialOpen} />
            </OptionRow>
            <OptionRow description={t('ioMenu.import.options.mail')}>
              <CvMailImportDialog />
            </OptionRow>
          </section>
          <section aria-labelledby="vivier-import-objects" className="flex flex-col gap-3">
            <div>
              <Text id="vivier-import-objects" size="sm" weight="semibold">
                {t('ioMenu.import.objectsTitle')}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('ioMenu.import.csvPreview')}
              </Text>
            </div>
            <OptionRow description={t('ioMenu.import.options.csv')}>
              <CvCsvImportDialog />
            </OptionRow>
            <OptionRow description={t('ioMenu.import.options.availability')}>
              <AvailabilityImportDialog />
            </OptionRow>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function VivierExportMenu() {
  const { t } = useTranslation('consultants')
  const dataExit = useDataExit()
  // Même règle d'espace que les deux exports qu'il porte : sans sortie de
  // données permise, un bouton « Exporter » ouvrirait une modale vide.
  if (!dataExit.allowed) return null
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" icon={Download}>
          {t('ioMenu.export.cta')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('ioMenu.export.title')}</DialogTitle>
          <DialogDescription>{t('ioMenu.export.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <OptionRow description={t('ioMenu.export.options.ats')}>
            <AtsExportButton />
          </OptionRow>
          <OptionRow description={t('ioMenu.export.options.bulk')}>
            <BulkExportButton />
          </OptionRow>
        </div>
      </DialogContent>
    </Dialog>
  )
}
