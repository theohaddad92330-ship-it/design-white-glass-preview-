import { useTranslation } from 'react-i18next'
import { SettingsScreenHeader } from '../SettingsScreenHeader'

/** Header de la page Sécurité — eyebrow, titre, description. */
export function SecurityHeader() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  return (
    <div className="mb-8">
      <SettingsScreenHeader scope="personal" title={t('headerTitle')} description={t('headerDescription')} />
    </div>
  )
}
