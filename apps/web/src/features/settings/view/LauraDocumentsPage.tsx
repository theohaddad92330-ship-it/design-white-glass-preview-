import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { Knowledge, KNOWLEDGE_DOCUMENT_TABS, KNOWLEDGE_STYLE_TABS } from '@/features/knowledge/view/Knowledge'
import { SettingsScreenHeader } from '../components/SettingsScreenHeader'
import { SettingsTabs } from '../components/SettingsTabs'
import type { LauraDocumentTab } from '../model/hub-tabs'

/**
 * RÉGLAGES › LAURA › DOCUMENTS & RÉFÉRENCES (maquette `settings-laura`, Théo V22 — Louis 22/10/2026).
 * Aucun réglage n'est recodé : chaque onglet MONTE la vue qui le porte déjà (GA-26). Fichier à part de la page des
 * routines : la garde « un titre de niveau 1 par écran » lit ce que CHAQUE route rend, et les deux écrans n'ont pas
 * le même titre.
 */

// Théo D settings-laura.R3 / A1 / A2 — Documents & références : « Documents » et « Style & exemples » (styles appris,
// règles proposées, bibliothèque d'exemples). N5 : l'état d'indexation honnête (reçu ≠ extrait ≠ indexé) est le
// `ProcessingStatusBadge` de la table des documents.
/** Documents & références (R3) : « Documents » (ce que Laura peut citer) et « Style & exemples » (ce que tes messages lui ont appris). */
export function LauraDocumentsPage({
  tab,
  onTabChange,
}: {
  tab: LauraDocumentTab
  onTabChange: (tab: LauraDocumentTab) => void
}) {
  const { t } = useTranslation('settingsHub')
  return (
    <Box className="w-full">
      <Box className="mb-5">
        <SettingsScreenHeader scope="space" title={t('documents.title')} description={t('documents.description')} />
      </Box>
      <SettingsTabs
        label={t('documents.label')}
        value={tab}
        onValueChange={onTabChange}
        tabs={[
          {
            key: 'documents',
            label: t('documents.tabs.documents'),
            content: <Knowledge tabs={KNOWLEDGE_DOCUMENT_TABS} />,
          },
          { key: 'style', label: t('documents.tabs.style'), content: <Knowledge tabs={KNOWLEDGE_STYLE_TABS} /> },
        ]}
      />
    </Box>
  )
}
