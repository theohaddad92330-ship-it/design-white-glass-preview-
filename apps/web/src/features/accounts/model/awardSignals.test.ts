import type { Account, RegistryAnnouncement } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildAccountWatchData } from './watchData'
import { awardSignalsForWatch } from './awardSignals'

const account = {
  id: 'a1',
  company_name: 'Thales',
  raw_analysis: { recent_signals: [] },
  recent_signals: [],
} as unknown as Account

const NOW = Date.parse('2026-10-27T08:00:00Z')

const award = (over: Partial<RegistryAnnouncement>): RegistryAnnouncement => ({
  source: 'decp',
  kind: 'award',
  type: 'Maintenance des systèmes d’information',
  date: '2026-10-01',
  url: 'https://www.data.gouv.fr/fr/datasets/x',
  tribunal: null,
  counterpart: 'Atos',
  ...over,
})

describe('#4286.1 — les marchés publics attribués entrent dans LA veille de la fiche compte', () => {
  it('un marché attribué devient une ligne datée, avec sa partie d’en face et son lien', () => {
    const { signals } = buildAccountWatchData(account, awardSignalsForWatch([award({})], NOW))
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({
      signal: 'Marché attribué — Maintenance des systèmes d’information (titulaire : Atos)',
      source: 'Marchés publics attribués',
      date: '2026-10-01',
    })
  })

  it('un marché remporté par le compte le dit', () => {
    const [row] = awardSignalsForWatch([award({ kind: 'award_won', counterpart: 'Ministère des Armées' })], NOW)
    expect(row?.signal).toBe(
      'Marché remporté — Maintenance des systèmes d’information (acheteur : Ministère des Armées)',
    )
  })

  it('refuse ce qui n’est pas un marché, un marché sans objet, un marché périmé', () => {
    const rows = awardSignalsForWatch(
      [
        award({ source: 'bodacc', kind: 'collective_proceeding' }),
        award({ type: '  ' }),
        award({ date: '2019-01-01' }),
      ],
      NOW,
    )
    expect(rows).toEqual([])
  })

  it('sans registre, la veille est exactement celle de l’analyse', () => {
    expect(awardSignalsForWatch(undefined, NOW)).toEqual([])
    expect(buildAccountWatchData(account, awardSignalsForWatch([], NOW)).signals).toEqual(
      buildAccountWatchData(account).signals,
    )
  })
})
