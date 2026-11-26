import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_VIEW_VALUES, landingRouteNow, type DefaultView } from '@/features/preferences/preferences-provider'

const STORAGE_KEY = 'bellum-preferences'

/**
 * #2145.12 / #2145.14 (épopée #2925, tranché sans Louis) — Dashboard et
 * Contacts retirés de la liste des vues de démarrage : ils restent des routes
 * réelles (`/dashboard`, `/contacts`), mais on ne les propose plus comme
 * destination au lancement de l'app. #2145.15 / #2145.32 exigent que ça ne
 * casse pas l'écran de qui avait déjà choisi l'une des deux : la préférence
 * migre vers l'équivalent le plus proche plutôt que de silencieusement
 * retomber sur le défaut (Laura) sans le dire nulle part.
 */
describe('#2145.12 / #2145.14 — dashboard et contacts retirés du démarrage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('ne propose plus dashboard ni contacts comme vue de démarrage', () => {
    expect(DEFAULT_VIEW_VALUES).not.toContain('dashboard' as DefaultView)
    expect(DEFAULT_VIEW_VALUES).not.toContain('contacts' as DefaultView)
  })

  it('#2145.15 — migre une préférence "dashboard" héritée vers Aujourd’hui', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultView: 'dashboard' }))
    expect(landingRouteNow()).toBe('/briefing')
  })

  it('#2145.15 — persiste la migration, elle ne se recalcule pas à chaque lecture', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultView: 'dashboard' }))
    landingRouteNow()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.defaultView).toBe('briefing')
  })

  it('#2145.32 — migre une préférence "contacts" héritée vers Comptes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultView: 'contacts' }))
    expect(landingRouteNow()).toBe('/accounts')
  })

  it('laisse intactes les autres préférences déjà stockées pendant la migration', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultView: 'dashboard', fontSize: 'large' }))
    landingRouteNow()
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(stored.fontSize).toBe('large')
  })
})

/**
 * Théo D settings-prefs.N1 / .R2 — densité Confortable / Compacte et « Vivier »
 * parmi les pages de démarrage. La densité est une préférence d'appareil comme
 * la taille du texte : stockée dans le navigateur, appliquée à <html>.
 */
async function readDensity() {
  const { PreferencesProvider, usePreferences } = await import('@/features/preferences/preferences-provider')
  const { renderHook } = await import('@testing-library/react')
  const { createElement } = await import('react')
  const { result } = renderHook(() => usePreferences(), {
    wrapper: ({ children }) => createElement(PreferencesProvider, null, children),
  })
  return result.current.preferences
}

describe('Théo D settings-prefs.N1 — densité', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-density')
  })

  it('vaut « comfortable » pour qui n’a jamais rien choisi', async () => {
    expect((await readDensity()).density).toBe('comfortable')
  })

  it('relit « compact » depuis le stockage et ignore une valeur inconnue', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'compact' }))
    expect((await readDensity()).density).toBe('compact')
    expect(document.documentElement.dataset.density).toBe('compact')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ density: 'dense' }))
    expect((await readDensity()).density).toBe('comfortable')
  })
})

describe('Théo D settings-prefs.R2 — le Vivier est une page de démarrage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('propose « talents » et mène au Vivier', () => {
    expect(DEFAULT_VIEW_VALUES).toContain('talents' as DefaultView)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ defaultView: 'talents' }))
    expect(landingRouteNow()).toBe('/consultants')
  })
})
