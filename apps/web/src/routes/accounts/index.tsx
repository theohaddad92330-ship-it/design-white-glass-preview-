import { createFileRoute } from '@tanstack/react-router'
import { accountsSearchSchema } from '@/features/accounts/model/accountsSearch'
import { AccountsPage } from '@/features/accounts/view/AccountsPage'

export const Route = createFileRoute('/accounts/')({
  validateSearch: accountsSearchSchema,
  component: AccountsPage,
})
