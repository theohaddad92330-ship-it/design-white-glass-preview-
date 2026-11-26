import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MOBILE_HOME } from '@/features/mobile/mobile-nav'
import { isMobileNow } from '@/features/mobile/useIsMobile'

/**
 * User-facing interface preferences that live entirely client-side (no backend
 * round-trip) and are persisted in localStorage. Mirrors the theme provider's
 * shape. Everything here MUST have a real, visible effect — these are the end
 * user's settings, so a stored value with no consequence would be incoherent.
 *
 *  - fontSize       → scales the root font-size; all rem-based sizing follows.
 *  - pointerCursors → toggles a `pointer` class on <html>; a global CSS rule
 *                     then shows a hand cursor over interactive elements.
 *  - defaultView    → the route the app lands on at launch (consumed by
 *                     HomePage AND, since #1786, by `resolveLandingFrom` right
 *                     after a login — see `resolveDefaultLandingRoute` below).
 *  - nameDisplay    → how contact/member names render (consumed by formatName).
 *  - sendCommentOn  → which keystroke sends a chat comment (Enter vs Cmd/Ctrl+Enter).
 *  - hiddenNavItems → nav item keys the user hid from the sidebar.
 */
export type FontSize = 'small' | 'default' | 'large'
export type DefaultView = 'chat' | 'briefing' | 'discover' | 'accounts' | 'needs' | 'watchlist' | 'talents'
export type Density = 'comfortable' | 'compact'
export type NameDisplay = 'full' | 'first' | 'initials'
export type SendCommentOn = 'enter' | 'mod-enter'

type Preferences = {
  fontSize: FontSize
  pointerCursors: boolean
  defaultView: DefaultView
  nameDisplay: NameDisplay
  sendCommentOn: SendCommentOn
  hiddenNavItems: string[]
  density: Density
}

// #1786 — `chat` en tête : c'est désormais le DÉFAUT (voir `DEFAULTS` plus
// bas), et Réglages › Démarrage liste les options dans l'ordre où elles
// comptent.
export const DEFAULT_VIEW_VALUES: DefaultView[] = [
  'chat',
  // #2112.20 — « Aujourd'hui » manquait à la liste : la page (`/briefing`)
  // existe, sert le brief matinal complet, et n'était choisissable nulle
  // part comme vue de démarrage.
  'briefing',
  // #2145.12 / #2145.14 (épopée #2925) — Dashboard ET Contacts retirés d'ICI :
  // les deux routes existent toujours (`/dashboard`, `/contacts`), on cesse
  // seulement de les proposer comme DESTINATION au lancement. Une préférence
  // déjà réglée sur l'une des deux migre au premier `readStored()` — voir
  // `LEGACY_DEFAULT_VIEW_MIGRATION` plus bas (#2145.15 / #2145.32).
  'discover',
  'accounts',
  'needs',
  'watchlist',
  // Théo D settings-prefs.R2 — « Vivier » : la cinquième page de démarrage de Théo.
  'talents',
]
export const DENSITY_VALUES: Density[] = ['comfortable', 'compact']
export const NAME_DISPLAY_VALUES: NameDisplay[] = ['full', 'first', 'initials']
export const SEND_COMMENT_VALUES: SendCommentOn[] = ['enter', 'mod-enter']

/** Route each DefaultView maps to (consumed by `resolveDefaultLandingRoute`). */
export const DEFAULT_VIEW_ROUTE: Record<DefaultView, string> = {
  chat: '/chat',
  briefing: '/briefing',
  discover: '/discover',
  accounts: '/accounts',
  // La CLÉ de préférence reste `needs` : elle est stockée chez chaque
  // utilisateur, et la renommer renverrait tout le monde au tableau de bord.
  // Elle mène désormais à l'écran Projets, qui a absorbé les Besoins.
  needs: '/projects',
  // #2151.60 — même règle que `needs` : la CLÉ `watchlist` reste (elle est
  // stockée chez chaque utilisateur), et elle mène à « Signaux » (Théo A signaux :
  // bibliothèque d'informations par compte et Mes veilles). Viser `/watchlist` ferait un détour par
  // une redirection à chaque connexion.
  watchlist: '/signals',
  talents: '/consultants',
}

/**
 * #1786 — LA route d'arrivée « normale » (hors onboarding, hors invité).
 *
 * Seule fonction qui porte ce calcul : `HomePage` (l'accueil, `/`) ET
 * `resolveLandingFrom` (juste après une connexion, mot de passe ou OAuth)
 * l'appellent toutes les deux. Avant #1786, seule `HomePage` l'appliquait —
 * la connexion, elle, renvoyait toujours vers `/dashboard` en dur : la règle
 * mobile du dépôt (« Laura est l'écran d'arrivée ») était déjà fausse en
 * production pour quiconque venait de se connecter. Un réglage vit à un seul
 * endroit (GA-26) : deux chemins qui refont ce calcul divergent.
 *
 * Sur mobile, Laura — quelle que soit la préférence choisie pour un écran de
 * bureau (décision de Louis du 23/08). Sinon, la vue de démarrage choisie
 * dans Préférences › Démarrage, dont le défaut est désormais Laura et non
 * plus le tableau de bord (retour de Louis, #1786) : une correction humaine
 * DÉJÀ faite dans Réglages gagne toujours, puisque `defaultView` ne vaut le
 * défaut que pour qui n'a jamais rien choisi.
 */
export function resolveDefaultLandingRoute(isMobile: boolean, defaultView: DefaultView): string {
  if (isMobile) return MOBILE_HOME
  return DEFAULT_VIEW_ROUTE[defaultView]
}

/**
 * La même destination, calculée HORS de React — pour les chargeurs de route.
 *
 * #1786 — un `beforeLoad` de TanStack Router s'exécute avant tout rendu : il
 * n'a ni `useIsMobile` ni `useReadPreferences`. Trois redirections renvoyaient
 * donc `/dashboard` EN DUR pendant que les deux chemins de connexion, eux,
 * lisaient la règle — une règle appliquée à moitié, c'est-à-dire une règle qui
 * ne tient pas. Ce n'est PAS une seconde dérivation : les deux entrées
 * (`isMobileNow`, `readStored`) sont celles que les hooks utilisent déjà, et le
 * calcul reste `resolveDefaultLandingRoute` (GA-26).
 */
export function landingRouteNow(): string {
  return resolveDefaultLandingRoute(isMobileNow(), readStored().defaultView)
}

const DEFAULTS: Preferences = {
  fontSize: 'default',
  pointerCursors: true,
  // #1786 — « quand on se connecte à Bellum, c'est sur Laura qu'on doit
  // arriver par défaut ». Ne s'applique qu'à qui n'a JAMAIS touché ce réglage
  // (`readStored` ci-dessous ne retombe ici que si rien n'est en local).
  defaultView: 'chat',
  nameDisplay: 'full',
  sendCommentOn: 'enter',
  hiddenNavItems: [],
  density: 'comfortable',
}

const STORAGE_KEY = 'bellum-preferences'
const FONT_SIZE_PX: Record<FontSize, string> = { small: '14px', default: '16px', large: '18px' }

type PreferencesContextValue = {
  preferences: Preferences
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

/**
 * #2145.15 / #2145.32 (épopée #2925) — l'équivalent le plus proche pour une
 * préférence `defaultView` retirée de `DEFAULT_VIEW_VALUES` (voir plus haut) :
 * migrer, jamais retomber en silence sur le défaut (Laura) comme si personne
 * n'avait jamais rien choisi. Choix tranché sans Louis, le plus simple
 * compatible avec la doctrine : Dashboard → Aujourd'hui pour tout le monde
 * (le brief y couvre déjà ce que Dashboard montrait) plutôt qu'un routage par
 * rôle vers Pilotage, qui n'est pas accessible à tous les rôles — reste à
 * construire si une préférence par rôle est un jour demandée. Contacts →
 * Comptes, cité tel quel dans l'épopée.
 */
const LEGACY_DEFAULT_VIEW_MIGRATION: Record<string, DefaultView> = {
  dashboard: 'briefing',
  contacts: 'accounts',
}

function migrateDefaultView(value: unknown): DefaultView {
  if (isOneOf(value, DEFAULT_VIEW_VALUES)) return value
  if (typeof value === 'string' && value in LEGACY_DEFAULT_VIEW_MIGRATION) {
    return LEGACY_DEFAULT_VIEW_MIGRATION[value]
  }
  return DEFAULTS.defaultView
}

function readStored(): Preferences {
  if (typeof localStorage === 'undefined') return DEFAULTS
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Preferences>
    const result: Preferences = {
      fontSize: parsed.fontSize && parsed.fontSize in FONT_SIZE_PX ? parsed.fontSize : DEFAULTS.fontSize,
      pointerCursors: typeof parsed.pointerCursors === 'boolean' ? parsed.pointerCursors : DEFAULTS.pointerCursors,
      defaultView: migrateDefaultView(parsed.defaultView),
      nameDisplay: isOneOf(parsed.nameDisplay, NAME_DISPLAY_VALUES) ? parsed.nameDisplay : DEFAULTS.nameDisplay,
      sendCommentOn: isOneOf(parsed.sendCommentOn, SEND_COMMENT_VALUES) ? parsed.sendCommentOn : DEFAULTS.sendCommentOn,
      hiddenNavItems: Array.isArray(parsed.hiddenNavItems)
        ? parsed.hiddenNavItems.filter((v): v is string => typeof v === 'string')
        : DEFAULTS.hiddenNavItems,
      density: isOneOf(parsed.density, DENSITY_VALUES) ? parsed.density : DEFAULTS.density,
    }
    // #2145.15 / #2145.32 — une préférence héritée migrée s'écrit tout de
    // suite : sinon chaque lecture la recalcule en silence sans jamais la
    // corriger dans Réglages › Démarrage, où elle continuerait de se lire
    // "Dashboard"/"Contacts" si ces libellés existaient encore ailleurs.
    if (parsed.defaultView !== result.defaultView) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    }
    return result
  } catch {
    return DEFAULTS
  }
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(readStored)

  // Apply visual prefs to <html> so they take effect app-wide.
  useEffect(() => {
    const root = document.documentElement
    root.style.fontSize = FONT_SIZE_PX[preferences.fontSize]
    root.classList.toggle('pointer', preferences.pointerCursors)
    // Théo D settings-prefs.N1 — la densité resserre les blocs (CSS `html[data-density]`),
    // jamais les cibles tactiles (GA-35).
    root.dataset.density = preferences.density
  }, [preferences.fontSize, preferences.pointerCursors, preferences.density])

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPreferences(prev => {
      const next = { ...prev, [key]: value }
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const contextValue = useMemo<PreferencesContextValue>(
    () => ({ preferences, setPreference }),
    [preferences, setPreference],
  )

  return <PreferencesContext.Provider value={contextValue}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreferences must be used within a <PreferencesProvider>')
  return ctx
}

/** Read-only preferences that tolerate a missing provider by returning the
 *  defaults. For cosmetic, display-only prefs (e.g. name formatting) that may be
 *  read from widely-reused rows rendered in isolation — a missing provider must
 *  degrade to the default look, never throw. */
export function useReadPreferences(): Preferences {
  return useContext(PreferencesContext)?.preferences ?? DEFAULTS
}
