import { describe, expect, it } from 'vitest'
import type { AccountSignalLine } from '@bellum/contracts'
import { signalLineToWatchlistItem } from './account-history'

/** #5191 — l'adaptateur pur ligne de besoin → ce que `WatchlistSignalDetail` attend. */
const line = (over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id: 'l1',
  date: '2026-05-12',
  date_precision: 'month',
  period: 'now',
  type: 'recrutement',
  origin_kind: 'analyse',
  title: 'Ingénieur DevOps',
  detail: 'Renfort sur la plateforme.',
  url: 'https://exemple.test/offre',
  technologies: ['Kafka', 'Java'],
  tjm_eur: 650,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})
const account = { id: 'acc-1', companyName: 'Norauto', sector: 'Retail', website: 'norauto.fr' }

describe('signalLineToWatchlistItem', () => {
  it('porte le titre, la date à sa précision, le lien, le détail et les compétences', () => {
    const item = signalLineToWatchlistItem(line(), account)
    expect(item).toMatchObject({
      accountId: 'acc-1',
      companyName: 'Norauto',
      signalLabel: 'Ingénieur DevOps',
      signalDate: '2026-05',
      sourceUrl: 'https://exemple.test/offre',
      salesImplication: 'Renfort sur la plateforme.',
      website: 'norauto.fr',
    })
    expect(item.offerAttachment).toMatchObject({ skills: ['Kafka', 'Java'] })
    expect(item.signalLine?.id).toBe('l1')
  })

  it('une absence reste une absence : ni technologie, ni lieu, ni logo ne sont inventés', () => {
    const item = signalLineToWatchlistItem(line({ technologies: undefined, url: null, detail: null }), account)
    expect(item.offerAttachment).toBeNull()
    expect(item.sourceUrl).toBeNull()
    expect(item.salesImplication).toBeNull()
    expect(item.location).toBeNull()
    expect(item.logoUrl).toBeNull()
  })

  it('le lieu : celui de la ligne, sinon le siège du compte', () => {
    expect(
      signalLineToWatchlistItem(line({ people_hints: { names: [], roles: [], location: 'Lille' } }), account).location,
    ).toBe('Lille')
    expect(signalLineToWatchlistItem(line(), { ...account, headquarters: 'Paris' }).location).toBe('Paris')
  })

  it('Actuel n’est pas archivé ; Historique l’est', () => {
    expect(signalLineToWatchlistItem(line(), account)).toMatchObject({ archived: false, temporalStatus: null })
    expect(signalLineToWatchlistItem(line({ period: 'past' }), account)).toMatchObject({
      archived: true,
      temporalStatus: 'HISTORICAL',
    })
  })
})
