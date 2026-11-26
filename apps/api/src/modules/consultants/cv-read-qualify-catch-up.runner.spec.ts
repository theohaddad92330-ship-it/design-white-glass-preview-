// Décision Louis 12/10 revient sur c88, délibérément : un CV lu = fiche qualifiée.
import {
  formatReadQualifyReport,
  isReadAwaitingQualification,
  runReadQualifyCatchUp,
  type ReadQualifyCandidateRow,
  type ReadQualifyPort,
} from './cv-read-qualify-catch-up.runner'

const row = (id: string, over: Partial<ReadQualifyCandidateRow> = {}): ReadQualifyCandidateRow => ({
  id,
  workspace_id: 'w-a',
  cv_auto_read_at: '2026-10-05T10:00:00Z',
  review_status: 'needs_review',
  archived_at: null,
  is_demo: false,
  ...over,
})

const ROWS = [
  row('read-1'),
  row('read-2', { workspace_id: 'w-b' }),
  row('unread', { cv_auto_read_at: null }),
  row('archived', { archived_at: '2026-09-01T00:00:00Z' }),
  row('already', { review_status: 'qualified' }),
  row('demo', { is_demo: true }),
]

function port() {
  const qualify = jest.fn(async (ids: string[]) => ids.length)
  const service: ReadQualifyPort = { needsReviewCandidates: jest.fn(async () => ROWS), qualify }
  return { service, qualify }
}

describe('rattrapage « CV lu = qualifiée » (c97)', () => {
  it('sait dire NON : non lue, archivée, déjà qualifiée ou démo ne partent jamais', () => {
    expect(ROWS.filter(isReadAwaitingQualification).map(r => r.id)).toEqual(['read-1', 'read-2'])
  })

  it('applique : qualifie uniquement les lues, compte par espace, zéro crédit', async () => {
    const { service, qualify } = port()
    const report = await runReadQualifyCatchUp({ service, apply: true })
    expect(qualify).toHaveBeenCalledWith(['read-1', 'read-2'])
    expect(report).toMatchObject({ mode: 'applique', targeted: 2, qualified: 2, perWorkspace: { 'w-a': 1, 'w-b': 1 } })
    expect(formatReadQualifyReport(report)).toContain('2 fiche(s) qualifiée(s)')
  })

  it('simulation : compte, n’écrit rien', async () => {
    const { service, qualify } = port()
    const report = await runReadQualifyCatchUp({ service, apply: false })
    expect(qualify).not.toHaveBeenCalled()
    expect(report).toMatchObject({ mode: 'simulation', targeted: 2, qualified: 0 })
  })

  it('idempotent : rien à qualifier, aucun appel d’écriture', async () => {
    const qualify = jest.fn(async (ids: string[]) => ids.length)
    const service: ReadQualifyPort = {
      needsReviewCandidates: async () => [row('x', { review_status: 'qualified' })],
      qualify,
    }
    const report = await runReadQualifyCatchUp({ service, apply: true })
    expect(qualify).not.toHaveBeenCalled()
    expect(report.qualified).toBe(0)
  })
})
