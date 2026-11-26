import { Button } from '@bellum/ui'
import { Upload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImportPortfolioDialog } from './ImportPortfolioDialog'

/**
 * Théo A comptes-import.R1 — la porte « Importer » de Comptes : elle ouvre la
 * modale « Importer dans le portefeuille » (fichier d'exemple · document local ·
 * CRM). C'est l'APPELANT de la modale : sans lui, l'écran serait livré mais
 * introuvable.
 */
export function ImportPortfolioButton() {
  const { t } = useTranslation('importWizard')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" icon={Upload} className="min-h-11" onClick={() => setOpen(true)}>
        {t('portfolio.open')}
      </Button>
      {open ? <ImportPortfolioDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}
