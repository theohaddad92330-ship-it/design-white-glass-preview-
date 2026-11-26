import { describe, expect, it } from 'vitest'
import {
  EMPTY_LAURA_CONTEXT_ENVELOPE,
  createLauraContextEnvelope,
  decodeLauraContextEnvelope,
  encodeLauraContextEnvelope,
  lauraContextEnvelopeSchema,
} from './laura-context-envelope.js'

// #2147.10 — l'enveloppe nomme au moins dix-huit champs.
describe('lauraContextEnvelopeSchema — au moins dix-huit champs nommés (#2147.10)', () => {
  it('porte au moins dix-huit clés', () => {
    expect(Object.keys(EMPTY_LAURA_CONTEXT_ENVELOPE).length).toBeGreaterThanOrEqual(18)
  })

  it('accepte une enveloppe entièrement vide (tout absent, jamais deviné)', () => {
    expect(lauraContextEnvelopeSchema.parse(EMPTY_LAURA_CONTEXT_ENVELOPE)).toEqual(EMPTY_LAURA_CONTEXT_ENVELOPE)
  })
})

// #2147.9 — le contrat, créé sans qu'aucun champ non fourni ne soit deviné.
describe('createLauraContextEnvelope', () => {
  it('ne pose que les champs fournis, le reste reste null', () => {
    const envelope = createLauraContextEnvelope({
      sourceSurface: 'discover',
      targetSurface: 'analyze',
      reason: 'Angle : recrutement en cours',
    })
    expect(envelope.sourceSurface).toBe('discover')
    expect(envelope.targetSurface).toBe('analyze')
    expect(envelope.reason).toBe('Angle : recrutement en cours')
    expect(envelope.accountId).toBeNull()
    expect(envelope.contactIds).toBeNull()
  })

  it('rejette une chaîne vide plutôt que de la garder telle quelle', () => {
    expect(() => createLauraContextEnvelope({ reason: '' })).toThrow()
  })
})

describe('encodeLauraContextEnvelope / decodeLauraContextEnvelope — l’aller-retour', () => {
  it('rend une chaîne vide quand rien ne dépasse le défaut — jamais un ctx={} trompeur', () => {
    expect(encodeLauraContextEnvelope(EMPTY_LAURA_CONTEXT_ENVELOPE)).toBe('')
  })

  it('un aller-retour restitue exactement les champs posés', () => {
    const envelope = createLauraContextEnvelope({
      sourceSurface: 'discover',
      targetSurface: 'analyze',
      accountId: 'siren:552032534',
      company: 'Acme SA',
      reason: 'Signal récent : levée de fonds',
      suggestionId: 'discover:552032534',
      generatedAt: '2026-09-27T08:00:00.000Z',
    })
    const encoded = encodeLauraContextEnvelope(envelope)
    expect(encoded.length).toBeGreaterThan(0)
    const decoded = decodeLauraContextEnvelope(encoded)
    expect(decoded).toEqual(envelope)
  })

  it('un aller-retour avec des tableaux restitue les listes', () => {
    const envelope = createLauraContextEnvelope({ sectors: ['it', 'finance'], contactIds: ['c1', 'c2'] })
    const decoded = decodeLauraContextEnvelope(encodeLauraContextEnvelope(envelope))
    expect(decoded?.sectors).toEqual(['it', 'finance'])
    expect(decoded?.contactIds).toEqual(['c1', 'c2'])
  })

  it('decodeLauraContextEnvelope rend null sur une entrée absente ou vide — jamais deviné', () => {
    expect(decodeLauraContextEnvelope(undefined)).toBeNull()
    expect(decodeLauraContextEnvelope('')).toBeNull()
    expect(decodeLauraContextEnvelope(42)).toBeNull()
  })

  it('decodeLauraContextEnvelope rend null sur du JSON invalide — jamais une exception à l’écran', () => {
    expect(decodeLauraContextEnvelope('%7Bnot-json')).toBeNull()
  })

  it('decodeLauraContextEnvelope rend null sur un tableau ou une valeur hors vocabulaire', () => {
    expect(decodeLauraContextEnvelope(encodeURIComponent(JSON.stringify([1, 2])))).toBeNull()
    expect(
      decodeLauraContextEnvelope(encodeURIComponent(JSON.stringify({ sourceSurface: 'not-a-surface' }))),
    ).toBeNull()
  })
})
