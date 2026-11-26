import type { RegistryAnnouncement } from '@bellum/contracts'
import { awardSignalItems } from './award-signals'

// #3915.decp — les marchés publics attribués lus en continu sont des signaux datés du compte,
// lus par la Veille ET par Laura (`get_account_signals`) au même endroit que les autres.
const NOW = new Date('2026-10-16T08:00:00Z').getTime()

const account = {
  id: '6f1c1d5e-6a0c-4c39-9a52-1a1d1d1d1d1d',
  company_name: 'Thales',
  sector: 'Défense',
  priority_score: 72,
  created_at: '2026-10-01T00:00:00.000Z',
  logo_url: null,
  website: 'https://www.thalesgroup.com',
  signals_collected_at: null,
}

function award(over: Partial<RegistryAnnouncement> = {}): RegistryAnnouncement {
  return {
    source: 'decp',
    kind: 'award_won',
    type: 'Expertise DATA-IA',
    date: '2026-09-01',
    url: null,
    tribunal: null,
    counterpart: 'MINISTERE DE L EUROPE',
    ...over,
  }
}

describe('#3915.decp — awardSignalItems', () => {
  it('un marché remporté devient un signal daté, source nommée par sa nature, acheteur nommé', () => {
    expect(awardSignalItems(account, [award()], NOW)).toEqual([
      expect.objectContaining({
        account_id: account.id,
        company_name: 'Thales',
        label: 'Marché remporté — Expertise DATA-IA (acheteur : MINISTERE DE L EUROPE)',
        date: '2026-09-01',
        source: 'Marchés publics attribués',
        source_kind: 'tender',
        source_url: null,
        type: 'tender',
      }),
    ])
  })

  it('un marché attribué PAR le compte nomme son titulaire, jamais deviné quand il manque', () => {
    const [named, anonymous] = awardSignalItems(
      account,
      [award({ kind: 'award', counterpart: 'Acme SA' }), award({ kind: 'award', counterpart: null, type: 'TMA' })],
      NOW,
    )
    expect(named?.label).toBe('Marché attribué — Expertise DATA-IA (titulaire : Acme SA)')
    expect(anonymous?.label).toBe('Marché attribué — TMA')
  })

  it('NON : une annonce BODACC, un marché périmé ou sans objet ne font AUCUNE ligne', () => {
    expect(
      awardSignalItems(
        account,
        [award({ source: 'bodacc', kind: 'sale' }), award({ date: '2023-01-01' }), award({ type: null })],
        NOW,
      ),
    ).toEqual([])
  })
})
