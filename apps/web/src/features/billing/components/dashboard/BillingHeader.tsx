import { useTranslation } from 'react-i18next'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'

export function BillingHeader() {
  const { t } = useTranslation('billing')
  return <SettingsScreenHeader scope="space" title={t('header.title')} description={t('header.subtitle')} />
}
