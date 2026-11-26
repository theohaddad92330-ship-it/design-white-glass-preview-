import { Button, SettingsRow } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * Rangée « Exporter mes données » — elle RENVOIE, elle ne refait plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE A CHANGÉ (PDF 7 §9.2, `BEL-INT-608` PR1)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'export vit maintenant sur son propre écran, `/settings/mes-donnees`, avec
 * le compte de lignes par objet, le choix CSV ou JSON, et la section « ce que
 * tu n'emportes pas ». Garder ici un second bouton qui déclenche le même export
 * ferait exister le même geste sous deux formes — loi 4 du tome 7 : rien
 * n'apparaît deux fois sous la même forme avec le même contenu. Et surtout,
 * les deux divergeraient : celui-ci ne saurait jamais rendre du CSV.
 *
 * La rangée reste, parce que c'est ici qu'on la cherche quand on pense
 * « données personnelles » — juste à côté de la suppression de compte.
 */
export function DataExportRow() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  return (
    <SettingsRow
      title={t('dataExportTitle')}
      description={t('dataExportDescription')}
      trailing={
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link to="/settings/mes-donnees">
            {t('dataExportOpen')}
            <ArrowRight size={13} className="ml-1.5" aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  )
}
