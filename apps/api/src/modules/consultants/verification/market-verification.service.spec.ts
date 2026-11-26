import { creditCostOf } from '@bellum/contracts'
import { MarketVerificationService } from './market-verification.service'
import type { MarketVerificationReceiptEntity } from '../../../database/entities/market-verification-receipt.entity'

type Row = MarketVerificationReceiptEntity

const WORKSPACE = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const TALENT = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-09-18T10:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'r1',
    workspace_id: WORKSPACE,
    user_id: USER,
    consultant_id: TALENT,
    company_name: 'Cegedim',
    company_key: 'cegedim',
    verified_at: new Date(NOW.getTime() - 2 * DAY),
    outcome: 'verified',
    credits_announced: 8,
    corrected_by_user_id: null,
    corrected_at: null,
    archived_at: null,
    created_at: new Date(NOW.getTime() - 2 * DAY),
    ...overrides,
  } as Row
}

function repoWith(rows: Row[]) {
  const saved: Row[] = []
  return {
    saved,
    repo: {
      find: jest.fn(async () => rows),
      create: jest.fn((input: Partial<Row>) => ({ id: 'new', ...input }) as Row),
      save: jest.fn(async (input: Row | Row[]) => {
        for (const entry of Array.isArray(input) ? input : [input]) saved.push(entry)
        return input
      }),
    },
  }
}

type AccountRow = { company_name: string; siren: string | null }

function accountsRepoWith(rows: AccountRow[]) {
  return { find: jest.fn(async () => rows) }
}

function serviceWith(rows: Row[], accountRows: AccountRow[] = []) {
  const { repo, saved } = repoWith(rows)
  const accountsRepo = accountsRepoWith(accountRows)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { service: new MarketVerificationService(repo as any, accountsRepo as any), repo, saved, accountsRepo }
}

describe('#2288.4 — le plan annonce AVANT, et ne facture pas ce qui est conservé', () => {
  it('annonce les cinq informations, coût dérivé de la grille', async () => {
    const { service } = serviceWith([])
    const plan = await service.plan({
      workspaceId: WORKSPACE,
      companies: ['Cegedim', 'Sopra Steria'],
      now: NOW,
    })
    expect(plan.candidates).toBe(2)
    expect(plan.credits).toEqual({ measured: true, credits: 2 * creditCostOf('account_analysis') })
    expect(plan.durationMinutes.min).toBeGreaterThan(0)
    expect(plan.sources.length).toBeGreaterThan(0)
    expect(plan.adds.length).toBeGreaterThan(0)
  })

  it('sort du coût ce qui est déjà conservé dans CET espace', async () => {
    const { service } = serviceWith([row()])
    const plan = await service.plan({
      workspaceId: WORKSPACE,
      companies: ['Cegedim', 'Sopra Steria'],
      now: NOW,
    })
    expect(plan.candidates).toBe(1)
    expect(plan.kept).toBe(1)
  })

  it('GA-43 — ne lit JAMAIS les reçus d’un autre espace : le filtre porte l’espace', async () => {
    const { service, repo } = serviceWith([])
    await service.plan({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: WORKSPACE }) }),
    )
  })

  it('sans aucune entreprise présélectionnée, ne lit rien du tout', async () => {
    const { service, repo } = serviceWith([])
    const plan = await service.plan({ workspaceId: WORKSPACE, companies: [], now: NOW })
    expect(repo.find).not.toHaveBeenCalled()
    expect(plan.candidates).toBe(0)
  })
})

describe('#2288.2 — la conservation : on archive, on ne supprime pas', () => {
  it('re-vérifier ARCHIVE l’ancien reçu et en écrit un neuf', async () => {
    const { service, saved } = serviceWith([row({ verified_at: new Date(NOW.getTime() - 90 * DAY) })])
    await service.record({
      workspaceId: WORKSPACE,
      userId: USER,
      consultantId: TALENT,
      companyName: 'Cegedim',
      outcome: 'verified',
      now: NOW,
    })
    const archived = saved.filter(entry => entry.archived_at !== null)
    expect(archived).toHaveLength(1)
    expect(saved.some(entry => entry.archived_at === null && entry.company_key === 'cegedim')).toBe(true)
  })

  it('le coût inscrit vient de la GRILLE, jamais de l’appelant', async () => {
    const { service, saved } = serviceWith([])
    await service.record({
      workspaceId: WORKSPACE,
      userId: USER,
      consultantId: TALENT,
      companyName: 'Cegedim',
      outcome: 'verified',
      now: NOW,
    })
    const written = saved.find(entry => entry.archived_at === null)
    expect(written?.credits_announced).toBe(creditCostOf('account_analysis'))
  })

  it('un résultat NON MESURÉ s’inscrit tel quel, sans coût annoncé', async () => {
    const { service, saved } = serviceWith([])
    await service.record({
      workspaceId: WORKSPACE,
      userId: USER,
      consultantId: TALENT,
      companyName: 'Cegedim',
      outcome: 'unknown',
      now: NOW,
    })
    const written = saved.find(entry => entry.archived_at === null)
    expect(written?.outcome).toBe('unknown')
    expect(written?.credits_announced).toBeNull()
  })

  it('le libellé est rapproché sans casse ni espaces de bord, mais gardé tel qu’envoyé', async () => {
    const { service, saved } = serviceWith([])
    await service.record({
      workspaceId: WORKSPACE,
      userId: USER,
      consultantId: TALENT,
      companyName: '  Sopra Steria ',
      outcome: 'verified',
      now: NOW,
    })
    const written = saved.find(entry => entry.archived_at === null)
    expect(written?.company_key).toBe('sopra steria')
    expect(written?.company_name).toBe('Sopra Steria')
  })
})

describe('#2288.2 — une correction humaine gagne toujours', () => {
  it('n’archive ni ne remplace un reçu corrigé à la main, même très ancien', async () => {
    const corrected = row({
      corrected_by_user_id: USER,
      corrected_at: new Date(NOW.getTime() - 365 * DAY),
      verified_at: new Date(NOW.getTime() - 400 * DAY),
    })
    const { service, saved } = serviceWith([corrected])
    expect(corrected.corrected_by_user_id).toBe(USER)
    const result = await service.record({
      workspaceId: WORKSPACE,
      userId: USER,
      consultantId: TALENT,
      companyName: 'Cegedim',
      outcome: 'verified',
      now: NOW,
    })
    expect(saved).toHaveLength(0)
    expect(result.keptHumanCorrection).toBe(true)
  })
})

describe('#2288.2 (décision Louis 18/09) — les états, lisibles par tout membre, sans montant', () => {
  it('rend état ET date, et aucun champ de coût', async () => {
    const { service } = serviceWith([row()])
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim', 'Atos'], now: NOW })
    expect(states).toEqual([
      { companyName: 'Cegedim', state: 'kept', verifiedAt: row().verified_at.toISOString(), siren: null },
      { companyName: 'Atos', state: 'to_verify', verifiedAt: null, siren: null },
    ])
    expect(JSON.stringify(states)).not.toMatch(/credit/i)
  })

  it('GA-43 — lit sous l’espace de l’appelant, et ne lit rien pour une liste vide', async () => {
    const { service, repo } = serviceWith([])
    expect(await service.states({ workspaceId: WORKSPACE, companies: [], now: NOW })).toEqual([])
    expect(repo.find).not.toHaveBeenCalled()
    await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: WORKSPACE }) }),
    )
  })
})

describe('#2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION', () => {
  it('reporte le SIREN d’un compte DÉJÀ COMPLETED au nom exact, dans le plan ET dans les états', async () => {
    const { service } = serviceWith([], [{ company_name: 'Cegedim', siren: '552081317' }])
    const plan = await service.plan({ workspaceId: WORKSPACE, companies: ['Cegedim', 'Sopra Steria'], now: NOW })
    expect(plan.states).toEqual([
      { companyName: 'Cegedim', state: 'to_verify', siren: '552081317' },
      { companyName: 'Sopra Steria', state: 'to_verify', siren: null },
    ])
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim', 'Sopra Steria'], now: NOW })
    expect(states.map(s => s.siren)).toEqual(['552081317', null])
  })

  it('rapproche sans tenir compte de la casse ni des espaces de bord — jamais deviné, un match EXACT normalisé', async () => {
    const { service } = serviceWith([], [{ company_name: '  CEGEDIM ', siren: '552081317' }])
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['cegedim'], now: NOW })
    expect(states[0]?.siren).toBe('552081317')
  })

  it('sans compte connu pour ce nom : `null`, comportement inchangé', async () => {
    const { service } = serviceWith([], [])
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(states[0]?.siren).toBeNull()
  })

  it('ignore un compte sans SIREN — jamais une chaîne vide devinée', async () => {
    const { service } = serviceWith([], [{ company_name: 'Cegedim', siren: null }])
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(states[0]?.siren).toBeNull()
  })

  it('GA-43 — la recherche de SIREN connu est SCOPÉE à l’espace de l’appelant, jamais un autre', async () => {
    const { service, accountsRepo } = serviceWith([], [{ company_name: 'Cegedim', siren: '552081317' }])
    await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(accountsRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspace_id: WORKSPACE, status: 'completed' }) }),
    )
  })

  it('une liste vide ne lit rien du tout — ni les reçus, ni les comptes', async () => {
    const { service, accountsRepo } = serviceWith([], [])
    await service.states({ workspaceId: WORKSPACE, companies: [], now: NOW })
    expect(accountsRepo.find).not.toHaveBeenCalled()
  })

  it('une erreur de lecture des comptes échoue OUVERT — `null` partout, jamais un plan cassé', async () => {
    const accountsRepo = { find: jest.fn(async () => Promise.reject(new Error('db down'))) }
    const { repo } = repoWith([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new MarketVerificationService(repo as any, accountsRepo as any)
    const states = await service.states({ workspaceId: WORKSPACE, companies: ['Cegedim'], now: NOW })
    expect(states[0]?.siren).toBeNull()
  })
})
