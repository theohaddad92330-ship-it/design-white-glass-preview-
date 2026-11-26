import type { Account, Contact } from '@bellum/contracts'
import { AccountDetail } from '@/features/accounts/view/AccountDetail'
import type { TabId } from './AccountDetailTabsBar'
import type { LegacyTabNotice } from '../accountDetailSearch'
import { AccountDetailError } from '@/features/accounts/view/account-detail/states/AccountDetailError'
import { AccountDetailLoading } from '@/features/accounts/view/account-detail/states/AccountDetailLoading'
import { AccountDetailNotFound } from '@/features/accounts/view/account-detail/states/AccountDetailNotFound'

type AccountDetailPageContentProps = {
  account: Account | null
  contacts: Contact[]
  loading: boolean
  loadError: string | null
  initialTab?: TabId
  /** #3720 — voir `AccountDetailPage` : capturée avant tout chargement. */
  legacyTabNotice?: LegacyTabNotice | undefined
}

export function AccountDetailPageContent({
  account,
  contacts,
  loading,
  loadError,
  initialTab,
  legacyTabNotice,
}: AccountDetailPageContentProps) {
  if (loading) {
    return <AccountDetailLoading />
  }

  if (loadError && !account) {
    return <AccountDetailError message={loadError} />
  }

  if (!account) {
    return <AccountDetailNotFound />
  }

  return (
    <AccountDetail account={account} contacts={contacts} initialTab={initialTab} legacyTabNotice={legacyTabNotice} />
  )
}
