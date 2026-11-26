import type { Contact } from '@bellum/contracts'
import type { GlobalContact } from '@/features/contacts/api'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type ContactsInfiniteScrollStore = {
  cachedContacts: GlobalContact[]
  currentContact: Contact | null
  setCachedContacts: (contacts: GlobalContact[]) => void
  setCurrentContact: (contact: Contact | null) => void
  clearCachedContacts: () => void
}

export const useContactsStore = create<ContactsInfiniteScrollStore>()(
  persist(
    set => ({
      cachedContacts: [],
      currentContact: null,
      setCachedContacts: contacts => set({ cachedContacts: contacts }),
      setCurrentContact: contact => set({ currentContact: contact }),
      clearCachedContacts: () => set({ cachedContacts: [], currentContact: null }),
    }),
    {
      name: 'contacts-infinite-scroll-cache',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({ cachedContacts: state.cachedContacts, currentContact: state.currentContact }),
    },
  ),
)
