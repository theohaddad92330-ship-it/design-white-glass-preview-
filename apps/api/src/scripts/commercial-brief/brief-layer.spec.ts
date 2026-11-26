import type { CommercialBrief } from '@bellum/contracts'

import { applyLayer } from './brief-layer'
import type { Conversion } from './brief-engine'
import type { LayerPlan } from './plan-types'

/**
 * Couche Toulouse de BPCE (démo Thélio, 06/10/2026) : UN seul compte BPCE ; la couche AJOUTE à la base du groupe, sans
 * rien retirer, sans doubler une personne / un site / une entité déjà là, et nomme chaque section ajoutée
 * `toulouse-…`.
 */

const spec: LayerPlan = {
  key: 'toulouse',
  label: 'Toulouse',
  department: 'Toulouse',
  source: 'x.xlsx',
  titlePrefix: 'X',
  rewrites: [],
  sheets: [],
}

const brief = (patch: Partial<CommercialBrief>): CommercialBrief =>
  ({
    account_name: 'BPCE',
    generated_at: '2026-10-04T00:00:00.000Z',
    scope: 'france',
    headquarters: { label: 'Tours Duo', city: 'Paris' },
    kpis: [],
    what_i_know: [{ rubric: 'a', known: 'b', meaning: 'c' }],
    charts: [],
    entities: [],
    sites: [],
    prices: [],
    esn: [],
    people: [],
    sections: [],
    guardrails: [{ point: 'p', detail: 'd' }],
    ...patch,
  }) as CommercialBrief

const conv = (b: CommercialBrief, extra?: Partial<Conversion>): Conversion => ({
  brief: b,
  coverage: [],
  skipped: {},
  anomalies: [],
  ...extra,
})

describe('applyLayer — la couche s’ajoute à la base', () => {
  it('dédoublonne les personnes par nom (sans ordre) et complète la fiche existante', () => {
    const base = conv(
      brief({ people: [{ name: 'Caroline TOURREL', function: 'DRH', role: 'contact', email: 'c@bp.fr' }] }),
    )
    const layer = conv(
      brief({
        people: [
          { name: 'Tourrel Caroline', function: 'Autre', department: 'BP Occitane', role: 'decision_maker' },
          { name: 'Nathalie Versigny', role: 'decision_maker' },
        ],
      }),
    )
    const out = applyLayer(base, layer, spec).brief
    expect(out.people).toHaveLength(2)
    const caroline = out.people.find(p => p.name === 'Caroline TOURREL')
    // la base gagne sur les champs déjà remplis, la couche complète les vides, le rôle le plus fort est gardé
    expect(caroline).toMatchObject({
      function: 'DRH',
      email: 'c@bp.fr',
      department: 'BP Occitane',
      role: 'decision_maker',
    })
    // une personne NEUVE reçoit le département de la couche
    expect(out.people.find(p => p.name === 'Nathalie Versigny')?.department).toBe('Toulouse')
  })

  it('ajoute entités et sites seulement s’ils sont absents (casse, accents ignorés)', () => {
    const base = conv(
      brief({
        entities: [{ name: 'Estreem', status: 'active' }],
        sites: [{ name: 'BPCE SI — Toulouse-Balma', city: 'Balma', country: 'FR', kind: 'secondary' }],
      }),
    )
    const layer = conv(
      brief({
        entities: [
          { name: 'ESTREEM', status: 'active' },
          { name: 'Banque Populaire Occitane', status: 'active' },
        ],
        sites: [
          { name: 'BP Occitane — Balma', city: 'BALMA', country: 'FR', kind: 'secondary' },
          { name: "Estreem — L'Union", city: "L'Union", country: 'FR', kind: 'secondary' },
        ],
      }),
    )
    const out = applyLayer(base, layer, spec).brief
    expect(out.entities.map(e => e.name)).toEqual(['Estreem', 'Banque Populaire Occitane'])
    expect(out.sites.map(s => s.name)).toEqual(['BPCE SI — Toulouse-Balma', "Estreem — L'Union"])
  })

  it('ajoute les garde-fous de la couche, préfixés, sans toucher à ceux du groupe', () => {
    const base = conv(brief({ guardrails: [{ point: 'Strasbourg n’est pas le siège', detail: 'Tours Duo.' }] }))
    const layer = conv(brief({ guardrails: [{ point: 'Postes ouverts volatils', detail: 'Relevés fin septembre.' }] }))
    const out = applyLayer(base, layer, spec).brief
    expect(out.guardrails).toEqual([
      { point: 'Strasbourg n’est pas le siège', detail: 'Tours Duo.' },
      { point: 'Toulouse — Postes ouverts volatils', detail: 'Relevés fin septembre.' },
    ])
  })

  it('préfixe chaque section de la couche « toulouse- » et range le cockpit en cockpit-toulouse', () => {
    const base = conv(
      brief({
        sections: [{ key: 'fiche-compte', title: 'F', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] }],
      }),
    )
    const layer = conv(
      brief({
        kpis: [{ label: 'BALMA', value: '3 entités', caption: 'même commune' }],
        what_i_know: [{ rubric: 'TOULOUSE — LE PÔLE BPCE', known: 'Balma concentre.', meaning: 'Deux centres.' }],
        charts: [{ title: 'POSTES DATA PAR ENTITÉ', items: [{ label: 'BPCE SI', value: 10 }] }],
        sections: [
          { key: 'toulouse-postes-data', title: 'P', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] },
          { key: 'notes', title: 'Notes', columns: [{ key: 'a', label: 'A' }], rows: [{ a: '1' }] },
        ],
      }),
    )
    const out = applyLayer(base, layer, spec).brief
    expect(out.sections.map(s => s.key)).toEqual([
      'fiche-compte',
      'toulouse-postes-data',
      'toulouse-notes',
      'cockpit-toulouse',
    ])
    const cockpit = out.sections.find(s => s.key === 'cockpit-toulouse')
    // indicateurs, rubriques « ce que je sais » et points de graphique : rien n’est perdu
    const text = JSON.stringify(cockpit?.rows)
    expect(text).toContain('BALMA')
    expect(text).toContain('3 entités')
    expect(text).toContain('Balma concentre.')
    expect(text).toContain('Deux centres.')
    expect(text).toContain('POSTES DATA PAR ENTITÉ')
    expect(text).toContain('BPCE SI')
    // le cockpit du GROUPE (kpis, what_i_know, charts) reste celui de la base
    expect(out.kpis).toEqual([])
    expect(out.charts).toEqual([])
    expect(out.what_i_know).toEqual([{ rubric: 'a', known: 'b', meaning: 'c' }])
  })

  it('cumule la couverture (préfixée), les valeurs écartées et les anomalies', () => {
    const base = conv(brief({}), { coverage: [{ sheet: 'FICHE COMPTE', field: 'x', rows: 1 }], skipped: { a: 1 } })
    const layer = conv(brief({}), {
      coverage: [{ sheet: 'ESN TOULOUSE', field: 'y', rows: 45 }],
      skipped: { a: 2, b: 1 },
      anomalies: ['[COCKPIT] 1 point sans libellé'],
    })
    const out = applyLayer(base, layer, spec)
    expect(out.coverage.map(c => c.sheet)).toEqual(expect.arrayContaining(['FICHE COMPTE', '[Toulouse] ESN TOULOUSE']))
    expect(out.skipped).toEqual({ a: 3, b: 1 })
    expect(out.anomalies).toEqual(['[Toulouse] [COCKPIT] 1 point sans libellé'])
  })
})
