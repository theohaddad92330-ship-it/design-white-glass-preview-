import { Text } from '@bellum/ui'
import { Link, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ImportAssistant } from './ImportAssistant'

/** `/contacts/import` — Théo B c4-assistant-import. */
export function ImportAssistantPage() {
  const { t } = useTranslation('importWizard')
  const { source } = useSearch({ from: '/contacts/import' })
  return (
    <CustomerPage anchorId="contacts-import" titleInScreen pageTitle={t('contactsImport.assistant.title')}>
      <div className={`${PAGE_GUTTER_X} max-w-5xl`}>
        <Link
          to="/contacts/imports"
          className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t('contactsImport.assistant.back')}
        </Link>
        <Text element="h1" size="2xl" weight="semibold" className="text-[var(--text-primary)]">
          {t('contactsImport.assistant.title')}
        </Text>
        <Text element="p" size="sm" className="mb-5 mt-1 text-[var(--text-muted)]">
          {t('contactsImport.assistant.lead')}
        </Text>
        <ImportAssistant source={source} />
      </div>
    </CustomerPage>
  )
}
