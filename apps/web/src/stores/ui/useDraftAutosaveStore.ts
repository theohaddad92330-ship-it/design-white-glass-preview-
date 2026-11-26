import { create } from 'zustand'

interface DraftAutosaveState {
  isSyncing: boolean
  lastSyncedAt: number | null
  setSyncing: (value: boolean) => void
  markSynced: () => void
}

export const useDraftAutosaveStore = create<DraftAutosaveState>(set => ({
  isSyncing: false,
  lastSyncedAt: null,
  setSyncing: value => set({ isSyncing: value }),
  markSynced: () => set({ isSyncing: false, lastSyncedAt: Date.now() }),
}))
