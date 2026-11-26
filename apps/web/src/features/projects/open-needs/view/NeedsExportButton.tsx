import { Button } from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNeedsExport } from '../hooks/useNeedsExport'

/**
 * #4295.14 (#4016 L11) — « Exporter » dans l'en-tête de l'écran des besoins : le CSV des besoins VISIBLES (le filtre
 * et la page à l'écran), avec les colonnes de la table. L'export de masse n'existait que dans la barre de sélection,
 * donc invisible tant que rien n'était coché. Même hook, même route gouvernée (`@DataExit()`), même règle d'espace :
 * sans autorisation le bouton n'existe pas (garde `data-exit-hides-export-buttons`), et l'API relit la règle.
 * La route ne voit que l'espace actif : aucune donnée d'un autre espace.
 */
export function NeedsExportButton({ needIds, label }: { needIds: readonly string[]; label?: string }) {
  const { t } = useTranslation('projects')
  const { allowed, exporting, exportAs } = useNeedsExport(needIds)
  if (!allowed || needIds.length === 0) return null
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={exporting}
        title={t('openNeeds.export.hint', { count: needIds.length })}
        aria-label={t('openNeeds.export.ariaLabel', { count: needIds.length })}
        onClick={() => void exportAs('csv')}
        className="gap-1.5 pointer-coarse:min-h-11"
      >
        <Download className="size-4" aria-hidden />
        {label ?? t('openNeeds.export.trigger')}
      </Button>
      {/* Théo C projects-besoins — le même fichier, pour un partenaire : sans tarif ni porteur. */}
      <Button
        size="sm"
        variant="ghost"
        disabled={exporting}
        title={t('openNeeds.export.partnerHint')}
        aria-label={t('openNeeds.export.partnerAriaLabel')}
        onClick={() => void exportAs('csv', 'partner')}
        className="pointer-coarse:min-h-11"
      >
        {t('openNeeds.export.partner')}
      </Button>
    </>
  )
}
