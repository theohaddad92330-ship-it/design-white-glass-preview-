import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ImportsSourcesContent } from './ImportsSourcesContent'

/** `/contacts/imports` — Théo B c3-imports-sources. */
export function ImportsSourcesPage() {
  const { t } = useTranslation('importWizard')
  return (
    <CustomerPage anchorId="contacts-imports" titleInScreen pageTitle={t('contactsImport.title')}>
      <div className={PAGE_GUTTER_X}>
        <Text size="xs" weight="medium" className="uppercase tracking-wide text-[var(--text-muted)]">
          {t('contactsImport.kicker')}
        </Text>
        <Text element="h1" size="2xl" weight="semibold" className="mb-4 text-[var(--text-primary)]">
          {t('contactsImport.title')}
        </Text>
        <ImportsSourcesContent />
      </div>
    </CustomerPage>
  )
}
