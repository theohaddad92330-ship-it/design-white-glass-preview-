import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from 'react'

type ResolvedTheme = 'dark' | 'light'
type Theme = ResolvedTheme | 'system'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (next: Theme) => void
  /** Toggles dark↔light. When called from a click handler, animates the
   *  transition with a circular reveal centered on the cursor (View
   *  Transition API). Falls back to an instant swap on browsers without
   *  `document.startViewTransition`. */
  toggleTheme: (e?: MouseEvent) => void
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void> }
}

const SYSTEM_QUERY = '(prefers-color-scheme: dark)'
const STORAGE_KEY = 'bellum-theme'

const ThemeContext = createContext<ThemeContextValue | null>(null)

function subscribeSystem(notify: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(SYSTEM_QUERY)
  mql.addEventListener('change', notify)
  return () => mql.removeEventListener('change', notify)
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia(SYSTEM_QUERY).matches ? 'dark' : 'light'
}

function readStoredTheme(): Theme | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'dark' || raw === 'light' || raw === 'system' ? raw : null
  } catch {
    // Safari en navigation privée, cookies bloqués : l'accès lui-même lève. Une préférence ne fait jamais un écran blanc.
    return null
  }
}

/**
 * Single source of truth for the app's color scheme. Reads OS preference
 * via `useSyncExternalStore`; a user override is persisted in
 * localStorage. Side-effect: syncs the `dark` class on `<html>` so shadcn
 * tokens and Tailwind `dark:` variants flip globally.
 */
export function ThemeProvider({ children, defaultTheme }: { children: ReactNode; defaultTheme?: Theme }) {
  const system = useSyncExternalStore<ResolvedTheme>(subscribeSystem, getSystemTheme, () => 'light')
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? defaultTheme ?? 'system')
  const resolvedTheme: ResolvedTheme = theme === 'system' ? system : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* le choix vit le temps de l'onglet */
    }
  }, [])

  const toggleTheme = useCallback(
    (e?: MouseEvent) => {
      const next: Theme = resolvedTheme === 'dark' ? 'light' : 'dark'
      const doc = document as DocumentWithViewTransition

      if (!e || !doc.startViewTransition) {
        setTheme(next)
        return
      }

      const x = e.clientX
      const y = e.clientY
      const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

      const transition = doc.startViewTransition(() => {
        setTheme(next)
      })

      void transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
            },
            {
              duration: 500,
              easing: 'ease-in-out',
              pseudoElement: '::view-transition-new(root)',
            },
          )
        })
        // Une transition de vue ABANDONNÉE rejette `ready`. C'est le cas normal
        // quand on bascule le thème puis qu'on navigue aussitôt : le navigateur
        // interrompt l'animation, et sans ce `catch` le rejet remonte en
        // exception non gérée — donc dans la console, et dans Sentry.
        //
        // Le thème, lui, a DÉJÀ changé : `startViewTransition` a exécuté son
        // rappel. Il n'y a donc rien à réparer, seulement une animation qui
        // n'aura pas lieu. Trouvé en recette live le 26/08/2026, en basculant le
        // thème avant de changer d'écran.
        .catch(() => {})
    },
    [resolvedTheme, setTheme],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a <ThemeProvider>')
  return ctx
}
