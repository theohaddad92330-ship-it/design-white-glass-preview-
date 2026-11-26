import { SettingsBlock } from '../components/SettingsBlocks'
import { useTranslation } from 'react-i18next'
import { VivierExportMenu } from '@/features/consultants/view/VivierIoMenus'
import { useDataExit } from '@/lib/data-exit'

/**
 * « Exporter le vivier » — une carte de l'onglet Exports de Mes données (#4532.1/.5, Louis 24/10/2026 ; revient sur
 * #3950 qui lui avait donné une page de Réglages). Le même `VivierExportMenu` (export ATS, export en lot), les mêmes
 * hooks, le même rapport : seule sa destination change. Les deux descriptions de format ne se lisent QUE dans la fenêtre
d'export (#4605.3, GA-26) : les redire ici les affichait deux fois. Masquée quand la règle d'espace refuse la sortie de données
 * (`useDataExit`, inchangé) — ouverte à tout membre que l'API laisse exporter.
 */
export function VivierExportCard() {
  const { t } = useTranslation('consultants')
  const dataExit = useDataExit()
  if (!dataExit.allowed) return null
  return (
    <SettingsBlock
      title={t('ioMenu.export.title')}
      description={t('ioMenu.export.description')}
      action={<VivierExportMenu />}
      testId="vivier-export-block"
      flush
    />
  )
}
