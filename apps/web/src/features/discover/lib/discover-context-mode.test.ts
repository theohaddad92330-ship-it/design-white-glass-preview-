import { describe, expect, it } from 'vitest'
import { applyContextMode, contextModeFromSearch } from './discover-context-mode'

/**
 * #2454.10 / #2451.1 — un mode CHOISI voyage jusqu'au serveur avec la recherche ;
 * aucun choix ne change RIEN au corps envoyé (le serveur applique alors le
 * défaut de l'espace, `IaProxyController.discoverProfileData`).
 */
describe('applyContextMode (#2454.10, #2451.1)', () => {
  const registry = { mode: 'registry' as const, query: { filters: {}, limit: 20 } }
  const signals = { mode: 'signals' as const, query: { sinceDays: 30, limit: 20 } }

  it('aucune recherche lancée : rien ne part', () => {
    expect(applyContextMode(null, 'neutral')).toBeNull()
  })

  it('aucun mode choisi : la requête est rendue TELLE QUELLE (défaut de l’espace côté serveur)', () => {
    expect(applyContextMode(registry, undefined)).toBe(registry)
  })

  it('un mode choisi part dans le corps, registre comme signaux — y compris « Mission ponctuelle »', () => {
    expect(applyContextMode(registry, 'neutral')).toEqual({
      mode: 'registry',
      query: { filters: {}, limit: 20, contextMode: 'neutral' },
    })
    expect(applyContextMode(signals, 'one_off_mission')).toEqual({
      mode: 'signals',
      query: { sinceDays: 30, limit: 20, contextMode: 'one_off_mission' },
    })
  })

  it('« Mon activité » CHOISIE part aussi : elle doit battre un défaut d’espace « Neutre »', () => {
    expect(applyContextMode(registry, 'my_activity')).toEqual({
      mode: 'registry',
      query: { filters: {}, limit: 20, contextMode: 'my_activity' },
    })
  })
})

describe('contextModeFromSearch (#2454.4)', () => {
  it('lit `?context=…` — un lien de passage conserve le mode', () => {
    expect(contextModeFromSearch('neutral')).toBe('neutral')
    expect(contextModeFromSearch('one_off_mission')).toBe('one_off_mission')
  })

  it('absent ou hors vocabulaire : AUCUN mode (le défaut de l’espace s’applique), jamais un mode deviné', () => {
    expect(contextModeFromSearch(undefined)).toBeUndefined()
    expect(contextModeFromSearch('auto')).toBeUndefined()
  })
})
