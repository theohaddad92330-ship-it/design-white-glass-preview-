import { ImportOverviewForLauraService } from './import-overview-for-laura.service'

// #4426.8 — Laura répondait « aucune session d'import récente » alors que l'historique de /settings/import
// montrait un tiering importé le 22/10 : elle ne lisait que l'ancien assistant (`import_sessions`). Elle lit
// maintenant LES MÊMES sources que l'écran (imports universels + assistant « Dépose tes documents ») et sait
// compter le tiering posé sur les comptes.
function build(opts: {
  history?: Record<string, unknown>[]
  contextPack?: Record<string, unknown>[]
  tiers?: { label: string; count: string }[]
}) {
  const universal = { history: jest.fn(async () => opts.history ?? []) }
  const contextPack = { list: jest.fn(async () => opts.contextPack ?? []) }
  const accounts = { query: jest.fn(async () => opts.tiers ?? []) }
  return {
    service: new ImportOverviewForLauraService(universal as never, contextPack as never, accounts as never),
    accounts,
  }
}

describe('ImportOverviewForLauraService (#4426.8)', () => {
  it('rend les imports universels de l’historique (le tiering du 22/10) avec fichier, état et volume', async () => {
    const { service } = build({
      history: [
        {
          filename: 'tiering2026-2027 v2.xlsx',
          status: 'done',
          imported: 275,
          rejected: 0,
          duplicates: 0,
          error: null,
          createdAt: '2026-10-22T08:00:00.000Z',
          interrupted: false,
        },
      ],
    })
    const overview = await service.read('ws-1', 'u-1')
    expect(overview.universal_imports).toEqual([
      {
        file_name: 'tiering2026-2027 v2.xlsx',
        status: 'done',
        imported: 275,
        rejected: 0,
        duplicates: 0,
        error: null,
        created_at: '2026-10-22T08:00:00.000Z',
        interrupted: false,
        operation_status: 'completed',
      },
    ])
  })

  // #4295.1 — Laura lisait l'état BRUT (`failed`, drapeau `interrupted` à part) quand l'écran dit « Interrompu » :
  // elle reçoit maintenant LE mot du vocabulaire partagé (`@bellum/contracts`), le même que l'écran.
  it('NON — un import en échec ou resté en suspens n’est jamais « terminé » pour Laura : interrompu (#4295.1)', async () => {
    const { service } = build({
      history: [
        {
          filename: 'a.csv',
          status: 'failed',
          imported: 40,
          rejected: 0,
          duplicates: 0,
          error: 'x',
          interrupted: false,
        },
        {
          filename: 'b.csv',
          status: 'processing',
          imported: 0,
          rejected: 0,
          duplicates: 0,
          error: null,
          interrupted: true,
        },
        { filename: 'c.csv', status: 'done', imported: 9, rejected: 3, duplicates: 0, error: null, interrupted: false },
        { filename: 'd.csv', status: 'zzz', imported: 0, rejected: 0, duplicates: 0, error: null, interrupted: false },
      ],
    })
    const overview = await service.read('ws-1', 'u-1')
    expect(overview.universal_imports.map(job => job.operation_status)).toEqual([
      'interrupted',
      'interrupted',
      'completed',
      null,
    ])
  })

  it('rend aussi les dépôts de l’assistant (postes, grille, séquences, connaissances)', async () => {
    const { service } = build({
      contextPack: [
        {
          fileName: 'Campagnes.xlsx',
          destination: 'sequences',
          status: 'done',
          imported: 9,
          skipped: 1,
          message: null,
          createdAt: '2026-10-22T09:00:00.000Z',
        },
      ],
    })
    const overview = await service.read('ws-1', 'u-1')
    expect(overview.context_pack_imports[0]).toMatchObject({ file_name: 'Campagnes.xlsx', destination: 'sequences' })
  })

  it('compte le tiering posé sur les comptes : A / B / C, jamais un « 0 » inventé pour un tier absent', async () => {
    const { service } = build({
      tiers: [
        { label: 'Tier A', count: '42' },
        { label: 'Tier B', count: '100' },
      ],
    })
    const overview = await service.read('ws-1', 'u-1')
    expect(overview.tiering).toEqual({ A: 42, B: 100, C: null })
  })

  it('aucun tier posé : `tiering` est null (« pas de tiering »), pas {A:0,B:0,C:0}', async () => {
    const { service } = build({})
    expect((await service.read('ws-1', 'u-1')).tiering).toBeNull()
  })
})
