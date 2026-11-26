import type { ReadSignalLayers } from '@bellum/contracts'
import { AnalysisWorker } from './analysis.worker'

// #4760 — la garde que l'issue demandait et qui n'existait pas. `historical-needs-wiring-4760.spec.ts` tient
// qu'un APPELANT existe ; celle-ci tient que l'appelant FAIT ENTRER la donnée au dossier : si l'analyse d'un
// compte à historique rend un dossier SANS besoin historique alors que la donnée est présente, elle échoue.
const SIGNAL = { label: 'Migration vers le cloud annoncée', date: '2025-09-01', windowDays: 180 }
const OFFER = { label: 'Architecte SAP', date: '2025-02-10', windowDays: 180 }
const UNDATED = { label: 'Chef de projet', date: null, windowDays: null }

async function run(read: ReadSignalLayers): Promise<{ saved: jest.Mock; readLayers: jest.Mock }> {
  const saved = jest.fn().mockResolvedValue(undefined)
  const readLayers = jest.fn().mockResolvedValue(read)
  const self = {
    persistence: { readSignalLayers: readLayers, saveHistoricalNeeds: saved },
    logger: { log: jest.fn(), warn: jest.fn() },
  }
  const record = (AnalysisWorker.prototype as unknown as Record<string, (id: string) => Promise<void>>)[
    'recordHistoricalNeeds'
  ]
  await record.call(self, 'acc-1')
  return { saved, readLayers }
}

describe('#4760 — le dossier NOMME les besoins historiques présents dans les couches', () => {
  it('donnée présente → le dossier reçoit libellé, date réelle, source et total', async () => {
    const { saved } = await run({
      historicalSignals: [SIGNAL],
      historicalJobOffers: [OFFER],
      historicalCount: 2,
    })
    expect(saved).toHaveBeenCalledTimes(1)
    const [accountId, block] = saved.mock.calls[0] as [string, { total: number; items: unknown[] }]
    expect(accountId).toBe('acc-1')
    expect(block.total).toBe(2)
    expect(block.items).toEqual([
      { label: 'Migration vers le cloud annoncée', date: '2025-09-01', source: 'signal' },
      { label: 'Architecte SAP', date: '2025-02-10', source: 'job_offer' },
    ])
  })

  it('un besoin de plus de 180 jours est nommé AVEC sa date réelle', async () => {
    const { saved } = await run({ historicalSignals: [], historicalJobOffers: [OFFER], historicalCount: 1 })
    const block = saved.mock.calls[0]?.[1] as { items: { date: string | null }[] }
    expect(block.items[0]?.date).toBe('2025-02-10')
  })

  it('un besoin non daté reste non daté (ni date devinée, ni zéro), et ferme la liste', async () => {
    const { saved } = await run({ historicalSignals: [UNDATED], historicalJobOffers: [OFFER], historicalCount: 2 })
    const block = saved.mock.calls[0]?.[1] as { total: number; items: { label: string; date: string | null }[] }
    expect(block.items.map(i => i.date)).toEqual(['2025-02-10', null])
    expect(block.total).toBe(2)
  })

  it('couche absente (analyse antérieure) → rien n’est écrit : une absence ne fait aucune ligne', async () => {
    const { saved } = await run({ historicalSignals: [], historicalJobOffers: [], historicalCount: null })
    expect(saved).not.toHaveBeenCalled()
  })

  it('couche présente mais sans historique → la clé périmée est retirée, jamais un total à 0', async () => {
    const { saved } = await run({ historicalSignals: [], historicalJobOffers: [], historicalCount: 0 })
    expect(saved).toHaveBeenCalledWith('acc-1', null)
  })
})
