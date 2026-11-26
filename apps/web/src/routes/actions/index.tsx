import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ActionHistoryPage } from '@/features/action-history/view/ActionHistoryPage'
import { actionHistorySearchSchema } from '@/features/action-history/actionHistorySearch'

export const Route = createFileRoute('/actions/')({
  validateSearch: actionHistorySearchSchema,
  component: ActionsRoute,
})

function ActionsRoute() {
  const { t } = useTranslation('routes')
  return (
    <CustomerPage
      anchorId="actions"
      titleInScreen
      pageTitle={t('actions.pageTitle')}
      contentClassName="flex min-h-full flex-col px-0 py-0"
    >
      <ActionHistoryPage />
    </CustomerPage>
  )
}
