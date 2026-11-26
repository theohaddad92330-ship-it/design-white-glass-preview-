import type { TerritoryOverview } from '@bellum/contracts'
import { TerritoryController } from './territory.controller'

/**
 * Le câblage du score de débordement sur l'écran Territoire.
 *
 * Ce fichier n'existait pas, et c'est la raison pour laquelle personne n'a vu
 * que le score ne sortait JAMAIS : `overflow-score.test.ts` prouvait que le
 * calcul est juste, et rien ne prouvait que ses entrées arrivent. Le motif est
 * celui que le dépôt corrige depuis six chantiers — du code juste que personne
 * n'alimente — et il ne se voit qu'en testant l'APPELANT.
 */
describe('l’écran Territoire — le câblage du score de débordement', () => {
  const overview = (esn: { name: string; offers: number }[]): TerritoryOverview => ({
    department: '31',
    sinceDays: 90,
    market: { state: 'ready', offers: 120 },
    competition: { state: 'ready', esnPresent: 40 },
    overflow: { state: 'ready', esn },
    accessible: { state: 'ready', openTenders: 3 },
    unknowns: ['Les panels fournisseurs privés de ce territoire.'],
  })

  const makeController = (rows: Record<string, unknown>[], esn: { name: string; offers: number }[]) => {
    const directory = {
      ensureSeeded: jest.fn().mockResolvedValue(undefined),
      knownNames: jest.fn().mockResolvedValue(rows.map(row => row['normalizedName'])),
      coverage: jest.fn().mockResolvedValue({ total: 477, resolved: 312, byStatus: {} }),
      factsByName: jest.fn().mockResolvedValue(new Map(rows.map(row => [row['normalizedName'], row]))),
    }
    const ia = { territoryOverview: jest.fn().mockResolvedValue(overview(esn)) }
    const workspaceContext = { resolveActiveWorkspace: jest.fn() }
    return {
      controller: new TerritoryController(directory as never, ia as never, workspaceContext as never),
      directory,
      ia,
    }
  }

  const scoreOf = (result: TerritoryOverview, name: string) => {
    const found = (result.overflow.esn ?? []).find(item => item.name === name)
    return found?.score as
      | {
          score: number | null
          scoreMax: number
          notCollected: string[]
          unmeasured: string[]
          reason: string | null
          axes: { axis: string; points: number | null; availability: string; evidence: string }[]
        }
      | undefined
  }

  it('DÉCLARE les signaux qu’aucune source ne produit, au lieu de les passer en `null` muet', async () => {
    // C'est tout l'objet du correctif : « pas encore mesuré » et « pas de
    // source » sortent tous deux du dénominateur, mais un seul des deux vaut
    // la peine d'attendre.
    const { controller } = makeController(
      [{ normalizedName: 'sii', riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null }],
      [{ name: 'SII', offers: 34 }],
    )
    const result = await controller.overview({ department: '31' } as never)
    const score = scoreOf(result, 'SII')

    expect(score?.notCollected).toEqual(expect.arrayContaining(['tension', 'charge_nouvelle']))
    const tension = score?.axes.find(axis => axis.axis === 'tension')
    expect(tension?.availability).toBe('not_collected')
    expect(tension?.points).toBeNull()
  })

  it('nomme la republication de poste dans la preuve, en français', async () => {
    const { controller } = makeController(
      [{ normalizedName: 'sii', riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null }],
      [{ name: 'SII', offers: 34 }],
    )
    const result = await controller.overview({ department: '31' } as never)
    const tension = scoreOf(result, 'SII')?.axes.find(axis => axis.axis === 'tension')
    expect(tension?.evidence).toContain('republications de poste')
  })

  it('garde l’ouverture au rang 2 ABSENTE et non « non collectée »', async () => {
    // La colonne `open_to_subcontracting` attend une déclaration humaine. La
    // ranger parmi les lacunes de collecte ferait construire un collecteur pour
    // une donnée que personne ne publie — c'est une déclaration, pas une source.
    const { controller } = makeController(
      [{ normalizedName: 'sii', riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null }],
      [{ name: 'SII', offers: 34 }],
    )
    const result = await controller.overview({ department: '31' } as never)
    const score = scoreOf(result, 'SII')
    expect(score?.notCollected).not.toContain('ouverture')
    expect(score?.axes.find(axis => axis.axis === 'ouverture')?.availability).toBe('absent')
  })

  it('dit que le score ne viendra pas tout seul, plutôt que « pas encore mesuré »', async () => {
    const { controller } = makeController(
      [{ normalizedName: 'sii', riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null }],
      [{ name: 'SII', offers: 34 }],
    )
    const result = await controller.overview({ department: '31' } as never)
    const score = scoreOf(result, 'SII')
    expect(score?.score).toBeNull()
    expect(score?.reason).toContain('pas de source')
  })

  it('mesure l’axe Volume dès qu’une moyenne existe, et le laisse SEUL au dénominateur', async () => {
    // La moyenne est le seul signal que la veille hebdomadaire construit
    // réellement. Elle ne suffit pas : sous deux axes mesurables il n'y a pas
    // de score, et c'est l'état réel de la production aujourd'hui.
    const { controller } = makeController(
      [
        {
          normalizedName: 'sii',
          riskFlag: 'aucun',
          openToSubcontracting: 'inconnu',
          hiringBaseline: { quarterlyAverage: 6 },
        },
      ],
      [{ name: 'SII', offers: 34 }],
    )
    const result = await controller.overview({ department: '31' } as never)
    const score = scoreOf(result, 'SII')
    const volume = score?.axes.find(axis => axis.axis === 'volume')
    expect(volume?.availability).toBe('measured')
    expect(volume?.evidence).toContain('34 offres sur 90 jours contre 6 en moyenne')
    expect(score?.score).toBeNull()
  })

  it('RETIRE de la liste une ESN en procédure collective, et le dit dans la raison du bloc', async () => {
    const { controller } = makeController(
      [
        { normalizedName: 'sii', riskFlag: 'aucun', openToSubcontracting: 'inconnu', hiringBaseline: null },
        { normalizedName: 'atos', riskFlag: 'alerte', openToSubcontracting: 'inconnu', hiringBaseline: null },
      ],
      [
        { name: 'SII', offers: 34 },
        { name: 'Atos', offers: 12 },
      ],
    )
    const result = await controller.overview({ department: '31' } as never)
    expect((result.overflow.esn ?? []).map(item => item.name)).toEqual(['SII'])
    expect(result.overflow.reason).toContain('Atos')
    expect(result.overflow.reason).toContain('Procédure collective')
  })
})

/**
 * N16 — le point d'entrée de la déclaration. La FICHE partenaire n'existe pas
 * encore côté écran (dette assumée) : ce test prouve la ROUTE, pas un rendu.
 */
describe('l’écran Territoire — la déclaration d’ouverture à la sous-traitance', () => {
  const makeController = () => {
    const directory = {
      declareSubcontracting: jest.fn().mockResolvedValue({ esnId: 'e1', recorded: true, aggregate: null }),
    }
    const ia = {}
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w1', role: 'sales' }),
    }
    return {
      controller: new TerritoryController(directory as never, ia as never, workspaceContext as never),
      directory,
      workspaceContext,
    }
  }

  it('résout l’espace ACTIF de l’appelant, et transmet sa déclaration au référentiel', async () => {
    const { controller, directory, workspaceContext } = makeController()
    const result = await controller.declareSubcontracting(
      { userId: 'u1' } as never,
      {
        esnName: 'SII',
        value: 'oui',
        confidence: 'certain',
        evidence: 'Appel direct avec leur commercial.',
      } as never,
    )

    expect(workspaceContext.resolveActiveWorkspace).toHaveBeenCalledWith('u1')
    expect(directory.declareSubcontracting).toHaveBeenCalledWith('w1', 'SII', {
      value: 'oui',
      confidence: 'certain',
      evidence: 'Appel direct avec leur commercial.',
    })
    expect(result).toEqual({ esnId: 'e1', recorded: true, aggregate: null })
  })

  it('ne fabrique jamais un texte de preuve — `undefined` devient `null`, jamais une chaîne inventée', async () => {
    const { controller, directory } = makeController()
    await controller.declareSubcontracting(
      { userId: 'u1' } as never,
      {
        esnName: 'SII',
        value: 'non',
        confidence: 'suppose',
      } as never,
    )
    expect(directory.declareSubcontracting).toHaveBeenCalledWith('w1', 'SII', {
      value: 'non',
      confidence: 'suppose',
      evidence: null,
    })
  })
})
