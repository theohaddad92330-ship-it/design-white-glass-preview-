import { describe, expect, it } from 'vitest'
import { createLauraContextEnvelope } from '@bellum/contracts'
import {
  conversationIdFromReturnParam,
  lauraContextEnvelopeFromSearch,
  lauraContextSearch,
  returnToConversationSearch,
  withLauraContext,
  withReturnToConversation,
} from './return-to-conversation'

/**
 * #1933.8 / #1903.20 — depuis une page ouverte par Laura, revenir au fil
 * source. Le lien qu'elle propose porte `?from=chat:<id>` ; cette paire de
 * fonctions est le SEUL endroit qui l'écrit (PendingActions.tsx, avant le
 * clic) et le SEUL qui le lit (ReturnToConversationBanner.tsx, sur la page
 * ouverte) — une dérivation vit à un seul endroit (GA-26).
 */
describe('conversationIdFromReturnParam — lire `?from=chat:<id>`', () => {
  it('extrait l’identifiant du fil quand le préfixe est celui attendu', () => {
    expect(conversationIdFromReturnParam('chat:abc-123')).toBe('abc-123')
  })

  it('rend `null` sans préfixe — un `from` d’une autre nature (ex. `welcome`) n’est pas un fil', () => {
    expect(conversationIdFromReturnParam('welcome')).toBeNull()
  })

  it('rend `null` sur une valeur absente ou vide', () => {
    expect(conversationIdFromReturnParam(undefined)).toBeNull()
    expect(conversationIdFromReturnParam('')).toBeNull()
    expect(conversationIdFromReturnParam('chat:')).toBeNull()
  })

  it('n’attrape pas ce qu’elle ne vise pas — un nombre ou un objet ne sont jamais lus comme un fil', () => {
    expect(conversationIdFromReturnParam(42)).toBeNull()
    expect(conversationIdFromReturnParam({ from: 'chat:abc' })).toBeNull()
  })
})

describe('withReturnToConversation — écrire `?from=chat:<id>` sur un lien', () => {
  it('ajoute le paramètre à une route SANS requête existante', () => {
    expect(withReturnToConversation('/discover', 'thread-1')).toBe('/discover?from=chat:thread-1')
  })

  it('AJOUTE au lieu de remplacer une requête déjà posée par Laura', () => {
    expect(withReturnToConversation('/consultants?new=true&name=Claire', 'thread-1')).toBe(
      '/consultants?new=true&name=Claire&from=chat:thread-1',
    )
  })

  it('rend la route INCHANGÉE sans identifiant de fil — jamais un `from` deviné', () => {
    expect(withReturnToConversation('/discover', null)).toBe('/discover')
    expect(withReturnToConversation('/discover', undefined)).toBe('/discover')
  })

  it('encode l’identifiant — un fil ne s’écrit jamais en clair dans une URL sans échappement', () => {
    expect(withReturnToConversation('/discover', 'a b/c')).toBe('/discover?from=chat:a%20b%2Fc')
  })
})

describe('returnToConversationSearch — la même paire, pour un `search` TanStack', () => {
  it('rend un objet `{ from }` avec un identifiant', () => {
    expect(returnToConversationSearch('thread-1')).toEqual({ from: 'chat:thread-1' })
  })

  it('rend un objet VIDE sans identifiant — jamais une clé `from` à `undefined`', () => {
    expect(returnToConversationSearch(null)).toEqual({})
    expect(returnToConversationSearch(undefined)).toEqual({})
  })
})

/**
 * #2147.9/.10 (épopée #2785) — la même paire, pour l'enveloppe de contexte.
 * Indépendante de `from` : Découvrir → Analyser (#2147.12) n'a pas de fil
 * source mais transporte quand même une raison.
 */
describe('withLauraContext / lauraContextSearch / lauraContextEnvelopeFromSearch', () => {
  it('rend la route INCHANGÉE sans enveloppe ou avec une enveloppe entièrement vide', () => {
    expect(withLauraContext('/search', null)).toBe('/search')
    expect(withLauraContext('/search', createLauraContextEnvelope({}))).toBe('/search')
  })

  it('ajoute `ctx=` à une route déjà construite, sans écraser sa requête', () => {
    const envelope = createLauraContextEnvelope({ sourceSurface: 'discover', reason: 'Signal récent' })
    const target = withLauraContext('/search?company=Acme', envelope)
    expect(target).toContain('/search?company=Acme&ctx=')
    expect(lauraContextEnvelopeFromSearch({ ctx: target.split('ctx=')[1]! })?.reason).toBe('Signal récent')
  })

  it('lauraContextSearch rend un objet VIDE sans enveloppe — jamais une clé `ctx` à `undefined`', () => {
    expect(lauraContextSearch(null)).toEqual({})
    expect(lauraContextSearch(createLauraContextEnvelope({}))).toEqual({})
  })

  it('un aller-retour search → search restitue l’enveloppe posée', () => {
    const envelope = createLauraContextEnvelope({
      sourceSurface: 'discover',
      targetSurface: 'analyze',
      reason: 'Angle IA',
    })
    const search = lauraContextSearch(envelope)
    expect(lauraContextEnvelopeFromSearch(search)).toEqual(envelope)
  })

  it('lauraContextEnvelopeFromSearch rend `null` sans `ctx` — jamais deviné', () => {
    expect(lauraContextEnvelopeFromSearch({})).toBeNull()
    expect(lauraContextEnvelopeFromSearch({ ctx: '' })).toBeNull()
  })
})
