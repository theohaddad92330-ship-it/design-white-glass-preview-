import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'
import { launchVerifications } from './launchVerifications'

/**
 * #2288.2 (décision Louis, 18/09/2026) — CONFIRMER LANCE TOUT CE QUI A ÉTÉ
 * ANNONCÉ.
 *
 * Le devis a annoncé N entreprises et leur coût exact : le geste fait ce qui a
 * été annoncé. Un lancement par entreprise, un reçu par lancement ; un échec au
 * milieu n'arrête pas les autres, et il est NOMMÉ ; un temps dépassé est « non
 * mesuré » et n'est pas rejoué.
 */
function deps(fail: Record<string, unknown> = {}) {
  const start = vi.fn(async (companyName: string) => {
    if (companyName in fail) throw fail[companyName]
    return { accountId: `acc-${companyName}` }
  })
  const record = vi.fn(async (_companyName: string, _outcome: 'verified' | 'unknown') => ({
    keptHumanCorrection: false,
  }))
  return { start, record }
}

describe('launchVerifications', () => {
  it('3 cochées → 3 lancements, 3 reçus', async () => {
    const d = deps()
    const results = await launchVerifications(['Thales', 'Atos', 'Capgemini'], d)
    expect(d.start).toHaveBeenCalledTimes(3)
    expect(d.start.mock.calls.map(call => call[0])).toEqual(['Thales', 'Atos', 'Capgemini'])
    expect(d.record).toHaveBeenCalledTimes(3)
    expect(d.record).toHaveBeenCalledWith('Thales', 'verified')
    expect(results.map(result => result.outcome)).toEqual(['launched', 'launched', 'launched'])
  })

  it('un échec au MILIEU n’arrête pas les autres, et il n’inscrit AUCUN reçu', async () => {
    const d = deps({ Atos: new ApiError('Solde insuffisant', 402) })
    const results = await launchVerifications(['Thales', 'Atos', 'Capgemini'], d)
    expect(d.start).toHaveBeenCalledTimes(3)
    expect(results).toEqual([
      { companyName: 'Thales', outcome: 'launched' },
      { companyName: 'Atos', outcome: 'failed' },
      { companyName: 'Capgemini', outcome: 'launched' },
    ])
    // Un lancement qui n'est pas parti n'a rien vérifié : pas de reçu.
    expect(d.record.mock.calls.map(call => call[0])).toEqual(['Thales', 'Capgemini'])
  })

  it('un temps dépassé est « non mesuré » : un reçu `unknown`, et AUCUN nouvel essai', async () => {
    const d = deps({ Atos: new ApiError('Gateway Timeout', 504) })
    const results = await launchVerifications(['Atos'], d)
    expect(d.start).toHaveBeenCalledTimes(1)
    expect(results).toEqual([{ companyName: 'Atos', outcome: 'unknown' }])
    expect(d.record).toHaveBeenCalledWith('Atos', 'unknown')
  })

  it('une connexion coupée dit la même chose qu’un temps dépassé — on ne sait pas si c’est parti', async () => {
    const d = deps({ Atos: new TypeError('Failed to fetch') })
    const [result] = await launchVerifications(['Atos'], d)
    expect(result?.outcome).toBe('unknown')
  })

  it('un reçu qui ne s’inscrit pas ne transforme pas un lancement parti en échec', async () => {
    const d = deps()
    d.record.mockRejectedValueOnce(new Error('réseau'))
    const [result] = await launchVerifications(['Thales'], d)
    expect(result?.outcome).toBe('launched')
  })

  // #2288.4 (18/09, suite) — LE SIREN CONNU VOYAGE AVEC LA VÉRIFICATION.
  it('transmet le SIREN connu au lanceur, pour l’entreprise qui le porte', async () => {
    const d = deps()
    await launchVerifications(['Thales', 'Atos'], d, {
      knownSirens: new Map([['thales', '552081317']]),
    })
    expect(d.start).toHaveBeenNthCalledWith(1, 'Thales', '552081317')
    expect(d.start).toHaveBeenNthCalledWith(2, 'Atos', undefined)
  })

  it('sans SIREN connu : comportement inchangé — le lanceur ne reçoit rien de plus', async () => {
    const d = deps()
    await launchVerifications(['Thales'], d)
    expect(d.start).toHaveBeenCalledWith('Thales', undefined)
  })

  it('rapproche le SIREN connu sans tenir compte de la casse ni des espaces de bord', async () => {
    const d = deps()
    await launchVerifications(['  THALES '], d, { knownSirens: new Map([['thales', '552081317']]) })
    expect(d.start).toHaveBeenCalledWith('  THALES ', '552081317')
  })

  it('les lancements partent UN PAR UN — jamais une rafale sur le lanceur', async () => {
    let inFlight = 0
    let peak = 0
    const d = {
      start: vi.fn(async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        inFlight -= 1
        return {}
      }),
      record: vi.fn(async () => ({})),
    }
    await launchVerifications(['A', 'B', 'C'], d)
    expect(peak).toBe(1)
  })
})
