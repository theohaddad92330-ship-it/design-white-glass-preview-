import { useAccount } from '@/features/accounts/hooks/useAccount'
import { useContactsStore } from '@/features/contacts/store/useContactsStore'

type UseCurrentContactResult = ReturnType<typeof useAccount> & {
  currentContact: ReturnType<typeof useContactsStore.getState>['currentContact']
}

export function useCurrentContact(accountId: string): UseCurrentContactResult {
  const accountById = useAccount(accountId)

  const currentContact = useContactsStore(state => state.currentContact)
  const setCurrentContact = useContactsStore(state => state.setCurrentContact)

  if (!accountById.account) {
    if (currentContact !== null) {
      setCurrentContact(null)
    }
  } else {
    const nextCurrentContact = accountById.contacts[0] ?? null
    if (currentContact?.id !== nextCurrentContact?.id) {
      setCurrentContact(nextCurrentContact)
    }
  }

  return {
    ...accountById,
    currentContact,
  }
}
