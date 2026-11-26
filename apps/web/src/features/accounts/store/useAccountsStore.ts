import type { AccountListItem } from '@bellum/contracts'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type AccountsInfiniteScrollStore = {
  cachedAccounts: AccountListItem[]
  setCachedAccounts: (accounts: AccountListItem[]) => void
  clearCachedAccounts: () => void
}

export const useAccountsStore = create<AccountsInfiniteScrollStore>()(
  persist(
    set => ({
      cachedAccounts: [],
      setCachedAccounts: accounts => set({ cachedAccounts: accounts }),
      clearCachedAccounts: () => set({ cachedAccounts: [] }),
    }),
    {
      name: 'accounts-infinite-scroll-cache',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ cachedAccounts: state.cachedAccounts }),
    },
  ),
)
