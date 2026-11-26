import { describe, expect, it } from 'vitest'
import type { DiscoverSignal } from './discover-types'
import { discoverAccessLevel } from './discover-access-level'

/**
 * #2646.1 (décision Louis 20/09/2026) — l'accès nommé pour un candidat
 * Découvrir SANS fiche compte, dérivé d'un signal `award` DÉJÀ collecté.
 */

const AWARD: DiscoverSignal = {
  type: 'award',
  label: 'Marché attribué — Refonte SI',
  date: '2026-06-01',
  detail: 'Titulaire : Capgemini',
}

const TENDER_ONLY: DiscoverSignal = {
  type: 'tender',
  label: 'Consultation ouverte',
  date: '2026-06-01',
}

describe('discoverAccessLevel (#2646.1)', () => {
  it('nomme `rang3_plus` quand un signal d’attribution NOMME un titulaire — aucun partenaire ne peut être déclaré sans fiche compte', () => {
    expect(discoverAccessLevel({ signals: [AWARD] })).toBe('rang3_plus')
  })

  it('reste `inconnu` sans signal d’attribution — jamais `direct` : l’absence de signal ne prouve pas l’absence de rang 1', () => {
    expect(discoverAccessLevel({ signals: [] })).toBe('inconnu')
    expect(discoverAccessLevel({ signals: [TENDER_ONLY] })).toBe('inconnu')
  })

  it('reste `inconnu` quand le signal d’attribution ne NOMME personne (`detail` absent ou vide)', () => {
    expect(discoverAccessLevel({ signals: [{ ...AWARD, detail: undefined }] })).toBe('inconnu')
    expect(discoverAccessLevel({ signals: [{ ...AWARD, detail: '   ' }] })).toBe('inconnu')
  })
})
