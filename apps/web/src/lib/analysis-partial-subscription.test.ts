/**
 * #2630.2 — LA CHAÎNE, de bout en bout : ce que le serveur émet arrive
 * réellement dans l'état de la course.
 *
 * ⚠️ C'est le maillon qui manquait, et le défaut se répète dans ce dépôt : le
 * serveur envoyait la sortie de chaque phase sur `phase:complete` et
 * `analysis-subscription.ts` ne destructurait que `{ phase, percent }`. Un test
 * qui poserait le partiel À LA MAIN dans le store serait vert sur cette
 * coupure — ce fichier part donc d'une CHARGE DE SOCKET, telle qu'elle arrive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalysisPartial } from '@bellum/contracts'

const handlers: Record<string, (payload: unknown) => void> = {}

vi.mock('@/lib/socket', () => ({
  subscribeToAccount: (_accountId: string, map: Record<string, (payload: unknown) => void>) => {
    Object.assign(handlers, map)
    return () => undefined
  },
}))

const { useAnalysisStore } = await import('@/stores/analysisStore')
const { subscribeToAnalysisRun } = await import('./analysis-subscription')

const PARTIAL: AnalysisPartial = {
  phase: 'contacts_complete',
  at: 1_758_000_000_000,
  findings: [{ kind: 'contacts', count: 4, samples: ['Claire Roggeman'] }],
}

function fireComplete(partial: unknown) {
  handlers['phase:complete']({
    accountId: 'acc-1',
    jobId: 'job-1',
    phase: 'contacts_complete',
    percent: 70,
    partial,
  })
}

describe('#2630.2 — le partiel du serveur atteint l’état de la course', () => {
  beforeEach(() => {
    useAnalysisStore.setState({ runs: {} })
    useAnalysisStore.getState().start('acc-1', 'job-1', 'Roggeman Structures')
    subscribeToAnalysisRun('acc-1', { invalidateQueries: vi.fn() } as never)
  })

  it('une complétion de phase qui PORTE un partiel le fait entrer dans la course', () => {
    fireComplete(PARTIAL)
    expect(useAnalysisStore.getState().runs['acc-1'].partials).toEqual([PARTIAL])
  })

  it('une complétion SANS partiel n’en invente aucun', () => {
    fireComplete(undefined)
    expect(useAnalysisStore.getState().runs['acc-1'].partials).toEqual([])
  })

  it('une charge MALFORMÉE est rejetée, pas affichée — le contrat garde la porte', () => {
    // Le coupable : un décompte à zéro, exactement la ligne « 0 contact trouvé »
    // que le produit refuse d'afficher.
    fireComplete({ phase: 'contacts_complete', at: 1, findings: [{ kind: 'contacts', count: 0, samples: [] }] })
    expect(useAnalysisStore.getState().runs['acc-1'].partials).toEqual([])

    fireComplete({ nimporte: 'quoi' })
    expect(useAnalysisStore.getState().runs['acc-1'].partials).toEqual([])
  })
})
