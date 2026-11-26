import type { Account, RecentSignal } from '@bellum/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { buildAccountWatchData } from './watchData'
import { crmSignalsForWatch } from './crmSignals'

const account = {
  id: 'a1',
  company_name: 'AXA',
  raw_analysis: { recent_signals: [] },
  recent_signals: [],
} as unknown as Account

const LOST: RecentSignal = {
  id: null,
  signal: 'TMA AXA : affaire perdue il y a 3 mois.',
  source: 'Votre CRM',
  source_ref: null,
  url: null,
  source_kind: null,
  type: 'affaire_perdue',
  date: '2026-07-01',
  sales_implication: null,
  impact: null,
  freshness: 'current',
}

describe('#3918.b — les signaux CRM passent par LE lecteur de la veille', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('un signal CRM devient une ligne de veille : le fait, sa date, « Votre CRM »', () => {
    const { signals } = buildAccountWatchData(account, crmSignalsForWatch([LOST]))
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      signal: 'TMA AXA : affaire perdue il y a 3 mois.',
      source: 'Votre CRM',
      date: '2026-07-01',
      type: 'Affaire perdue',
      sourceUrl: null,
    })
  })

  it('sans signal CRM, la veille est exactement celle de l’analyse — rien n’est ajouté', () => {
    expect(buildAccountWatchData(account, crmSignalsForWatch([])).signals).toEqual(
      buildAccountWatchData(account).signals,
    )
  })

  it('nomme le type en anglais quand l’interface est en anglais', async () => {
    await i18n.changeLanguage('en')
    expect(crmSignalsForWatch([{ ...LOST, type: 'affaire_dormante' }])[0]?.type).toBe('Dormant deal')
  })
})
