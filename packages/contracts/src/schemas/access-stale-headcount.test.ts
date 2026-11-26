import { describe, expect, it } from 'vitest'
import { SEGMENT_CAPABILITY_EPOCH } from './segment-catchup.js'
import { headcountContradictsHeader, withoutStaleHeadcount } from './access-stale-headcount.js'

const proxy = (key: string, contribution: number, measurable = true, evidence = key) => ({
  key,
  contribution,
  evidence,
  measurable,
})

function barrier() {
  return {
    score: 5.5,
    accessibility: 4.5,
    access_class: 'C' as const,
    label: 'Semi-ouvert',
    proxies: [
      proxy('statut', 3),
      proxy('effectif', 0.18, true, 'effectif 53 salariés — la maturité achat croît par paliers'),
      proxy('cotation', 1),
      proxy('commande_publique', 1.32),
      proxy('decentralisation', 0),
      proxy('anciennete', 0),
    ],
    measurable: true,
    missing: [],
    corrections: [],
  }
}

function addressability() {
  return {
    score: 11,
    max: 20,
    unmeasured: ['access_cost'],
    factors: [
      { axis: 'lock', points: 4, label: 'verrou', evidence: null },
      { axis: 'proportion', points: 4, label: 'Proportion — < 250 pour une ESN de 30-80', evidence: null },
      { axis: 'path', points: 3, label: 'chemin', evidence: null },
    ],
  }
}

const FRESH = new Date(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals ?? '2026-09-19T11:20:34.000Z') + 86_400_000)
const OLD = new Date(Date.parse(SEGMENT_CAPABILITY_EPOCH.signals ?? '2026-09-19T11:20:34.000Z') - 86_400_000)

describe('#3504 — un effectif à revérifier ne pèse pas', () => {
  it('compte frais et cohérent : rien ne change', () => {
    const out = withoutStaleHeadcount({
      barrier: barrier(),
      addressability: addressability(),
      employees: '50 à 99 salariés',
      signalsCollectedAt: FRESH,
    })
    expect(out.recheck).toBe(false)
    expect(out.barrier).toEqual(barrier())
    expect(out.addressability).toEqual(addressability())
  })

  it('effectif contredit par l’en-tête : la proportion sort des facteurs ET du dénominateur, nommée non évaluée', () => {
    const out = withoutStaleHeadcount({
      barrier: barrier(),
      addressability: addressability(),
      employees: 'Plus de 10 000 salariés',
      signalsCollectedAt: FRESH,
    })
    expect(out.recheck).toBe(true)
    expect(out.addressability?.factors.map(f => f.axis)).toEqual(['lock', 'path'])
    expect(out.addressability?.score).toBe(7)
    expect(out.addressability?.max).toBe(15)
    expect(out.addressability?.unmeasured).toEqual(['access_cost', 'proportion'])
  })

  it('l’effectif de la barrière devient non mesuré, sort de la somme, et le reste est nommé', () => {
    const out = withoutStaleHeadcount({
      barrier: barrier(),
      addressability: null,
      employees: 'Plus de 10 000 salariés',
      signalsCollectedAt: FRESH,
    })
    const effectif = out.barrier?.proxies.find(p => p.key === 'effectif')
    expect(effectif).toMatchObject({ contribution: 0, measurable: false })
    expect(out.barrier?.score).toBe(5.32)
    expect(out.barrier?.accessibility).toBe(4.68)
    expect(out.barrier?.missing).toContain('effectif')
    // 5,32 reste dans la classe C (≤ 7) ; 4,9 tomberait en B : la classe suit le score.
    expect(out.barrier?.access_class).toBe('C')
  })

  it('la classe est relue du nouveau score', () => {
    const b = { ...barrier(), score: 5.1 }
    const out = withoutStaleHeadcount({
      barrier: b,
      addressability: null,
      employees: 'Plus de 10 000',
      signalsCollectedAt: FRESH,
    })
    expect(out.barrier?.score).toBe(4.92)
    expect(out.barrier?.access_class).toBe('B')
    expect(out.barrier?.label).toBe('Ouvert par une entité')
  })

  it('compte collecté avant la correction : même traitement, sans comparer les chiffres', () => {
    const out = withoutStaleHeadcount({
      barrier: barrier(),
      addressability: addressability(),
      employees: null,
      signalsCollectedAt: OLD,
    })
    expect(out.recheck).toBe(true)
    expect(out.addressability?.unmeasured).toContain('proportion')
  })

  it('trop peu de proxies mesurables après retrait : plus de score nu, le non mesuré est dit', () => {
    const b = {
      ...barrier(),
      proxies: [
        proxy('statut', 3),
        proxy('effectif', 0.18, true, 'effectif 53 salariés'),
        proxy('cotation', 1),
        proxy('commande_publique', 0, false),
      ],
    }
    const out = withoutStaleHeadcount({
      barrier: b,
      addressability: null,
      employees: 'Plus de 10 000',
      signalsCollectedAt: FRESH,
    })
    expect(out.barrier).toMatchObject({ measurable: false, score: null, access_class: null, accessibility: null })
  })

  it('sait dire NON : sans effectif dans la preuve, un en-tête ne juge rien', () => {
    expect(headcountContradictsHeader('effectif inconnu au registre', 'Plus de 10 000 salariés')).toBe(false)
    expect(headcountContradictsHeader('effectif 53 salariés', 'Plus de 10 000 salariés')).toBe(true)
  })
})
