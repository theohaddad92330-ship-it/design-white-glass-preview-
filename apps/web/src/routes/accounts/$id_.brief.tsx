import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AccountBrief } from '@/features/brief/view/AccountBrief'

export const Route = createFileRoute('/accounts/$id_/brief')({
  component: BriefPage,
})

function BriefPage() {
  const { id } = Route.useParams()
  const { t } = useTranslation('brief')
  return (
    <CustomerPage pageTitle={t('pageTitle')}>
      <AccountBrief accountId={id} />
    </CustomerPage>
  )
}
