import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type Theme = 'dark' | 'light'

interface UIState {
  /**
   * La barre latérale est-elle dépliée ? Persistée : un utilisateur qui replie
   * pour gagner 200 px sur un tableau ne veut pas recommencer à chaque
   * chargement. Lue et écrite par `useSidebarCollapsePreference`
   * (`@/components/sidebar/useSidebarCollapsePreference`), qui est le SEUL
   * endroit où ce réglage circule — un réglage vit à un seul endroit (GA-26).
   */
  sidebarOpen: boolean
  theme: Theme
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setTheme: (theme: Theme) => void
}

/**
 * La clé de stockage, exportée parce que les tests la LISENT.
 *
 * La recopier à la main dans un test donne une garde qui reste verte quand la
 * clé change — le défaut « clé de cache recopiée à la main », déjà vécu ici.
 */
export const SIDEBAR_PREFERENCE_STORAGE_KEY = 'bellum-ui'

/**
 * `localStorage` n'est pas une variable, c'est un appel qui peut ÉCHOUER.
 *
 * Safari en navigation privée, un navigateur réglé pour bloquer les cookies, un
 * quota plein : l'accès lui-même lève une `SecurityError`, et pas seulement
 * l'écriture. Une préférence d'interface ne justifie jamais un écran blanc —
 * sans stockage, on rend le défaut et on continue.
 *
 * `createJSONStorage` de zustand n'entoure QUE l'obtention du stockage, pas les
 * appels `getItem`/`setItem` qui suivent : c'est pourquoi l'enveloppe est ici,
 * autour de chacun d'eux.
 */
const guardedLocalStorage: Storage = {
  get length(): number {
    try {
      return localStorage.length
    } catch {
      return 0
    }
  },
  clear(): void {
    try {
      localStorage.clear()
    } catch {
      /* pas de stockage : la préférence ne vit que le temps de l'onglet */
    }
  },
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  key(index: number): string | null {
    try {
      return localStorage.key(index)
    } catch {
      return null
    }
  },
  removeItem(key: string): void {
    try {
      localStorage.removeItem(key)
    } catch {
      /* idem */
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* idem */
    }
  },
}

export const useUIStore = create<UIState>()(
  persist(
    set => ({
      sidebarOpen: true,
      theme: 'dark',
      toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
      setSidebarOpen: open => set({ sidebarOpen: open }),
      setTheme: theme => set({ theme }),
    }),
    {
      name: SIDEBAR_PREFERENCE_STORAGE_KEY,
      storage: createJSONStorage(() => guardedLocalStorage),
    },
  ),
)
