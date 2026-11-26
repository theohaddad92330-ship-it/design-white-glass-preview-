import { NotFoundException } from '@nestjs/common'
import { PipelineDetectionsService } from './pipeline-detections.service'

/**
 * #4016 L6 — le pipe « détecté, à revoir ». Ces tests verrouillent trois
 * promesses : le balayage n'écrit QUE des lignes `detected` (jamais
 * `confirmed`), une source ne fait naître qu'une ligne, et une décision porte
 * toujours son auteur humain.
 */

type QueryStub = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>

function build(rows: Record<string, unknown[]> = {}) {
  const query: QueryStub = jest.fn().mockImplementation(async (sql: string) => {
    for (const [needle, result] of Object.entries(rows)) if (sql.includes(needle)) return result
    return []
  })
  const dataSource = { query } as never
  return { service: new PipelineDetectionsService(dataSource), query }
}

const ROW = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'interest_to_opportunity',
  status: 'detected',
  account_id: '22222222-2222-4222-8222-222222222222',
  account_name: 'Banque Exemple',
  label: 'Intérêt exprimé à l’appel',
  source_id: '33333333-3333-4333-8333-333333333333',
  source_call_id: null,
  project_id: null,
  need_id: null,
  consultant_id: null,
  submission_id: null,
  created_object_id: null,
  detected_at: new Date('2026-10-11T05:50:00Z'),
  decided_at: null,
}

describe('PipelineDetectionsService (#4016 L6)', () => {
  it('balaie les TROIS passages, et n’écrit que des lignes « détecté »', async () => {
    const { service, query } = build({ 'RETURNING id': [{ id: 'x' }] })
    const written = await service.sweepWorkspace('ws-1')
    expect(written).toEqual({ interest_to_opportunity: 1, shortlist_to_submission: 1, interview_to_mission: 1 })
    const inserts = query.mock.calls.map(([sql]) => sql).filter(sql => sql.includes('INSERT INTO pipeline_detections'))
    expect(inserts).toHaveLength(3)
    for (const sql of inserts) {
      // Le statut n'est jamais écrit par le balayage : il prend le défaut `detected`.
      expect(sql).not.toMatch(/'confirmed'/)
      expect(sql).toContain('ON CONFLICT (workspace_id, kind, source_key) DO NOTHING')
      // Toujours cloisonné à l'espace balayé.
      expect(sql).toContain('workspace_id = $1')
    }
  })

  it('l’intérêt se lit sur les issues d’appel du contrat, et un compte qui a déjà une affaire neuve n’en reçoit pas', async () => {
    const { service, query } = build()
    await service.sweepWorkspace('ws-1')
    const [sql, params] = query.mock.calls.find(([s]) => s.includes("'interest_to_opportunity'"))!
    expect(params).toEqual(['ws-1', ['interest', 'need_detected', 'need_confirmed']])
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('FROM opportunities')
  })

  it('le positionnement ne se détecte que sur une shortlist PARTAGÉE, pour un profil pas encore positionné', async () => {
    const { service, query } = build()
    await service.sweepWorkspace('ws-1')
    const [sql] = query.mock.calls.find(([s]) => s.includes("'shortlist_to_submission'"))!
    expect(sql).toContain("sl.status = 'shared'")
    expect(sql).toContain('FROM submissions')
  })

  it('la mission ne se détecte que sur un entretien POSITIF sans mission rattachée', async () => {
    const { service, query } = build()
    await service.sweepWorkspace('ws-1')
    const [sql] = query.mock.calls.find(([s]) => s.includes("'interview_to_mission'"))!
    expect(sql).toContain("i.outcome = 'positive'")
    expect(sql).toContain('FROM missions')
  })

  it('un passage en échec n’emporte pas les deux autres', async () => {
    const { service, query } = build({ 'RETURNING id': [{ id: 'x' }] })
    query.mockImplementationOnce(async () => {
      throw new Error('boom')
    })
    const written = await service.sweepWorkspace('ws-1')
    expect(written.interest_to_opportunity).toBeNull()
    expect(written.shortlist_to_submission).toBe(1)
  })

  it('liste les lignes à revoir de l’espace, au format du contrat', async () => {
    const { service, query } = build({ 'FROM pipeline_detections d': [ROW] })
    const items = await service.listDetected('ws-1')
    expect(items[0]).toMatchObject({ id: ROW.id, status: 'detected', accountName: 'Banque Exemple' })
    expect(items[0]?.detectedAt).toBe('2026-10-11T05:50:00.000Z')
    expect(query.mock.calls[0]?.[1]).toEqual(['ws-1'])
  })

  it('#4016.L6.a — l’appel source n’est rendu que s’il existe : sinon null, jamais l’identifiant de la détection', async () => {
    const CALL = '44444444-4444-4444-8444-444444444444'
    const withCall = build({ 'FROM pipeline_detections d': [{ ...ROW, source_call_id: CALL }] })
    expect((await withCall.service.listDetected('ws-1'))[0]?.sourceCallId).toBe(CALL)
    const without = build({ 'FROM pipeline_detections d': [ROW] })
    expect((await without.service.listDetected('ws-1'))[0]?.sourceCallId).toBeNull()
    // La jointure ne lit que le passage « intérêt », un vrai appel, du même espace.
    const sql = withCall.query.mock.calls[0]?.[0] as string
    expect(sql).toContain("d.kind = 'interest_to_opportunity'")
    expect(sql).toContain("call_act.kind = 'call'")
    expect(sql).toContain('call_act.workspace_id = d.workspace_id')
  })

  it('une décision porte son auteur, et ne touche qu’une ligne encore « détecté » de l’espace', async () => {
    const { service, query } = build({ 'UPDATE pipeline_detections': [ROW] })
    await service.decide('ws-1', ROW.id, 'user-1', { status: 'dismissed' })
    const [sql, params] = query.mock.calls[0]!
    expect(sql).toContain("status = 'detected'")
    expect(sql).toContain('decided_by = $3')
    expect(params).toEqual(['ws-1', ROW.id, 'user-1', 'dismissed', null])
  })

  it('lit la forme RÉELLE d’un UPDATE … RETURNING (`[lignes, nombre]`) — jamais le tableau pris pour une ligne', async () => {
    const { service } = build({
      'UPDATE pipeline_detections': [[{ ...ROW, status: 'dismissed', decided_at: new Date() }], 1],
    })
    const decided = await service.decide('ws-1', ROW.id, 'user-1', { status: 'dismissed' })
    expect(decided.id).toBe(ROW.id)
    expect(decided.status).toBe('dismissed')
  })

  it('une ligne déjà décidée ou d’un autre espace rend 404 — jamais 403', async () => {
    const { service } = build()
    await expect(service.decide('ws-1', ROW.id, 'user-1', { status: 'confirmed' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
