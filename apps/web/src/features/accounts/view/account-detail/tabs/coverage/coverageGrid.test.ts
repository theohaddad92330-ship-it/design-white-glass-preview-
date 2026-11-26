import { describe, expect, it } from 'vitest'
import type { CoverageGapsResponse } from '@bellum/contracts'
import { buildCoverageGrid, coverageOffersAction } from './coverageGrid'

function payload(overrides: Partial<CoverageGapsResponse> = {}): CoverageGapsResponse {
  return {
    account_id: 'acc-1',
    score: 0.5,
    contacts_total: 3,
    classified_contacts: 3,
    target_contacts: 12,
    families: [
      { family: 'it', label: 'IT / DSI', covered: true, contact_count: 3, is_target: true },
      { family: 'cyber', label: 'Cyber / Sécurité', covered: false, contact_count: 0, is_target: true },
      { family: 'rh', label: 'RH', covered: false, contact_count: 0, is_target: false },
    ],
    families_covered: 1,
    families_target: 3,
    levels: [
      { level: 'c_level', label: 'C-Level (sponsor)', covered: false, contact_count: 0 },
      { level: 'n1', label: 'N-1 (décideur)', covered: true, contact_count: 1 },
      { level: 'n2', label: 'N-2 (relais)', covered: true, contact_count: 2 },
    ],
    levels_covered: 2,
    levels_target: 3,
    champion_count: 0,
    single_champion_risk: true,
    gaps: [
      {
        family: 'it',
        family_label: 'IT / DSI',
        level: 'c_level',
        level_label: 'C-Level (sponsor)',
        label: 'IT / DSI — DSI / CIO (C-Level)',
        suggested_titles: 'DSI / CIO',
        reason: 'Aucun sponsor exécutif.',
        priority: 1,
      },
    ],
    ...overrides,
  }
}

describe('buildCoverageGrid', () => {
  it('keeps target families plus any covered support family, in payload order', () => {
    const grid = buildCoverageGrid(payload())
    expect(grid.map(row => row.family)).toEqual(['it', 'cyber'])

    const withCoveredSupport = buildCoverageGrid(
      payload({
        families: [
          { family: 'it', label: 'IT / DSI', covered: true, contact_count: 3, is_target: true },
          { family: 'rh', label: 'RH', covered: true, contact_count: 1, is_target: false },
        ],
      }),
    )
    expect(withCoveredSupport.map(row => row.family)).toEqual(['it', 'rh'])
  })

  it('gives every row one cell per level, in the payload level order', () => {
    const grid = buildCoverageGrid(payload())
    expect(grid[0].cells.map(cell => cell.level)).toEqual(['c_level', 'n1', 'n2'])
  })

  it("marks a returned gap's cell as the zone blanche to open", () => {
    const grid = buildCoverageGrid(payload())
    const it = grid.find(row => row.family === 'it')!
    expect(it.cells.find(c => c.level === 'c_level')).toMatchObject({ status: 'gap' })
  })

  it('marks every cell of a family without a single contact as empty', () => {
    const cyber = buildCoverageGrid(payload()).find(row => row.family === 'cyber')!
    expect(cyber.cells.map(c => c.status)).toEqual(['empty', 'empty', 'empty'])
  })

  it('marks a cell empty when the LEVEL has no contact at all on the account', () => {
    // c_level has 0 contacts account-wide → no family can be covered there, even
    // when the backend did not emit an explicit gap for that cell.
    const grid = buildCoverageGrid(payload({ gaps: [] }))
    const it = grid.find(row => row.family === 'it')!
    expect(it.cells.find(c => c.level === 'c_level')!.status).toBe('empty')
  })

  it('marks a covered family × covered level cell as partial — never invents a covered cell', () => {
    // The endpoint reports family totals and level totals, NOT the per-cell
    // intersection: the most we can honestly claim is "possible coverage".
    const it = buildCoverageGrid(payload()).find(row => row.family === 'it')!
    expect(it.cells.find(c => c.level === 'n1')!.status).toBe('partial')
    expect(it.cells.find(c => c.level === 'n2')!.status).toBe('partial')
    // The union itself forbids a "proven covered" state.
    expect(it.cells.every(c => ['gap', 'empty', 'partial'].includes(c.status))).toBe(true)
  })

  it('carries the gap on the cell so the row stays actionable', () => {
    const it = buildCoverageGrid(payload()).find(row => row.family === 'it')!
    expect(it.cells.find(c => c.level === 'c_level')!.gap?.suggested_titles).toBe('DSI / CIO')
    expect(it.cells.find(c => c.level === 'n1')!.gap).toBeUndefined()
  })

  it('returns an empty grid when the payload carries no family', () => {
    expect(buildCoverageGrid(payload({ families: [] }))).toEqual([])
  })

  // ── Maquette p19 : matrice par ENTITÉ, famille et niveau ───────────────────

  it("marque « non prioritaire » les cases d'une famille support, jamais « zone blanche »", () => {
    // Une famille support vide n'est pas un trou à combler : la peindre en rouge
    // gonfle artificiellement les zones blanches (maquette p19).
    const grid = buildCoverageGrid(
      payload({
        families: [
          { family: 'it', label: 'IT / DSI', covered: true, contact_count: 3, is_target: true },
          { family: 'rh', label: 'RH', covered: true, contact_count: 1, is_target: false },
        ],
        cells: [{ family: 'rh', level: 'n2', contact_count: 1 }],
      }),
    )
    const rh = grid.find(row => row.family === 'rh')!
    expect(rh.cells.find(c => c.level === 'n2')!.status).toBe('covered')
    expect(rh.cells.find(c => c.level === 'c_level')!.status).toBe('not_priority')
    expect(rh.cells.find(c => c.level === 'n1')!.status).toBe('not_priority')
  })

  it("porte sur la ligne l'action recommandée (le gap le plus prioritaire de la famille)", () => {
    const grid = buildCoverageGrid(
      payload({
        gaps: [
          {
            family: 'it',
            family_label: 'IT / DSI',
            level: 'n2',
            level_label: 'N-2 (relais)',
            label: 'IT / DSI — Responsable SI (N-2)',
            suggested_titles: 'Responsable SI',
            reason: 'Pas de relais terrain.',
            priority: 3,
          },
          {
            family: 'it',
            family_label: 'IT / DSI',
            level: 'c_level',
            level_label: 'C-Level (sponsor)',
            label: 'IT / DSI — DSI / CIO (C-Level)',
            suggested_titles: 'DSI / CIO',
            reason: 'Aucun sponsor exécutif.',
            priority: 1,
          },
        ],
      }),
    )
    const it = grid.find(row => row.family === 'it')!
    expect(it.action?.level).toBe('c_level')
    expect(it.action?.suggested_titles).toBe('DSI / CIO')
    // Une famille sans zone blanche n'affiche aucune action inventée.
    expect(grid.find(row => row.family === 'cyber')?.action).toBeUndefined()
  })

  it('scope la matrice sur UNE entité : couvert ailleurs ne veut pas dire couvert ici', () => {
    const data = payload({
      cells: [
        { family: 'it', level: 'n1', contact_count: 2 },
        { family: 'it', level: 'n2', contact_count: 1 },
      ],
      entity_cells: [
        { entity: 'TF1 SA', family: 'it', level: 'n1', contact_count: 2 },
        { entity: 'TF1 Pub', family: 'it', level: 'n2', contact_count: 1 },
      ],
    })

    const groupWide = buildCoverageGrid(data).find(row => row.family === 'it')!
    expect(groupWide.cells.find(c => c.level === 'n1')!.status).toBe('covered')

    const tf1Pub = buildCoverageGrid(data, 'TF1 Pub').find(row => row.family === 'it')!
    // N-1 est couvert chez TF1 SA — chez TF1 Pub c'est une case vide, pas un « couvert ».
    expect(tf1Pub.cells.find(c => c.level === 'n1')!.status).toBe('empty')
    expect(tf1Pub.cells.find(c => c.level === 'n2')!.status).toBe('covered')
    expect(tf1Pub.cells.find(c => c.level === 'n2')!.contactCount).toBe(1)
    // Le compteur de ligne suit le scope : 1 contact IT chez TF1 Pub, pas 3.
    expect(tf1Pub.contactCount).toBe(1)
  })

  it("ne prétend rien sur une entité quand le serveur n'a pas émis la matrice par entité", () => {
    // Payload en cache d'avant `entity_cells` : on reste sur la matrice agrégée
    // plutôt que d'afficher une entité vide qui n'est qu'une absence de donnée.
    const data = payload({ cells: [{ family: 'it', level: 'n1', contact_count: 2 }] })
    const scoped = buildCoverageGrid(data, 'TF1 Pub').find(row => row.family === 'it')!
    expect(scoped.cells.find(c => c.level === 'n1')!.status).toBe('covered')
    expect(scoped.contactCount).toBe(3)
  })
})

describe('coverageOffersAction — §33, l’onglet ne reste que s’il sert', () => {
  it('propose une action dès qu’une zone blanche est rangée', () => {
    expect(coverageOffersAction(payload())).toBe(true)
  })

  it('n’en propose aucune quand le serveur n’a rangé aucune zone blanche', () => {
    expect(coverageOffersAction(payload({ gaps: [] }))).toBe(false)
  })

  it('garde l’onglet tant que la réponse n’est pas arrivée', () => {
    // Chargement et erreur passent tous deux par `data === undefined`. Masquer
    // là ferait clignoter l’onglet à chaque rechargement.
    expect(coverageOffersAction(undefined)).toBe(true)
  })

  it('ne se décide PAS sur le score : couvert à 90 % avec un trou au comité, il reste une action', () => {
    expect(coverageOffersAction(payload({ score: 0.9 }))).toBe(true)
    // …et l’inverse : un score au sol sans zone blanche rangée ne donne rien à cliquer.
    expect(coverageOffersAction(payload({ score: 0.05, gaps: [] }))).toBe(false)
  })
})
