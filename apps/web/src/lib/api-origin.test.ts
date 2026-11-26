import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armFallback,
  ensureApiReachable,
  isFallbackArmed,
  isNetworkFailure,
  isSafeMethod,
  resetFallbackForTests,
} from './api-origin'
import { ANALYSIS_STATUS_POLL_MS, analysisPollMs } from './analysis-status-sync'

describe('le repli d’origine — ce qui l’arme, et ce qui ne l’arme pas', () => {
  beforeEach(() => resetFallbackForTests())

  it('n’est PAS armé par défaut — personne ne bascule sans avoir été bloqué', () => {
    // C'est la propriété qui protège les utilisateurs sans passerelle : ils
    // gardent l'appel direct, donc leurs WebSockets.
    expect(isFallbackArmed()).toBe(false)
  })

  it('s’arme une fois, et le second appel ne fait rien', () => {
    armFallback()
    expect(isFallbackArmed()).toBe(true)
    armFallback()
    expect(isFallbackArmed()).toBe(true)
  })

  it('survit dans la session', () => {
    armFallback()
    expect(sessionStorage.getItem('bellum.api.fallback')).toBe('1')
  })
})

describe('isNetworkFailure — distinguer « bloqué » de « refusé » et de « annulé »', () => {
  it('reconnaît l’échec de transport que lève fetch', () => {
    // C'est littéralement ce que Chrome lève quand la passerelle refuse.
    expect(isNetworkFailure(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('REFUSE un abort — il vient de nous, pas du réseau', () => {
    // Un composant démonté ou une recherche annulée abort en permanence.
    // Armer le repli là-dessus ferait basculer toute l'application sur son
    // fonctionnement normal.
    const abort = new Error('The user aborted a request.')
    abort.name = 'AbortError'
    expect(isNetworkFailure(abort)).toBe(false)
  })

  it('REFUSE un DOMException AbortError', () => {
    expect(isNetworkFailure(new DOMException('aborted', 'AbortError'))).toBe(false)
  })

  it('refuse une erreur applicative — un 401 n’est pas un blocage', () => {
    // `fetch` RÉSOUT sur un 4xx : ce qui arrive ici n'a jamais été servi.
    // Une erreur métier qui remonterait ici ne doit rien armer.
    expect(isNetworkFailure(new Error('Invalid login credentials'))).toBe(false)
    expect(isNetworkFailure({ status: 401 })).toBe(false)
    expect(isNetworkFailure(null)).toBe(false)
  })
})

describe('isSafeMethod — ce qu’on peut rejouer sans écrire deux fois', () => {
  it('autorise la lecture', () => {
    expect(isSafeMethod('GET')).toBe(true)
    expect(isSafeMethod('HEAD')).toBe(true)
  })

  it('REFUSE toute écriture', () => {
    // Un `fetch` qui échoue ne dit pas si la requête est PARTIE. Rejouer un
    // POST enverrait potentiellement deux fois — c'est la règle `unknown` du
    // dépôt, appliquée au navigateur.
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isSafeMethod(method)).toBe(false)
    }
  })
})

describe('la sonde de démarrage — c’est elle qui décide si tout ceci sert', () => {
  const realFetch = globalThis.fetch

  beforeEach(() => resetFallbackForTests())
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const jsonResponse = () =>
    new Response('{"commit":"abc"}', { status: 200, headers: { 'content-type': 'application/json' } })

  it('n’arme RIEN quand l’API répond — le chemin nominal ne change pas', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse()) as unknown as typeof fetch
    await ensureApiReachable()
    expect(isFallbackArmed()).toBe(false)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('arme le repli quand l’appel direct est BLOQUÉ et que /api répond', async () => {
    const calls: string[] = []
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      calls.push(url)
      if (url.startsWith('/api')) return jsonResponse()
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    await ensureApiReachable()

    expect(isFallbackArmed()).toBe(true)
    expect(calls[1]).toBe('/api/version')
  })

  it('n’arme PAS si /api rend du HTML — la réécriture serait absente', async () => {
    // Sans la réécriture Vercel, `/api/version` tombe sur le catch-all de la SPA
    // et rend `index.html` avec un 200. Armer là-dessus enverrait toutes les
    // requêtes vers une page web, et l'application afficherait des erreurs de
    // parsing JSON au lieu d'un message de réseau.
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith('/api'))
        return new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    await ensureApiReachable()
    expect(isFallbackArmed()).toBe(false)
  })

  it('n’arme PAS quand les DEUX chemins sont morts — ce n’est pas un problème d’origine', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) as unknown as typeof fetch
    await ensureApiReachable()
    expect(isFallbackArmed()).toBe(false)
  })

  it('ne rejette JAMAIS — une sonde ne fait pas tomber le démarrage', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch
    await expect(ensureApiReachable()).resolves.toBeUndefined()
  })

  it('ne sonde qu’une fois, même appelée en parallèle', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse()) as unknown as typeof fetch
    await Promise.all([ensureApiReachable(), ensureApiReachable(), ensureApiReachable()])
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })
})

describe('la cadence de sondage suit le RÔLE, pas le confort', () => {
  it('reste à 15 s quand le temps réel est là — c’est un filet', () => {
    expect(analysisPollMs(true)).toBe(ANALYSIS_STATUS_POLL_MS)
    expect(ANALYSIS_STATUS_POLL_MS).toBe(15_000)
  })

  it('descend à 4 s quand le sondage est la SEULE source', () => {
    // Derrière une passerelle, Socket.IO ne se connecte jamais : à 15 s la barre
    // bouge quatre fois par minute sur un run de 3 à 6 min, et l'utilisateur
    // conclut que le produit est bloqué.
    expect(analysisPollMs(false)).toBe(4_000)
  })

  it('la cadence dégradée reste NETTEMENT plus rapide, sans devenir du martèlement', () => {
    // Le rapport tient la promesse (progression perçue comme continue) sans
    // quadrupler la charge pour un gain que l'œil ne voit pas.
    expect(ANALYSIS_STATUS_POLL_MS / analysisPollMs(false)).toBeGreaterThanOrEqual(3)
    expect(analysisPollMs(false)).toBeGreaterThanOrEqual(3_000)
  })
})
