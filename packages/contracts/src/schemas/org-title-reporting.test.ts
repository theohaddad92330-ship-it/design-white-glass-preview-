import { describe, expect, it } from 'vitest'
import { inferReportingFromTitles, orgTitleFamily } from './org-title-reporting.js'

/**
 * #4016 L4.2 (décision Louis 11/10/2026) — l'organigramme INFÉRÉ : un N+1
 * PROBABLE déduit des intitulés, provenance `inferred`, dessiné en pointillés,
 * jamais écrit comme un fait et jamais dans le chemin recommandé.
 */
type P = { id: string; title: string | null; entityId: string | null; hierarchyLevel: string | null }
const person = (id: string, title: string, hierarchyLevel: string, entityId = 'e1'): P => ({
  id,
  title,
  entityId,
  hierarchyLevel,
})

describe('orgTitleFamily', () => {
  it('classe un intitulé dans sa fonction', () => {
    expect(orgTitleFamily('Directeur des Systèmes d’Information')).toBe('it')
    expect(orgTitleFamily('Head of Data Engineering')).toBe('data')
    expect(orgTitleFamily('RSSI')).toBe('security')
    expect(orgTitleFamily('Responsable des achats IT')).toBe('procurement')
    expect(orgTitleFamily('Chargée de mission')).toBeNull()
  })
})

describe('inferReportingFromTitles', () => {
  it('rattache un responsable de la fonction au seul dirigeant plus haut de la même fonction', () => {
    const edges = inferReportingFromTitles([
      person('dsi', 'DSI', 'L1'),
      person('resp-infra', 'Responsable infrastructure IT', 'L3'),
    ])
    expect(edges).toEqual([
      expect.objectContaining({ fromId: 'resp-infra', toId: 'dsi', family: 'it', source: 'inferred' }),
    ])
  })

  it('choisit l’échelon le plus PROCHE au-dessus (N+1, pas N+2)', () => {
    const edges = inferReportingFromTitles([
      person('dsi', 'DSI', 'L1'),
      person('dir-etudes', 'Directeur des études informatiques', 'L2'),
      person('chef', 'Responsable applications IT', 'L3'),
    ])
    expect(edges.find(edge => edge.fromId === 'chef')?.toId).toBe('dir-etudes')
    expect(edges.find(edge => edge.fromId === 'dir-etudes')?.toId).toBe('dsi')
  })

  it('une fonction sans tête propre (data, sécurité) remonte à la tête du SI', () => {
    const edges = inferReportingFromTitles([person('dsi', 'CIO', 'L1'), person('rssi', 'RSSI', 'L3')])
    expect(edges).toEqual([expect.objectContaining({ fromId: 'rssi', toId: 'dsi' })])
  })

  it('sait dire NON : deux têtes possibles au même échelon ⇒ aucune arête (on ne choisit pas au hasard)', () => {
    const edges = inferReportingFromTitles([
      person('dsi-a', 'DSI', 'L1'),
      person('dsi-b', 'Directeur informatique', 'L1'),
      person('resp', 'Responsable IT', 'L3'),
    ])
    expect(edges).toEqual([])
  })

  it('sait dire NON : jamais d’une entité à une autre, jamais entre deux fonctions sans lien', () => {
    expect(
      inferReportingFromTitles([person('dsi', 'DSI', 'L1', 'e1'), person('resp', 'Responsable IT', 'L3', 'e2')]),
    ).toEqual([])
    expect(inferReportingFromTitles([person('daf', 'DAF', 'L1'), person('resp', 'Responsable IT', 'L3')])).toEqual([])
  })

  it('n’infère rien pour une personne qui a DÉJÀ un rattachement (prouvé ou supposé)', () => {
    const edges = inferReportingFromTitles(
      [person('dsi', 'DSI', 'L1'), person('resp', 'Responsable IT', 'L3')],
      new Set(['resp']),
    )
    expect(edges).toEqual([])
  })

  it('ne lit que l’intitulé, l’entité et l’échelon — aucun critère protégé n’entre (c58)', () => {
    const withExtras = [
      { ...person('dsi', 'DSI', 'L1'), age: 61, gender: 'f', photoUrl: 'x' },
      { ...person('resp', 'Responsable IT', 'L3'), age: 30, gender: 'm', photoUrl: 'y' },
    ]
    const plain = [person('dsi', 'DSI', 'L1'), person('resp', 'Responsable IT', 'L3')]
    expect(inferReportingFromTitles(withExtras)).toEqual(inferReportingFromTitles(plain))
  })
})
