import { useAccountsStore } from '@/features/accounts/store/useAccountsStore'
import { useContactsStore } from '@/features/contacts/store/useContactsStore'
import { clearAllChatDrafts } from '@/features/chat/lib/composer-draft'
import { clearAllDiscoverCaches } from '@/features/discover/lib/discover-cache'
import { clearCacheDb } from '@/lib/cache/idb/schema'
import { queryClient } from '@/lib/query-client'
import { useAnalysisStore } from '@/stores/analysisStore'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { useProfilerProgressStore } from '@/stores/profilerProgressStore'

const USER_LOCAL_STORAGE_KEYS = [
  'accounts-infinite-scroll-cache',
  'contacts-infinite-scroll-cache',
  'bellum:analysis-runs',
] as const

export function clearVolatileUserState(): void {
  queryClient.clear()
  useAccountsStore.setState({ cachedAccounts: [] })
  useContactsStore.setState({ cachedContacts: [], currentContact: null })
  useAnalysisStore.setState({ runs: {} })
  useOnboardingStore.getState().reset()
  useProfilerProgressStore.getState().reset()
  useCurrentUserStore.getState().setCurrentUser(null)
  USER_LOCAL_STORAGE_KEYS.forEach(key => localStorage.removeItem(key))
  // #1953.15-.18 — le brouillon de la saisie de Laura reste des données de
  // COMPTE (il porte l'identifiant de l'utilisateur, voir `composer-draft.ts`),
  // pas une préférence de poste : il doit partir à la déconnexion, comme le
  // reste de cette fonction, plutôt qu'attendre sa propre expiration à 7 jours.
  clearAllChatDrafts()
  // #3880.5 — la shortlist Découvrir (« Suivre »/« Écarter ») et la marque
  // d'import des recherches archivées (`discover-saved-searches.ts`) ne sont
  // scopées QUE par utilisateur (`discover-storage.ts`), jamais par espace.
  // Sans cette ligne, un changement d'espace (`useWorkspaces.switchWorkspace`)
  // ou une déconnexion laissaient ce travail traverser la frontière — même
  // défaut que le scroll infini des comptes/contacts, déjà corrigé ici pour
  // eux par #2644.1 (GA-43), jamais étendu à Découvrir.
  clearAllDiscoverCaches()
}

export async function clearClientUserState(): Promise<void> {
  clearVolatileUserState()
  await clearCacheDb().catch(error => {
    console.warn('[auth] Unable to clear IndexedDB user cache:', error)
  })
}
