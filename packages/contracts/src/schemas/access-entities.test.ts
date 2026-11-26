import { describe, expect, it } from 'vitest'
import { rankAccessEntities, shouldAvoidGroupEntry, type AccessEntityInput } from './access-entities.js'

const entity = (over: Partial<AccessEntityInput> & { id: string; name: string }): AccessEntityInput => ({
  kind: 'unknown',
  rank1Incumbent: null,
  contactCount: 0,
  siteCount: 0,
  ...over,
})

describe('rankAccessEntities', () => {
  it('puts the entity where we already know someone first', () => {
    // La porte la plus courte est celle où l'on connaît quelqu'un. C'est un
    // FAIT de la base, pas une préférence.
    const ranked = rankAccessEntities([
      entity({ id: '1', name: 'Siège', kind: 'unknown' }),
      entity({ id: '2', name: 'Autoroutes', kind: 'subsidiary', contactCount: 3 }),
      entity({ id: '3', name: 'Energies', kind: 'subsidiary' }),
    ])
    expect(ranked.map(r => r.name)).toEqual(['Autoroutes', 'Energies', 'Siège'])
    expect(ranked[0]?.reason).toContain('3 contacts')
  })

  it('says out loud when nothing is known about a perimeter', () => {
    const [only] = rankAccessEntities([entity({ id: '1', name: 'Périmètre non déterminé' })])
    expect(only?.reason).toBe('aucun fait connu sur ce périmètre')
    expect(only?.score).toBe(0)
  })

  it('keeps a known tier-1 as a PATH, never as a penalty', () => {
    const ranked = rankAccessEntities([
      entity({ id: '1', name: 'Avec rang 1', kind: 'bu', rank1Incumbent: 'Sopra' }),
      entity({ id: '2', name: 'Sans rang 1', kind: 'bu' }),
    ])
    expect(ranked[0]?.name).toBe('Avec rang 1')
    expect(ranked[0]?.reason).toContain('Sopra')
  })

  it('never shows the raw enum value, and « no » is not a known tier-1 (#3473)', () => {
    const [yes] = rankAccessEntities([entity({ id: '1', name: 'A', rank1Incumbent: 'yes' })])
    expect(yes?.reason).toBe('rang 1 installé')
    const [no] = rankAccessEntities([entity({ id: '2', name: 'B', rank1Incumbent: 'no' })])
    expect(no?.score).toBe(0)
    expect(no?.reason).not.toMatch(/\b(yes|no)\b/)
  })

  it('exposes the reason as structured facts so the screen can say it in any language (#3473)', () => {
    const [full] = rankAccessEntities([
      entity({ id: '1', name: 'A', kind: 'subsidiary', contactCount: 3, siteCount: 1, rank1Incumbent: 'Sopra' }),
    ])
    expect(full?.reasonFacts).toEqual([
      { code: 'kind', kind: 'subsidiary', points: 25 },
      { code: 'contacts', count: 3, points: 18 },
      { code: 'sites', count: 1, points: 8 },
      { code: 'rank1', value: 'Sopra', points: 5 },
    ])
    const [yes] = rankAccessEntities([entity({ id: '2', name: 'B', rank1Incumbent: 'yes' })])
    expect(yes?.reasonFacts).toEqual([{ code: 'rank1', points: 5 }])
    const [none] = rankAccessEntities([entity({ id: '3', name: 'C' })])
    expect(none?.reasonFacts).toEqual([])
  })

  it('falls back to alphabetical order rather than faking a ranking', () => {
    const ranked = rankAccessEntities([entity({ id: '1', name: 'Zeta' }), entity({ id: '2', name: 'Alpha' })])
    expect(ranked.map(r => r.name)).toEqual(['Alpha', 'Zeta'])
  })

  it('caps what a single fact can buy — 40 contacts is not seven times better than 6', () => {
    const many = rankAccessEntities([entity({ id: '1', name: 'A', contactCount: 40 })])[0]
    const few = rankAccessEntities([entity({ id: '1', name: 'A', contactCount: 7 })])[0]
    expect(many?.score).toBe(few?.score)
  })
})

describe('shouldAvoidGroupEntry', () => {
  it('avoids the group from class C onwards — never attack the head office', () => {
    expect(shouldAvoidGroupEntry('C')).toBe(true)
    expect(shouldAvoidGroupEntry('D')).toBe(true)
  })

  it('leaves the group open on A and B, and on an unestimated barrier', () => {
    // Une barrière non estimable n'est pas une barrière haute : écarter le
    // groupe faute d'information reviendrait à conclure d'un silence.
    expect(shouldAvoidGroupEntry('A')).toBe(false)
    expect(shouldAvoidGroupEntry('B')).toBe(false)
    expect(shouldAvoidGroupEntry(null)).toBe(false)
    expect(shouldAvoidGroupEntry(undefined)).toBe(false)
  })
})

describe('rankAccessEntities — le score porte ses axes (#4016 L9, renversement daté du 11/10/2026 de c48)', () => {
  it('la somme des points des faits est EXACTEMENT le score — rien de caché, rien d’inventé', () => {
    const [ranked] = rankAccessEntities([
      entity({ id: '1', name: 'Autoroutes', kind: 'subsidiary', contactCount: 3, siteCount: 1, rank1Incumbent: 'yes' }),
    ])
    expect(ranked?.reasonFacts.map(fact => [fact.code, fact.points])).toEqual([
      ['kind', 25],
      ['contacts', 18],
      ['sites', 8],
      ['rank1', 5],
    ])
    expect(ranked?.reasonFacts.reduce((sum, fact) => sum + fact.points, 0)).toBe(ranked?.score)
    expect(ranked?.missingAxes).toEqual([])
  })

  it('les plafonds sont dans les points affichés, pas seulement dans le total', () => {
    const [ranked] = rankAccessEntities([
      entity({ id: '1', name: 'Gros', kind: 'bu', contactCount: 99, siteCount: 99 }),
    ])
    expect(ranked?.reasonFacts.find(fact => fact.code === 'contacts')?.points).toBe(40)
    expect(ranked?.reasonFacts.find(fact => fact.code === 'sites')?.points).toBe(16)
  })

  it('NOMME les axes sans fait au lieu de les compter zéro — et un rang 1 « non » est une réponse connue', () => {
    const [unknown] = rankAccessEntities([entity({ id: '1', name: 'Seule', kind: 'bu', contactCount: 2 })])
    expect(unknown?.missingAxes).toEqual(['sites', 'rank1'])
    const [no] = rankAccessEntities([
      entity({ id: '2', name: 'Sans', kind: 'bu', contactCount: 2, rank1Incumbent: 'no' }),
    ])
    expect(no?.missingAxes).toEqual(['sites'])
  })

  it('une entité sans aucun fait nomme ses quatre axes manquants', () => {
    const [none] = rankAccessEntities([entity({ id: '1', name: 'Rien' })])
    expect(none?.reasonFacts).toEqual([])
    expect(none?.missingAxes).toEqual(['kind', 'contacts', 'sites', 'rank1'])
  })
})
