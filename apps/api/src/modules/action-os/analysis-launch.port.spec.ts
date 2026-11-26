import { failure, success } from '@bellum/utils'
import { analysisLaunchObserverFrom } from './analysis-launch.port'

/**
 * #1943.5 — l'issue d'une analyse suivie se LIT (statut + registre), elle ne se
 * suppose pas. I4 : le remboursement compté est celui du registre, postérieur au
 * lancement, pour CE compte.
 */

const USER = '9d359267-0000-4000-8000-000000000001'
const ACCOUNT = '22222222-2222-4222-8222-222222222222'
const LAUNCHED_AT = new Date('2026-09-13T09:00:00.000Z')
/** Le nombre de phases du pipeline, tel que le module d'analyse le déclare. */
const PHASES = 4

function observer(
  state: string | 'unreadable',
  entries: unknown[] = [],
  ledgerFails = false,
  completedPhases?: readonly string[],
) {
  const analysis = {
    getStatus: jest.fn(async () =>
      state === 'unreadable'
        ? failure({ code: 'not_found', message: 'x' })
        : success({ state, ...(completedPhases ? { completedPhases } : {}) }),
    ),
  }
  const ledger = {
    getLedger: jest.fn(async () => {
      if (ledgerFails) throw new Error('registre indisponible')
      return { entries }
    }),
  }
  return { observe: analysisLaunchObserverFrom(analysis as never, ledger as never, PHASES), analysis, ledger }
}

const input = { userId: USER, accountId: ACCOUNT, jobId: 'job-1', launchedAt: LAUNCHED_AT }

describe('analysisLaunchObserverFrom', () => {
  it('en vol : « running », le registre n’est même pas lu', async () => {
    const o = observer('active')
    expect(await o.observe.observe(input)).toEqual({ state: 'running', refunded: null, progress: null })
    expect(o.ledger.getLedger).not.toHaveBeenCalled()
  })

  it('terminée : « done », remboursement observé 0', async () => {
    const o = observer('completed', [])
    expect(await o.observe.observe(input)).toEqual({ state: 'done', refunded: 0, progress: null })
  })

  it('échouée : « failed », seuls les remboursements de CE compte APRÈS le lancement comptent', async () => {
    const o = observer('failed', [
      { kind: 'refund_analysis', account_id: ACCOUNT, delta: 8, created_at: new Date('2026-09-13T09:03:00.000Z') },
      { kind: 'refund_analysis', account_id: ACCOUNT, delta: 8, created_at: new Date('2026-09-01T09:03:00.000Z') },
      { kind: 'refund_analysis', account_id: 'autre', delta: 8, created_at: new Date('2026-09-13T09:04:00.000Z') },
      { kind: 'consume_analysis', account_id: ACCOUNT, delta: -8, created_at: new Date('2026-09-13T09:00:01.000Z') },
    ])
    expect(await o.observe.observe(input)).toEqual({ state: 'failed', refunded: 8, progress: null })
  })

  it('un statut illisible ou un job introuvable est « unknown » — jamais une issue terminale', async () => {
    expect((await observer('unreadable').observe.observe(input)).state).toBe('unknown')
    expect((await observer('not_found').observe.observe(input)).state).toBe('unknown')
  })

  it('un registre illisible laisse le remboursement NON MESURÉ, jamais 0', async () => {
    expect(await observer('failed', [], true).observe.observe(input)).toEqual({
      state: 'failed',
      refunded: null,
      progress: null,
    })
  })
})

/**
 * #1952.17 — UNE ANALYSE ANNULÉE N'EST PAS UNE ANALYSE ÉCHOUÉE.
 *
 * Le port ne connaissait que trois issues terminales, et repliait donc
 * `canceled` sur `failed` : la carte annonçait « L'analyse a échoué » et
 * proposait de RELANCER — donc de REDÉBITER — un travail que quelqu'un avait
 * volontairement arrêté. Une annulation n'est ni un échec ni un succès ; un état
 * terminal qui n'existe pas se replie sur le plus proche, et le plus proche ment.
 */
describe('#1952.17 — l’annulation, lue comme une annulation', () => {
  it('annulée : « cancelled », avec le remboursement que le registre montre', async () => {
    const o = observer('canceled', [
      { kind: 'refund_analysis', account_id: ACCOUNT, delta: 8, created_at: new Date('2026-09-13T09:02:00.000Z') },
    ])
    expect(await o.observe.observe(input)).toEqual({ state: 'cancelled', refunded: 8, progress: null })
  })

  it('annulée, registre illisible : le remboursement reste NON MESURÉ — l’état, lui, reste « cancelled »', async () => {
    expect(await observer('canceled', [], true).observe.observe(input)).toEqual({
      state: 'cancelled',
      refunded: null,
      progress: null,
    })
  })

  it('n’attrape pas ce qu’il ne vise pas : une analyse RÉELLEMENT échouée reste « failed », une terminée « done »', async () => {
    expect((await observer('failed', []).observe.observe(input)).state).toBe('failed')
    expect((await observer('completed', []).observe.observe(input)).state).toBe('done')
  })
})

/**
 * #1952.1 — L'AVANCEMENT D'UNE ANALYSE EN VOL EST CELUI DE SES POINTS DE
 * CONTRÔLE, ou rien. Une phase compte quand son écriture a été validée ; la
 * liste vide ne distingue PAS « aucune phase franchie » de « lecteur de points
 * de contrôle absent ou en échec », donc elle ne vaut jamais « 0 sur 4 ».
 */
describe('l’avancement d’une analyse en vol', () => {
  it('rend les étapes réellement franchies sur le total du pipeline', async () => {
    const o = observer('active', [], false, ['research', 'contacts'])
    expect(await o.observe.observe(input)).toEqual({
      state: 'running',
      refunded: null,
      progress: { done: 2, total: PHASES },
    })
  })

  it('aucune phase franchie : position NON ÉTABLIE, jamais « 0 sur 4 »', async () => {
    expect((await observer('active', [], false, []).observe.observe(input)).progress).toBeNull()
  })

  it('un statut qui ne porte pas de phases laisse l’avancement non mesuré', async () => {
    expect((await observer('active').observe.observe(input)).progress).toBeNull()
  })

  it('n’attrape pas ce qu’il ne vise pas : une analyse TERMINÉE ne publie pas d’avancement, elle publie son issue', async () => {
    const o = observer('completed', [], false, ['research', 'contacts', 'classify', 'plan'])
    expect((await o.observe.observe(input)).progress).toBeNull()
  })
})
