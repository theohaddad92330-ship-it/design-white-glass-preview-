import { beforeEach, describe, expect, it } from 'vitest'
import { isIgnored, isUnseen, readAlertMemory, signatureOf, writeAlertMemory } from './contactAlertMemory'

/**
 * #4596 — le souvenir du bandeau « Avant d'agir » : par PERSONNE et par contact, jamais par espace
 * (c'est une lecture, pas une décision d'équipe). Une signature change quand le CONTENU de la carte change.
 */
describe('contactAlertMemory (#4596)', () => {
  beforeEach(() => window.localStorage.clear())

  it('une signature est stable pour un même contenu et change avec lui', () => {
    expect(signatureOf({ a: 1, b: ['x'] })).toBe(signatureOf({ a: 1, b: ['x'] }))
    expect(signatureOf({ a: 1 })).not.toBe(signatureOf({ a: 2 }))
  })

  it('rien en mémoire : la carte est neuve (jamais vue)', () => {
    expect(isUnseen(undefined, 'sig')).toBe(true)
  })

  it('vue avec la même signature : plus neuve ; contenu changé : neuve de nouveau', () => {
    expect(isUnseen({ seen: 'sig' }, 'sig')).toBe(false)
    expect(isUnseen({ seen: 'sig' }, 'autre')).toBe(true)
  })

  it('ignorée : jamais neuve, mais seulement tant que son contenu n’a pas changé', () => {
    const memory = { ignoredAt: '2026-10-26T09:12:41.317Z', ignoredSignature: 'sig' }
    expect(isIgnored(memory, 'sig')).toBe(true)
    expect(isUnseen(memory, 'sig')).toBe(false)
    expect(isIgnored(memory, 'autre')).toBe(false)
    expect(isUnseen(memory, 'autre')).toBe(true)
  })

  it('s’écrit et se relit pour CETTE personne et CE contact seulement', () => {
    writeAlertMemory('user-1', 'contact-1', { preflight: { seen: 'sig' } })
    expect(readAlertMemory('user-1', 'contact-1')).toEqual({ preflight: { seen: 'sig' } })
    expect(readAlertMemory('user-2', 'contact-1')).toEqual({})
    expect(readAlertMemory('user-1', 'contact-2')).toEqual({})
  })

  it('un stockage illisible ou refusé veut dire « pas de mémoire », jamais une erreur', () => {
    window.localStorage.setItem('bellum:avant-dagir:user-1:contact-1', '{pas du json')
    expect(readAlertMemory('user-1', 'contact-1')).toEqual({})
    expect(readAlertMemory(null, 'contact-1')).toEqual({})
    expect(() => writeAlertMemory(null, 'contact-1', { a: { seen: 'x' } })).not.toThrow()
  })
})
