import { describe, expect, it } from 'vitest'
import type { DiscoverCallListCompany } from '@bellum/contracts'
import type { DiscoverCandidate } from './discover-types'
import { hasCommercialSignal, knownSignalType, mergeKnownSignals } from './discover-known-signals'

/* #3819 (démo Ludovic 08/10) — Découvrir ne montrait que la vie juridique
 * (greffe) alors que l'espace connaissait l'AO de Schneider Dijon et cinq
 * signaux datés de Stellantis : les signaux HISTORISÉS du compte rejoignent
 * la carte du candidat. */

function candidate(overrides: Partial<DiscoverCandidate> = {}): DiscoverCandidate {
  return {
    name: 'Schneider Electric',
    siren: '542048574',
    nafCode: '2712Z',
    sector: 'Industrie',
    city: 'Dijon',
    department: '21',
    headcountRange: '1000+',
    creationDate: null,
    score: null,
    scoreMax: null,
    scoreUnmeasured: [],
    scoreFactors: [],
    signals: [{ type: 'legal', label: 'Modification statutaire', date: '2026-09-20' }],
    dataConfidence: null,
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
    ...overrides,
  }
}

function known(signals: DiscoverCallListCompany['signals']): ReadonlyMap<string, DiscoverCallListCompany> {
  return new Map([['542048574', { key: '542048574', accountId: 'acc-1', contactsTotal: 0, contacts: [], signals }]])
}

describe('knownSignalType', () => {
  it('range chaque nature historisée dans la famille de signal de Découvrir', () => {
    expect(knownSignalType('appel_offres')).toBe('tender')
    expect(knownSignalType('marche_public')).toBe('tender')
    expect(knownSignalType('recrutement')).toBe('hiring')
    expect(knownSignalType('technologie')).toBe('tech')
    expect(knownSignalType('levee_fonds')).toBe('funding')
    expect(knownSignalType('projet')).toBe('business')
    expect(knownSignalType(null)).toBe('business')
  })
})

describe('mergeKnownSignals — lien source (#4045.1)', () => {
  it('le lien servi rejoint le signal ; sans lien, aucune clé url', () => {
    const [merged] = mergeKnownSignals(
      [candidate()],
      known([
        {
          kind: 'recrutement',
          label: 'Chef d’atelier',
          date: '2026-10-01',
          dateIsDetection: false,
          source: null,
          url: 'https://emploi.example/1',
        },
        { kind: 'projet', label: 'Nouvelle usine', date: '2026-09-30', dateIsDetection: false, source: null },
      ]),
    )
    expect(merged?.signals.find(s => s.label === 'Chef d’atelier')?.url).toBe('https://emploi.example/1')
    expect(merged?.signals.find(s => s.label === 'Nouvelle usine')).not.toHaveProperty('url')
  })
})

describe('mergeKnownSignals', () => {
  it('#3928.1 — garde la trace d’une date de DÉTECTION (pas la date du signal)', () => {
    const [merged] = mergeKnownSignals(
      [candidate()],
      known([{ kind: 'projet', label: 'Programme cloud', date: '2026-10-01', dateIsDetection: true, source: null }]),
    )
    expect(merged?.signals.find(item => item.label === 'Programme cloud')).toMatchObject({ dateIsDetection: true })
  })

  it('ajoute les signaux connus du compte, datés et sourcés, sans doublon', () => {
    const [merged] = mergeKnownSignals(
      [candidate()],
      known([
        {
          kind: 'appel_offres',
          label: 'AO maintenance automatismes — Dijon',
          date: '2026-10-02',
          dateIsDetection: false,
          source: 'Registre public',
        },
        {
          kind: 'appel_offres',
          label: 'AO maintenance automatismes — Dijon',
          date: '2026-10-02',
          dateIsDetection: false,
          source: 'Registre public',
        },
      ]),
    )
    expect(merged?.signals).toEqual([
      {
        type: 'tender',
        label: 'AO maintenance automatismes — Dijon',
        date: '2026-10-02',
        fromSpace: true,
      },
      { type: 'legal', label: 'Modification statutaire', date: '2026-09-20' },
    ])
    expect(merged?.accountId).toBe('acc-1')
  })

  it('rend le MÊME objet quand rien de neuf (pas de re-rendu inutile)', () => {
    const input = candidate()
    expect(mergeKnownSignals([input], new Map())[0]).toBe(input)
  })
})

describe('lot M — la source (fournisseur) ne devient jamais le détail affiché', () => {
  it('sait dire NON : « Jobintree » servi en `source` ne fuit pas dans le signal', () => {
    const merged = mergeKnownSignals(
      [candidate()],
      known([
        {
          kind: 'recrutement',
          label: 'Ingénieur data',
          date: '2026-10-02',
          dateIsDetection: false,
          source: 'Jobintree',
        },
      ]),
    )[0]
    expect(JSON.stringify(merged?.signals)).not.toContain('Jobintree')
  })
})

describe('hasCommercialSignal', () => {
  it('la vie juridique seule ne compte pas comme signal commercial', () => {
    expect(hasCommercialSignal(candidate())).toBe(false)
    expect(
      hasCommercialSignal(candidate({ signals: [{ type: 'hiring', label: 'Recrute', date: '2026-09-01' }] })),
    ).toBe(true)
  })
})
