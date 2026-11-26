import { trackConversationAnalysisLaunch } from './analysis-launch-tracking'

/**
 * #1943.5 — une analyse lancée depuis la conversation est SUIVIE dans Action OS,
 * et sa facturation ne change pas (arbitrage de Louis du 12/09).
 *
 * `AnalysisService.start` débite au lancement (8 crédits) et rembourse sur échec
 * terminal ; rien de cela ne bouge. Le pont ajoute seulement le SUIVI, avec le
 * débit OBSERVÉ côté facturation (I4) — jamais l'estimation, jamais 0 quand on
 * ne l'a pas vu — et aucune réservation (I3).
 */

const USER = '9d359267-0000-4000-8000-000000000001'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const STARTED_AT = new Date('2026-09-13T09:00:00.000Z')

function deps(
  options: {
    demo?: boolean
    ledger?: { kind: string; account_id: string | null; delta: number; created_at: Date }[]
  } = {},
) {
  const cards = { trackAnalysisLaunch: jest.fn().mockResolvedValue({ id: 'run-analysis' }) }
  const ledger = { getLedger: jest.fn().mockResolvedValue({ entries: options.ledger ?? [] }) }
  const isDemo = jest.fn().mockResolvedValue(Boolean(options.demo))
  return { cards, ledger, isDemo }
}

const launch = (over: Partial<Parameters<typeof trackConversationAnalysisLaunch>[1]> = {}) => ({
  userId: USER,
  accountId: ACCOUNT,
  jobId: 'analysis-job-1',
  launched: true,
  reason: null,
  startedAt: STARTED_AT,
  ...over,
})

describe('trackConversationAnalysisLaunch — suivi seul, facturation inchangée', () => {
  it('suit le lancement avec le débit OBSERVÉ dans le registre (I4), sans rien réserver', async () => {
    const d = deps({
      ledger: [
        // Plus récent d'abord, comme `getLedger` : le débit de CE lancement…
        { kind: 'consume_analysis', account_id: ACCOUNT, delta: -8, created_at: new Date('2026-09-13T09:00:01.000Z') },
        // …et, plus ancien, un débit d'un run précédent du même compte, qui n'est pas le sien.
        { kind: 'consume_analysis', account_id: ACCOUNT, delta: -8, created_at: new Date('2026-09-01T09:00:00.000Z') },
      ],
    })

    await trackConversationAnalysisLaunch(d, launch())

    expect(d.cards.trackAnalysisLaunch).toHaveBeenCalledWith({
      principal: { userId: USER, email: '' },
      accountId: ACCOUNT,
      jobId: 'analysis-job-1',
      debitObserved: 8,
      launchKey: `analysis:analysis-job-1:${STARTED_AT.getTime()}`,
    })
  })

  it('un débit que le registre ne montre pas est NON MESURÉ (`null`), jamais 0', async () => {
    const d = deps({
      ledger: [
        {
          kind: 'consume_analysis',
          account_id: 'autre-compte',
          delta: -8,
          created_at: new Date('2026-09-13T09:00:01.000Z'),
        },
        { kind: 'consume_analysis', account_id: ACCOUNT, delta: -8, created_at: new Date('2026-09-12T09:00:00.000Z') },
      ],
    })
    await trackConversationAnalysisLaunch(d, launch())
    expect(d.cards.trackAnalysisLaunch.mock.calls[0]?.[0]).toMatchObject({ debitObserved: null })
  })

  it.each([
    ['un run DÉJÀ en vol (rien de neuf n’a été débité)', { reason: 'in_flight' }],
    ['un lancement qui n’a pas eu lieu (dossier réutilisé)', { launched: false }],
  ])('%s n’ouvre aucun suivi', async (_label, over) => {
    const d = deps()
    await trackConversationAnalysisLaunch(d, launch(over as never))
    expect(d.cards.trackAnalysisLaunch).not.toHaveBeenCalled()
  })

  it('I6 — en démonstration, aucun suivi (rien n’y est débité)', async () => {
    const d = deps({ demo: true })
    await trackConversationAnalysisLaunch(d, launch())
    expect(d.cards.trackAnalysisLaunch).not.toHaveBeenCalled()
    expect(d.ledger.getLedger).not.toHaveBeenCalled()
  })

  it('sans le module de cartes, rien ne se passe — et une panne du suivi ne fait JAMAIS échouer le lancement', async () => {
    await expect(trackConversationAnalysisLaunch({ ...deps(), cards: undefined }, launch())).resolves.toBeUndefined()
    const d = deps()
    d.cards.trackAnalysisLaunch.mockRejectedValue(new Error('base indisponible'))
    await expect(trackConversationAnalysisLaunch(d, launch())).resolves.toBeUndefined()
  })
})
