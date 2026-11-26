import { SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { DossierBlocksStep } from './dossier-blocks.step'
import { runDossierBlocksCatchUp } from './dossier-blocks-catch-up.runner'

/**
 * #4078 — l'étape qui ÉCRIT les cinq blocs du dossier complet après une vraie
 * analyse, et son rattrapage. Ce fichier prouve : seules les clés ABSENTES
 * s'écrivent (un import ou une correction n'est jamais écrasé), un bloc vide
 * n'écrit rien, un échec du modèle ne coûte pas les blocs calculés, une note qui
 * nomme un fournisseur n'entre pas, et le rattrapage ne touche rien en simulation.
 */

const ACCOUNT = 'acc-1'
const WORKSPACE = 'ws-1'
const NOW = new Date('2026-10-12T00:00:00Z')

const RAW = {
  legal_form: 'SA',
  activity_label: 'Fabrication de machines',
  financials_history: [
    { year: 2023, revenue: 100_000_000, net_result: 4_000_000, headcount: 400 },
    { year: 2025, revenue: 110_000_000, net_result: 5_000_000, headcount: 420 },
  ],
  it_job_signals: [{ title: 'Data engineer' }],
  // Notre plan : ne décrit pas le compte, n'entre pas dans le prompt.
  angles: [{ title: 'angle secret' }],
}

const synthNote = (label: string, over: Record<string, unknown> = {}) => ({
  label,
  constat: 'Six offres data ouvertes.',
  interpretation: null,
  implication: 'Entrer par la data.',
  reliability: 'offres d’emploi — indice',
  amount: null,
  currency: null,
  period: null,
  ...over,
})

function setup(opts: { raw?: Record<string, unknown>; iaError?: Error; blocks?: Record<string, unknown> } = {}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) =>
    sql.trim().startsWith('SELECT') ? [{ company_name: 'Acme Industrie', raw_analysis: opts.raw ?? RAW }] : [],
  )
  const ia = {
    dossierBlocks: opts.iaError
      ? jest.fn().mockRejectedValue(opts.iaError)
      : jest.fn().mockResolvedValue({
          blocks: opts.blocks ?? {
            structural_reading_axes: [synthNote('Organisation par métiers')],
            ecosystem_third_parties: [],
            opportunity_domains: [synthNote('Data & IA'), synthNote('Cloud', { reliability: 'Pappers — établi' })],
          },
          costUsd: 0.04,
        }),
  }
  const step = new DossierBlocksStep(ia as never, { query } as never, () => NOW)
  // Les écritures de `raw_analysis` ; la date de collecte du segment se lit à part (`stamps`).
  const updates = () =>
    query.mock.calls.filter(([sql]) => sql.trim().startsWith('UPDATE accounts') && sql.includes('raw_analysis'))
  const stamps = () => query.mock.calls.filter(([sql]) => sql.includes('dossier_blocks_collected_at'))
  const patchOf = () => JSON.parse(String(updates()[0]?.[1]?.[0])) as Record<string, unknown[]>
  return { step, query, ia, updates, patchOf, stamps }
}

describe('DossierBlocksStep', () => {
  it('écrit les cinq blocs, en un seul appel modèle, sans la note qui nomme un fournisseur', async () => {
    const { step, ia, patchOf } = setup()
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(ia.dossierBlocks).toHaveBeenCalledTimes(1)
    const sent = ia.dossierBlocks.mock.calls[0][0] as { accountName: string; dossier: Record<string, unknown> }
    expect(sent.accountName).toBe('Acme Industrie')
    expect(sent.dossier).toHaveProperty('financials_history')
    expect(sent.dossier).not.toHaveProperty('angles')
    const patch = patchOf()
    expect(Object.keys(patch).sort()).toEqual(
      ['financial_indicators', 'opportunity_domains', 'structural_reading_axes'].sort(),
    )
    expect((patch.opportunity_domains as Array<{ label: string }>).map(n => n.label)).toEqual(['Data & IA'])
  })

  it('RAFRAÎCHIT une clé déjà posée (import, analyse antérieure) — #4078, Louis 15/10', async () => {
    const imported = [{ label: 'Axe importé' }]
    const { step, patchOf } = setup({ raw: { ...RAW, structural_reading_axes: imported } })
    await step.produceDossierBlocks(ACCOUNT, WORKSPACE)
    expect(patchOf()).toHaveProperty('structural_reading_axes')
    expect((patchOf().structural_reading_axes as Array<{ label: string }>)[0]?.label).toBe('Organisation par métiers')
  })

  it('sait dire NON : une correction humaine gagne toujours, dans la lecture ET dans l’UPDATE', async () => {
    const { step, ia, updates, patchOf } = setup({
      raw: {
        ...RAW,
        structural_reading_axes: [{ label: 'Axe corrigé' }],
        human_corrected_blocks: ['structural_reading_axes'],
      },
    })
    await step.produceDossierBlocks(ACCOUNT, WORKSPACE)
    expect(patchOf()).not.toHaveProperty('structural_reading_axes')
    expect(ia.dossierBlocks).toHaveBeenCalledTimes(1)
    // Le garde est AUSSI dans l'UPDATE : une correction posée entre lecture et écriture reste.
    expect(String(updates()[0]?.[0])).toContain('human_corrected_blocks')
  })

  it('un bloc rafraîchi vide ne détruit pas l’ancien (on n’efface pas, on ne remplace que par du réel)', async () => {
    const { step, patchOf } = setup({
      raw: { ...RAW, ecosystem_third_parties: [{ label: 'Ancien tiers' }] },
    })
    await step.produceDossierBlocks(ACCOUNT, WORKSPACE)
    expect(patchOf()).not.toHaveProperty('ecosystem_third_parties')
  })

  it('dit NON sans matière : aucun appel, aucune écriture', async () => {
    const { step, ia, updates } = setup({ raw: {} })
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('nothing')
    expect(ia.dossierBlocks).not.toHaveBeenCalled()
    expect(updates()).toHaveLength(0)
  })

  it('un échec du modèle ne coûte pas les blocs calculés', async () => {
    const { step, patchOf } = setup({ iaError: new Error('boom') })
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(Object.keys(patchOf())).toEqual(['financial_indicators'])
  })

  it('ne rappelle pas le modèle quand les trois blocs IA sont corrigés à la main', async () => {
    const { step, ia } = setup({
      raw: {
        ...RAW,
        human_corrected_blocks: ['structural_reading_axes', 'ecosystem_third_parties', 'opportunity_domains'],
      },
    })
    await step.produceDossierBlocks(ACCOUNT, WORKSPACE)
    expect(ia.dossierBlocks).not.toHaveBeenCalled()
  })
})

describe('DossierBlocksStep — date de collecte du segment (#4078, rattrapage)', () => {
  it('date le segment quand les cinq blocs ont été produits', async () => {
    const { step, stamps } = setup()
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(stamps()).toHaveLength(1)
    expect(stamps()[0]?.[1]).toEqual([NOW, ACCOUNT, WORKSPACE])
  })

  it('date aussi un dossier SANS matière : « rien à dire » est un fait collecté, pas un oubli', async () => {
    const { step, stamps } = setup({ raw: {} })
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('nothing')
    expect(stamps()).toHaveLength(1)
  })

  it('date un dossier dont les cinq clés sont corrigées à la main : rien à rejouer', async () => {
    const raw = {
      human_corrected_blocks: [
        'structural_reading_axes',
        'ecosystem_third_parties',
        'opportunity_domains',
        'financial_indicators',
        'data_reliability_notes',
      ],
    }
    const { step, stamps } = setup({ raw })
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('exists')
    expect(stamps()).toHaveLength(1)
  })

  it('sait dire NON : un échec du modèle ne date PAS le segment — le compte reste à rattraper', async () => {
    const { step, stamps, updates } = setup({ iaError: new Error('boom') })
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('written')
    expect(updates()).toHaveLength(1)
    expect(stamps()).toHaveLength(0)
  })

  it('sait dire NON : un compte introuvable ne date rien', async () => {
    const query = jest.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[])
    const step = new DossierBlocksStep({ dossierBlocks: jest.fn() } as never, { query } as never, () => NOW)
    await expect(step.produceDossierBlocks(ACCOUNT, WORKSPACE)).resolves.toBe('skipped')
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('dossier_blocks_collected_at'))).toHaveLength(0)
  })
})

describe('runDossierBlocksCatchUp', () => {
  const candidates = [
    { id: 'a1', workspace_id: 'w1' },
    { id: 'a2', workspace_id: 'w2' },
  ]

  it('SIMULATION par défaut : compte ce qui partirait, n’écrit rien', async () => {
    const query = jest.fn().mockResolvedValue(candidates)
    const step = { produceDossierBlocks: jest.fn() }
    const report = await runDossierBlocksCatchUp({ dataSource: { query } as never, step: step as never, apply: false })
    expect(report).toMatchObject({ apply: false, candidates: 2 })
    expect(step.produceDossierBlocks).not.toHaveBeenCalled()
    // Ciblé sur la DATE de collecte du segment contre la date de la capacité (doctrine du
    // rattrapage), jamais sur un symptôme (« une clé manque ») ; les espaces de démo exclus.
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain('a.dossier_blocks_collected_at IS NULL OR a.dossier_blocks_collected_at < $1')
    expect(sql).not.toContain('structural_reading_axes')
    expect(sql).toContain('w.is_demo = true')
    expect(params[0]).toBe(SEGMENT_CAPABILITY_EPOCH.dossier_blocks)
  })

  it('--appliquer : rejoue l’étape SEULE, compte par issue', async () => {
    const query = jest.fn().mockResolvedValue(candidates)
    const step = { produceDossierBlocks: jest.fn().mockResolvedValueOnce('written').mockResolvedValueOnce('nothing') }
    const report = await runDossierBlocksCatchUp({ dataSource: { query } as never, step: step as never, apply: true })
    expect(step.produceDossierBlocks).toHaveBeenCalledWith('a1', 'w1')
    expect(report.outcomes).toEqual({ written: 1, nothing: 1 })
  })
})
