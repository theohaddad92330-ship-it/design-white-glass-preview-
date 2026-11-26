import {
  OPPORTUNITIES_ACTIVE_FROM_SQL,
  OPPORTUNITIES_IN_WORKSPACE_SQL,
  PIPELINE_DETECTION_TO_REVIEW_SQL,
  crmCountersResponseSchema,
  type FinanceScope,
} from '@bellum/contracts'
import { PipelineDetectionsService } from '../pipeline-detections/pipeline-detections.service'
import { CrmCountersService } from './crm-counters.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-14T09:00:00.000Z')
const WORKSPACE_SCOPE: FinanceScope = { kind: 'workspace', workspaceId: WORKSPACE }

type Fixture = {
  opportunities?: { stage: string; kind?: string; amount_cents?: number | null }[]
  needs?: { open: string }
  pistes?: string
  submissions?: string
  missions?: { status: string; ends_on: string | null }[]
  outside?: string
}

/** Un faux `manager.query` qui répond d'après la table lue — et garde les SQL émis. */
function build(fixture: Fixture) {
  const calls: { sql: string; params: unknown[] }[] = []
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params })
    if (sql.includes('FROM opportunities o') && sql.includes('o.stage')) return fixture.opportunities ?? []
    if (sql.includes('FROM project_needs')) return [fixture.needs ?? { open: '0' }]
    if (sql.includes('FROM pipeline_detections')) return [{ count: fixture.pistes ?? '0' }]
    if (sql.includes('FROM submissions')) return [{ count: fixture.submissions ?? '0' }]
    if (sql.includes('FROM missions m') && sql.includes('m.status')) return fixture.missions ?? []
    if (sql.includes('COUNT(*)')) return [{ count: fixture.outside ?? '0' }]
    throw new Error(`SQL inattendu : ${sql}`)
  })
  const service = new CrmCountersService({ manager: { query } } as never)
  return { service, calls }
}

describe('CrmCountersService', () => {
  it('opportunities_active = la somme des colonnes OUVERTES, le signé et les pistes exclus', async () => {
    const { service } = build({
      opportunities: [
        { stage: 'qualified' },
        { stage: 'qualified' },
        { stage: 'confirmed' },
        { stage: 'profiles_submitted' },
        { stage: 'negotiation' },
        { stage: 'won' },
        { stage: 'detected', kind: 'project' },
        { stage: 'detected', kind: 'signal' },
      ],
    })
    const { counters } = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(counters.opportunities_active).toEqual({ value: 5, measured: true, definition_key: 'opportunities_active' })
    expect(counters.leads_to_qualify.value).toBe(1)
    expect(counters.buying_signals.value).toBe(1)
  })

  it('#4191 G2 — sa requête lit les fragments SQL PARTAGÉS avec la tuile « Projets ouverts sans montant »', async () => {
    const { service, calls } = build({})
    await service.compute(WORKSPACE_SCOPE, NOW)
    const sql = calls.find(call => call.sql.includes('FROM opportunities o'))?.sql ?? ''
    expect(sql).toContain(OPPORTUNITIES_ACTIVE_FROM_SQL)
    expect(sql).toContain(OPPORTUNITIES_IN_WORKSPACE_SQL)
  })

  it('les besoins ouverts se comptent à part des pistes, détecté exclu', async () => {
    const { service, calls } = build({ needs: { open: '9' }, pistes: '4' })
    const { counters } = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(counters.pistes_to_review.value).toBe(4)
    expect(counters.needs_open.value).toBe(9)
    const sql = calls.find(call => call.sql.includes('FROM project_needs'))?.sql ?? ''
    expect(sql).toContain('archived_at IS NULL')
    // la liste ouverte vient de NEED_OPEN_STATUSES, où `detected` ne figure pas
    expect(sql).not.toMatch(/IN \([^)]*'detected'/)
  })

  // #4191 (recette 3, F1) — LA piste : une ligne « détecté, à revoir » de `pipeline_detections`.
  // Le compteur et la liste portent le MÊME prédicat ; sur un même jeu, ils comptent les mêmes lignes.
  it('pistes_to_review = le nombre de lignes de la liste Pistes sur le même jeu', async () => {
    const table = [
      { workspace_id: WORKSPACE, status: 'detected', detected_at: NOW, decided_at: null },
      { workspace_id: WORKSPACE, status: 'detected', detected_at: NOW, decided_at: null },
      { workspace_id: WORKSPACE, status: 'detected', detected_at: NOW, decided_at: null },
      { workspace_id: WORKSPACE, status: 'confirmed', detected_at: NOW, decided_at: null },
      { workspace_id: WORKSPACE, status: 'dismissed', detected_at: NOW, decided_at: null },
      { workspace_id: 'autre-espace', status: 'detected', detected_at: NOW, decided_at: null },
    ]
    // Un faux SQL qui n'obéit qu'au prédicat partagé : s'il n'est pas dans la requête, rien n'est filtré.
    const rowsFor = (sql: string, workspaceId: string) =>
      sql.includes(PIPELINE_DETECTION_TO_REVIEW_SQL)
        ? table.filter(row => row.workspace_id === workspaceId && row.status === 'detected')
        : table
    const query = jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('FROM pipeline_detections d') && sql.includes('COUNT(*)'))
        return [{ count: String(rowsFor(sql, params[0] as string).length) }]
      if (sql.includes('FROM pipeline_detections d')) return rowsFor(sql, params[0] as string)
      if (sql.includes('FROM opportunities o')) return []
      if (sql.includes('FROM project_needs')) return [{ open: '0' }]
      if (sql.includes('FROM submissions')) return [{ count: '0' }]
      if (sql.includes('FROM missions m')) return []
      return [{ count: '0' }]
    })
    const counters = (await new CrmCountersService({ manager: { query } } as never).compute(WORKSPACE_SCOPE, NOW))
      .counters
    const list = await new PipelineDetectionsService({ query } as never).listDetected(WORKSPACE)
    expect(list).toHaveLength(3)
    expect(counters.pistes_to_review.value).toBe(list.length)
  })

  it('compte les candidatures soumises + en entretien', async () => {
    const { service, calls } = build({ submissions: '6' })
    const { counters } = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(counters.submissions_in_progress.value).toBe(6)
    const sql = calls.find(call => call.sql.includes('FROM submissions'))?.sql ?? ''
    expect(sql).toContain("'submitted'")
    expect(sql).toContain("'interview'")
  })

  it('missions actives = statuts en cours ; fenêtres 30/60/90 cumulatives sur ends_on', async () => {
    const { service } = build({
      missions: [
        { status: 'active', ends_on: '2026-10-20' }, // J+6
        { status: 'paused', ends_on: '2026-11-20' }, // J+37
        { status: 'at_risk', ends_on: '2026-12-30' }, // J+77
        { status: 'active', ends_on: '2027-06-30' },
        { status: 'active', ends_on: null },
        { status: 'active', ends_on: '2026-10-01' }, // déjà passée : hors fenêtres
        { status: 'ended', ends_on: '2026-10-25' }, // terminée : pas active
      ],
    })
    const { counters } = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(counters.missions_active.value).toBe(6)
    expect(counters.missions_ending_30.value).toBe(1)
    expect(counters.missions_ending_60.value).toBe(2)
    expect(counters.missions_ending_90.value).toBe(3)
  })

  it('zéro réel reste mesuré à 0 ; la réponse respecte le contrat', async () => {
    const { service } = build({})
    const response = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(response.counters.missions_active).toEqual({ value: 0, measured: true, definition_key: 'missions_active' })
    expect(crmCountersResponseSchema.safeParse(response).success).toBe(true)
  })

  it('revenu sécurisé : non mesuré sans prévisionnel, jamais un zéro deviné', async () => {
    const { service } = build({})
    const response = await service.compute(WORKSPACE_SCOPE, NOW)
    expect(response.secured_revenue_month).toEqual({
      measured: false,
      amounts: null,
      definition_key: 'secured_revenue_month',
    })
  })

  it('revenu sécurisé : lit le scénario downside du prévisionnel passé', async () => {
    const { service } = build({})
    const forecast = {
      scenarios: [{ scenario: 'downside', amounts: [{ currency: 'EUR', amountCents: 500 }] }],
    } as never
    const response = await service.compute(WORKSPACE_SCOPE, NOW, forecast)
    expect(response.secured_revenue_month.measured).toBe(true)
    expect(response.secured_revenue_month.amounts).toEqual([{ currency: 'EUR', amountCents: 500 }])
  })

  it('portée « mon » : restreint les missions, nomme les orphelines', async () => {
    const { service, calls } = build({ outside: '3' })
    const response = await service.compute({ kind: 'own', workspaceId: WORKSPACE, userId: USER }, NOW)
    expect(response.scope).toEqual({ kind: 'own', outsideAnyPortfolio: 3 })
    const missionSql = calls.find(call => call.sql.includes('FROM missions m') && call.sql.includes('m.status'))
    expect(missionSql?.params).toContain(USER)
  })
})
