import { isFailure, isSuccess } from '@bellum/utils'
import { AccountsService } from './accounts.service'
import { createMockRepository } from '../../database/test-utils'

/**
 * #3671.a (lot M07, 09/10) — PRIVÉ RESTE PRIVÉ : deux ESN, la même société.
 *
 * Reste nommé par les lots F04/S09/I05 : « pas de test de non-fuite entre deux
 * ESN sur le dossier ». Deux espaces concurrents analysent la MÊME société (même
 * SIREN) — deux dossiers, deux identifiants. Ce que l'un capitalise (une
 * correction « faux » sur un signal, le contenu de son dossier) ne doit JAMAIS
 * apparaître chez l'autre.
 *
 * Les faux dépôts ci-dessous APPLIQUENT les filtres qu'on leur passe — ils ne
 * se contentent pas de les enregistrer. Une lecture qui perdrait sa borne
 * d'espace (ou de dossier) recevrait donc les lignes de l'autre ESN, et le test
 * échouerait sur l'EFFET (le signal retiré, le dossier servi), pas sur la forme
 * de l'appel.
 */

const SIREN = '552012031'
const ESN_A = { workspaceId: 'ws-esn-a', accountId: 'acc-esn-a' }
const ESN_B = { workspaceId: 'ws-esn-b', accountId: 'acc-esn-b' }

type FeedbackRow = {
  account_id: string
  workspace_id: string
  target: string
  target_ref: string
  verdict: string
  created_at: Date
}

/** A repository that honours every equality in `where` — the way Postgres would. */
function filteringFeedbackRepo(rows: FeedbackRow[]) {
  return {
    find: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.filter(row => Object.entries(where).every(([key, value]) => row[key as keyof FeedbackRow] === value)),
    ),
  }
}

/** ESN A capitalised a correction: « Levée de fonds » is FALSE for its dossier. */
const correctionOfEsnA: FeedbackRow = {
  account_id: ESN_A.accountId,
  workspace_id: ESN_A.workspaceId,
  target: 'signal',
  target_ref: 'Levée de fonds',
  verdict: 'faux',
  created_at: new Date('2026-10-01T10:00:00Z'),
}

const research = {
  sector: 'Banque',
  employees: '100k',
  revenue: '25 Md€',
  headquarters: 'Paris',
  website: 'https://example.test',
  subsidiaries: [],
  itChallenges: [],
  recentSignals: [{ signal: 'Levée de fonds' }, { signal: 'Nouveau DSI' }],
  priorityScore: 8,
  priorityJustification: 'Top target',
  angles: [],
}

function serviceWith(feedbackRows: FeedbackRow[]) {
  const repo = createMockRepository()
  const accountFeedback = filteringFeedbackRepo(feedbackRows)
  const service = new AccountsService(
    repo as never,
    { groupAffiliation: jest.fn().mockResolvedValue(null) } as never,
    { resolveActiveWorkspace: jest.fn() } as never,
    { resolveProfileData: jest.fn().mockResolvedValue({}) } as never,
    ...(Array(8).fill(undefined) as []),
    accountFeedback as never,
  )
  const writtenSignals = () => (repo.update.mock.calls[0] as [unknown, Record<string, unknown>])[1]['recent_signals']
  return { service, repo, writtenSignals }
}

describe('#3671.a — une correction capitalisée par une ESN ne touche jamais le dossier d’une autre', () => {
  it('ESN B actualise SON dossier de la même société : le signal corrigé par A lui reste', async () => {
    const { service, writtenSignals } = serviceWith([correctionOfEsnA])
    await service.applyResearch(ESN_B.accountId, { ...research, siren: SIREN } as never, undefined, {
      workspaceId: ESN_B.workspaceId,
    })
    expect(writtenSignals()).toEqual([{ signal: 'Levée de fonds' }, { signal: 'Nouveau DSI' }])
  })

  it('même avec l’identifiant du dossier de A, un appel au nom de B ne lit pas la correction de A', async () => {
    const { service, writtenSignals } = serviceWith([correctionOfEsnA])
    await service.applyResearch(ESN_A.accountId, research as never, undefined, { workspaceId: ESN_B.workspaceId })
    expect(writtenSignals()).toEqual([{ signal: 'Levée de fonds' }, { signal: 'Nouveau DSI' }])
  })

  it('sait dire NON : chez A, sa propre correction s’applique bien', async () => {
    const { service, writtenSignals } = serviceWith([correctionOfEsnA])
    await service.applyResearch(ESN_A.accountId, research as never, undefined, { workspaceId: ESN_A.workspaceId })
    expect(writtenSignals()).toEqual([{ signal: 'Nouveau DSI' }])
  })
})

describe('#3671.a — le dossier d’une ESN ne se sert jamais à l’autre, même par son identifiant', () => {
  type StoredAccount = { id: string; workspace_id: string; siren: string; status: string; raw_analysis: unknown }
  const stored: StoredAccount[] = [
    {
      id: ESN_A.accountId,
      workspace_id: ESN_A.workspaceId,
      siren: SIREN,
      status: 'completed',
      raw_analysis: { user_attack_angles: [{ title: 'Angle capitalisé par A' }] },
    },
    {
      id: ESN_B.accountId,
      workspace_id: ESN_B.workspaceId,
      siren: SIREN,
      status: 'completed',
      raw_analysis: {},
    },
  ]

  /**
   * Evaluates the dossier read the way Postgres would — but ONLY the bounds the
   * SQL actually carries: drop `a.workspace_id = $2` from the query and the
   * other ESN's row comes back.
   */
  function serviceReading() {
    const repo = createMockRepository()
    repo.manager.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      const text = String(sql)
      return stored.filter(
        row =>
          (!/a\.id = \$1\b/.test(text) || row.id === params[0]) &&
          (!/a\.workspace_id = \$2\b/.test(text) || row.workspace_id === params[1]) &&
          row.status !== 'deleted',
      )
    })
    const service = new AccountsService(repo as never, {} as never, {} as never, {} as never)
    return service
  }

  it('B demande le dossier de A par son identifiant : introuvable, rien de A ne sort', async () => {
    const result = await serviceReading().findOneForWorkspace(ESN_A.accountId, ESN_B.workspaceId)
    expect(isFailure(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('Angle capitalisé par A')
  })

  it('B lit son propre dossier de la même société : aucune trace de ce que A a capitalisé', async () => {
    const result = await serviceReading().findOneForWorkspace(ESN_B.accountId, ESN_B.workspaceId)
    expect(isSuccess(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('Angle capitalisé par A')
  })

  it('sait dire NON : A lit son dossier et y retrouve ce qu’il a capitalisé', async () => {
    const result = await serviceReading().findOneForWorkspace(ESN_A.accountId, ESN_A.workspaceId)
    expect(isSuccess(result)).toBe(true)
    expect(JSON.stringify(result)).toContain('Angle capitalisé par A')
  })
})
