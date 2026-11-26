import { describe, expect, it } from 'vitest'
import { COMMUNITY_THRESHOLD } from './community-facts.js'
import {
  SHARED_ALL,
  SHARED_BASE_MIN_WORKSPACES,
  SHARED_SIZE_BANDS,
  isSharedToken,
  poolSharedCells,
  readSharedCells,
  sectorKeyOfNaf,
  sizeBandOfEmployees,
} from './shared-anonymous-base.js'

describe('P05 — base anonyme commune : le seuil', () => {
  it('k = 3 espaces, le MÊME nombre que la donnée communautaire (GA-26)', () => {
    expect(SHARED_BASE_MIN_WORKSPACES).toBe(3)
    expect(SHARED_BASE_MIN_WORKSPACES).toBe(COMMUNITY_THRESHOLD)
  })

  it('sait dire NON — une cellule portée par DEUX espaces ne sort pas', () => {
    const cells = poolSharedCells([
      { workspaceId: 'w1', cell: { value: 'relance' }, counts: { positive: 5, judged: 9 } },
      { workspaceId: 'w2', cell: { value: 'relance' }, counts: { positive: 1, judged: 2 } },
      // le même espace qui se répète reste UNE voix
      { workspaceId: 'w2', cell: { value: 'relance' }, counts: { positive: 1, judged: 1 } },
    ])
    expect(cells).toEqual([])
  })

  it('trois espaces distincts : la cellule sort, sommée, SANS un identifiant d’espace', () => {
    const cells = poolSharedCells([
      { workspaceId: 'w1', cell: { value: 'relance' }, counts: { positive: 5, judged: 9 } },
      { workspaceId: 'w2', cell: { value: 'relance' }, counts: { positive: 1, judged: 2 } },
      { workspaceId: 'w3', cell: { value: 'relance' }, counts: { positive: 0, judged: 4 } },
      { workspaceId: 'w1', cell: { value: 'initial' }, counts: { positive: 3, judged: 3 } },
    ])
    expect(cells).toEqual([
      { cell: { value: 'relance' }, counts: { positive: 6, judged: 15 }, contributingWorkspaces: 3 },
    ])
    expect(JSON.stringify(cells)).not.toMatch(/w1|w2|w3/)
  })

  it('un espace dont les comptes sont TOUS à zéro ne compte pas comme contributeur', () => {
    const cells = poolSharedCells([
      { workspaceId: 'w1', cell: { value: 'relance' }, counts: { positive: 1, judged: 1 } },
      { workspaceId: 'w2', cell: { value: 'relance' }, counts: { positive: 1, judged: 1 } },
      { workspaceId: 'w3', cell: { value: 'relance' }, counts: { positive: 0, judged: 0 } },
    ])
    expect(cells).toEqual([])
  })
})

describe('P05 — jamais un nom, jamais un texte libre', () => {
  it('un jeton fermé passe', () => {
    for (const value of ['relance', 'partner_route', 'naf_62', 'eti', SHARED_ALL])
      expect(isSharedToken(value)).toBe(true)
  })

  it('sait dire NON — un nom de société, de personne ou une phrase est refusé', () => {
    for (const value of ['Société Générale', 'Airbus SE', 'Jean Dupont', 'le client a dit non', 'prix trop haut', '']) {
      expect(isSharedToken(value)).toBe(false)
    }
  })

  it('une cellule qui porte un texte libre ne sort pas, même à dix espaces', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      workspaceId: `w${index}`,
      cell: { value: 'Banque Populaire' },
      counts: { won: 1 },
    }))
    expect(poolSharedCells(rows)).toEqual([])
  })
})

describe('P05 — la LECTURE redit le seuil (défense en profondeur)', () => {
  it('aucune ligne : « pas assez de données communes », jamais 0', () => {
    expect(readSharedCells([])).toEqual({ status: 'not_enough_shared_data' })
  })

  it('sait dire NON — une ligne stockée sous le seuil est écartée à la lecture', () => {
    expect(readSharedCells([{ contributingWorkspaces: 2, value: 'relance' }])).toEqual({
      status: 'not_enough_shared_data',
    })
  })

  it('au-dessus du seuil : les lignes, et le plus petit nombre d’espaces contributeurs', () => {
    expect(
      readSharedCells([
        { contributingWorkspaces: 4, value: 'relance' },
        { contributingWorkspaces: 2, value: 'initial' },
        { contributingWorkspaces: 3, value: 'close_loop' },
      ]),
    ).toEqual({
      status: 'shared',
      contributingWorkspaces: 3,
      rows: [
        { contributingWorkspaces: 4, value: 'relance' },
        { contributingWorkspaces: 3, value: 'close_loop' },
      ],
    })
  })
})

describe('P05 — secteur et taille : des vocabulaires FERMÉS', () => {
  it('le secteur est la DIVISION NAF (deux chiffres), jamais le libellé libre', () => {
    expect(sectorKeyOfNaf('64.19Z')).toBe('naf_64')
    expect(sectorKeyOfNaf('6201Z')).toBe('naf_62')
    expect(sectorKeyOfNaf(null)).toBeNull()
    expect(sectorKeyOfNaf('Banque')).toBeNull()
  })

  it('la taille est une catégorie INSEE, lue sur le premier nombre de la tranche', () => {
    expect(SHARED_SIZE_BANDS).toEqual(['tpe', 'pme', 'eti', 'ge'])
    expect(sizeBandOfEmployees('10 000 salariés et plus (tranche INSEE 2023)')).toBe('ge')
    expect(sizeBandOfEmployees('5 000 à 9 999 salariés')).toBe('ge')
    expect(sizeBandOfEmployees('250 à 499 salariés')).toBe('eti')
    expect(sizeBandOfEmployees('50-99')).toBe('pme')
    expect(sizeBandOfEmployees('3 à 5 salariés')).toBe('tpe')
  })

  it('sait dire NON — une taille illisible est inconnue, jamais devinée', () => {
    expect(sizeBandOfEmployees(null)).toBeNull()
    expect(sizeBandOfEmployees('grande entreprise')).toBeNull()
  })
})
