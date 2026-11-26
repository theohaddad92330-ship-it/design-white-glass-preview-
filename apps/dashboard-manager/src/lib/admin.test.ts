import { beforeEach, describe, expect, it } from 'vitest'
import { apiTelemetrySnapshot, normalizeEndpointPath, recordApiCallForTelemetry, __resetApiTelemetry } from './admin'

/**
 * #1667.3 — le volume par endpoint et le p95, jamais une requête nominative.
 *
 * `adminGet`/`adminMutate` restent non testés directement ici (ils font un
 * vrai `fetch` réseau) — ce fichier teste les DEUX fonctions PURES qui portent
 * toute la substance : réduire un chemin à son endpoint, et agréger ce que
 * `recordApiCallForTelemetry` a vu.
 */
describe('normalizeEndpointPath — un endpoint, jamais une requête nominative', () => {
  it('réduit un UUID à `:id`', () => {
    expect(normalizeEndpointPath('/workspaces/3f9b6e2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b')).toBe('/workspaces/:id')
  })

  it('réduit un id numérique à `:id`', () => {
    expect(normalizeEndpointPath('/analyses/482')).toBe('/analyses/:id')
  })

  it('retire la chaîne de requête — une recherche tapée par un opérateur ne doit jamais ressortir', () => {
    expect(normalizeEndpointPath('/users?search=louis@bellum-it.com&limit=50')).toBe('/users')
  })

  it('laisse un segment littéral inchangé', () => {
    expect(normalizeEndpointPath('/business-metrics/treasury')).toBe('/business-metrics/treasury')
  })
})

describe('apiTelemetrySnapshot — volume et p95, agrégés PAR endpoint', () => {
  beforeEach(() => {
    __resetApiTelemetry()
  })

  it('compte les appels par méthode + endpoint réduit, sans distinguer deux ids différents', () => {
    recordApiCallForTelemetry('GET', '/users/482', 200, 10)
    recordApiCallForTelemetry('GET', '/users/917', 200, 20)
    recordApiCallForTelemetry('GET', '/users/917', 200, 30)

    const snapshot = apiTelemetrySnapshot()
    expect(snapshot).toEqual([{ method: 'GET', endpoint: '/users/:id', count: 3, p95Ms: 30, errorCount: 0 }])
  })

  it('compte les erreurs (>= 400) séparément, sans les retirer du volume', () => {
    recordApiCallForTelemetry('GET', '/flags', 200, 5)
    recordApiCallForTelemetry('GET', '/flags', 500, 5)

    const [ligne] = apiTelemetrySnapshot()
    expect(ligne?.count).toBe(2)
    expect(ligne?.errorCount).toBe(1)
  })

  it('trie par volume décroissant', () => {
    recordApiCallForTelemetry('GET', '/rare', 200, 5)
    recordApiCallForTelemetry('GET', '/frequent', 200, 5)
    recordApiCallForTelemetry('GET', '/frequent', 200, 5)

    expect(apiTelemetrySnapshot().map(l => l.endpoint)).toEqual(['/frequent', '/rare'])
  })

  it('aucun appel enregistré → tableau vide, jamais une ligne à 0', () => {
    expect(apiTelemetrySnapshot()).toEqual([])
  })

  it('le p95 utilise le rang le plus proche, comme `observability-alerts.ts` côté API', () => {
    for (let i = 1; i <= 20; i += 1) {
      recordApiCallForTelemetry('GET', '/bench', 200, i * 10)
    }
    // Sur 20 valeurs (10..200), le p95 « nearest-rank » désigne la 19ᵉ : 190.
    expect(apiTelemetrySnapshot()[0]?.p95Ms).toBe(190)
  })
})
