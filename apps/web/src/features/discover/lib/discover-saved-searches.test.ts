import { beforeEach, describe, expect, it } from 'vitest'
import type { SavedView } from '@bellum/contracts'
import { emptyUnifiedFilters } from './discover-filters'
import {
  localSearchesToImport,
  markLocalSearchesImported,
  meaningfulFilters,
  readSavedSearches,
  savedSearchToCreateInput,
  savedViewToSearch,
} from './discover-saved-searches'
import { discoverStorageKey } from './discover-storage'

const LOCAL_KEY = discoverStorageKey('searches', 'user-1')

function writeLocal(entries: unknown[]): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
}

function localEntry(id: string, label: string) {
  return { id, label, savedAt: 1_700_000_000_000, filters: { ...emptyUnifiedFilters(), city: 'Lyon' } }
}

function view(overrides: Partial<SavedView> = {}): SavedView {
  return {
    id: 'v1',
    scope: 'discover',
    name: 'ETI industrielles 69/38',
    filters: { city: 'Lyon' },
    objective: null,
    shared: false,
    alertFrequency: 'manual',
    alertChannel: null,
    // #2151.5 / .8 / .9 — non qualifié, et « non mesuré » n'est pas 0.
    resultType: null,
    newItems: null,
    sourceKinds: [],
    lastRunAt: null,
    ownerId: null,
    ownerName: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => localStorage.clear())

/** #2151.3 à .13 — le serveur est le magasin ; le navigateur reste l'archive. */
describe('les recherches enregistrées venues du serveur', () => {
  it('lit une vue enregistrée comme une recherche de Découvrir', () => {
    const search = savedViewToSearch(view({ objective: 'Ouvrir trois comptes', shared: true, ownerName: 'Sarah' }))
    expect(search.label).toBe('ETI industrielles 69/38')
    expect(search.objective).toBe('Ouvrir trois comptes')
    expect(search.shared).toBe(true)
    expect(search.ownerName).toBe('Sarah')
  })

  it('#4362.1 — une ancienne catégorie officielle garde son intention : elle devient des tranches du filtre de taille', () => {
    const search = savedViewToSearch(view({ filters: { companyCategory: ['ETI'], city: 'Lyon' } }))
    expect(search.filters.companyCategory).toEqual([])
    expect(search.filters.headcount).toEqual(['250-999', '1000+'])
    expect(search.filters.city).toBe('Lyon')
  })

  it('part du rail VIDE et recouvre — une clé absente garde son défaut, pas `undefined`', () => {
    const search = savedViewToSearch(view({ filters: { city: 'Lyon' } }))
    expect(search.filters.city).toBe('Lyon')
    expect(search.filters.sectors).toEqual(emptyUnifiedFilters().sectors)
  })

  it('« jamais rejouée » reste `null` — il ne retombe PAS sur la date d’enregistrement', () => {
    expect(savedViewToSearch(view({ lastRunAt: null })).lastRunAt).toBeNull()
  })

  it('n’envoie que les axes réellement posés — ni vide, ni tableau vide, ni `all`', () => {
    const kept = meaningfulFilters({ ...emptyUnifiedFilters(), city: 'Lyon' })
    expect(kept).toEqual({ city: 'Lyon' })
  })

  it('n’allume aucune alerte par défaut à l’enregistrement', () => {
    const input = savedSearchToCreateInput({ label: '  Banques Paris  ', filters: emptyUnifiedFilters() })
    expect(input.scope).toBe('discover')
    expect(input.name).toBe('Banques Paris')
    expect(input.alertFrequency).toBe('manual')
    expect(input.alertChannel).toBeNull()
    expect(input.objective).toBeNull()
  })
})

/** ⚠️ On archive, on ne supprime pas. */
describe('l’import des recherches déjà dans ce navigateur', () => {
  it('remonte ce qui n’est pas encore là-haut', () => {
    writeLocal([localEntry('a', 'Banques Paris'), localEntry('b', 'ETI Lyon')])
    expect(localSearchesToImport('user-1', ['ETI Lyon']).map(s => s.label)).toEqual(['Banques Paris'])
  })

  it('ne remonte pas deux fois la même — la marque tient entre deux sessions', () => {
    writeLocal([localEntry('a', 'Banques Paris')])
    markLocalSearchesImported('user-1', ['a'])
    expect(localSearchesToImport('user-1', [])).toEqual([])
  })

  it('n’EFFACE jamais la clé d’origine : la donnée de l’utilisateur reste là', () => {
    writeLocal([localEntry('a', 'Banques Paris')])
    markLocalSearchesImported('user-1', ['a'])
    expect(localStorage.getItem(LOCAL_KEY)).not.toBeNull()
    expect(readSavedSearches('user-1').map(s => s.label)).toEqual(['Banques Paris'])
  })

  it('migre encore l’ancienne forme `registry`/`signals` avant de la remonter', () => {
    writeLocal([{ id: 'c', label: 'Vieux périmètre', savedAt: 1, registry: { city: 'Nantes', sector: 'industry' } }])
    const [pending] = localSearchesToImport('user-1', [])
    expect(pending.filters.city).toBe('Nantes')
    expect(pending.filters.sectors).toEqual(['industry'])
  })

  it('sans utilisateur, il n’y a rien à remonter et rien à marquer', () => {
    writeLocal([localEntry('a', 'Banques Paris')])
    expect(localSearchesToImport(undefined, [])).toEqual([])
    expect(() => markLocalSearchesImported(undefined, ['a'])).not.toThrow()
  })
})
