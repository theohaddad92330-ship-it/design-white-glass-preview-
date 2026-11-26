import { create } from 'zustand'
import type { SessionUser } from '@bellum/contracts'

type CurrentUserStore = {
  currentUser: SessionUser | null
  setCurrentUser: (user: SessionUser | null) => void
}

export const useCurrentUserStore = create<CurrentUserStore>(set => ({
  currentUser: null,
  setCurrentUser: user => set({ currentUser: user }),
}))
