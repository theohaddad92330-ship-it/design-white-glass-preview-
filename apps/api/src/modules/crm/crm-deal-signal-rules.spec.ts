import { CRM_DEAL_SIGNAL_THRESHOLDS, type CrmDealSignalRow } from '@bellum/contracts'
import { detectDealsForRenewal, detectDormantDeals, detectLostDeals } from './crm-deal-signal-rules'

/** Le 15 octobre 2026 à midi — une date fixe, pour que les fenêtres se lisent. */
const NOW = new Date('2026-10-15T12:00:00Z')
const monthsAgo = (months: number) => new Date(NOW.getTime() - months * 30 * 86_400_000)
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

const base: CrmDealSignalRow = {
  id: 'deal-1',
  name: 'Refonte SI — ACME',
  amount: '12000',
  deal_created_at: daysAgo(200),
  closed_at: null,
  last_activity_at: null,
  is_closed: false,
  is_won: null,
}

describe('detectLostDeals — #3918', () => {
  it('émet un signal daté sur une affaire close perdue au-delà du seuil', () => {
    const [signal] = detectLostDeals([{ ...base, is_closed: true, is_won: false, closed_at: monthsAgo(3) }], NOW)
    expect(signal.kind).toBe('affaire_perdue')
    expect(signal.dealFactId).toBe('deal-1')
    expect(signal.evidence).toContain('Refonte SI — ACME')
    expect(signal.evidence).toContain('3 mois')
    expect(signal.occurredAt).toBe(monthsAgo(3).toISOString())
  })

  it('se tait sous le seuil (perdue il y a quelques jours)', () => {
    const signals = detectLostDeals([{ ...base, is_closed: true, is_won: false, closed_at: daysAgo(5) }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('se tait sur une affaire gagnée (is_won true)', () => {
    const signals = detectLostDeals([{ ...base, is_closed: true, is_won: true, closed_at: monthsAgo(3) }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('se tait sur une affaire ouverte (is_closed false)', () => {
    const signals = detectLostDeals([{ ...base, is_closed: false, is_won: null, closed_at: null }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('se tait sans date de clôture — une affaire perdue sans date ne se date jamais au hasard', () => {
    const signals = detectLostDeals([{ ...base, is_closed: true, is_won: false, closed_at: null }], NOW)
    expect(signals).toHaveLength(0)
  })
})

describe('detectDormantDeals — #3918', () => {
  it('émet un signal sur une affaire ouverte sans activité depuis le seuil, basée sur last_activity_at', () => {
    const [signal] = detectDormantDeals(
      [{ ...base, is_closed: false, last_activity_at: daysAgo(60), deal_created_at: daysAgo(400) }],
      NOW,
    )
    expect(signal.kind).toBe('affaire_dormante')
    expect(signal.evidence).toContain('60 jours')
    expect(signal.occurredAt).toBe(daysAgo(60).toISOString())
  })

  it('retombe sur deal_created_at, NOMMÉ, quand last_activity_at est absent', () => {
    const [signal] = detectDormantDeals([{ ...base, is_closed: false, deal_created_at: daysAgo(90) }], NOW)
    expect(signal.evidence).toContain('90 jours')
    expect(signal.evidence).toContain('création')
  })

  it('se tait sous le seuil', () => {
    const signals = detectDormantDeals([{ ...base, is_closed: false, deal_created_at: daysAgo(10) }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('se tait sur une affaire close — close ≠ dormante', () => {
    const signals = detectDormantDeals(
      [{ ...base, is_closed: true, is_won: true, closed_at: daysAgo(400), deal_created_at: daysAgo(400) }],
      NOW,
    )
    expect(signals).toHaveLength(0)
  })

  it('se tait sans aucune date exploitable (création ET activité absentes)', () => {
    const signals = detectDormantDeals(
      [{ ...base, is_closed: false, deal_created_at: null, last_activity_at: null }],
      NOW,
    )
    expect(signals).toHaveLength(0)
  })
})

describe('detectDealsForRenewal — #3918', () => {
  it('émet un signal sur une affaire gagnée depuis le cycle de renouvellement', () => {
    const [signal] = detectDealsForRenewal([{ ...base, is_closed: true, is_won: true, closed_at: daysAgo(400) }], NOW)
    expect(signal.kind).toBe('affaire_renouvellement')
    expect(signal.evidence).toContain('Refonte SI — ACME')
    expect(signal.occurredAt).toBe(daysAgo(400).toISOString())
  })

  it('se tait sous le cycle de renouvellement', () => {
    const signals = detectDealsForRenewal([{ ...base, is_closed: true, is_won: true, closed_at: daysAgo(100) }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('se tait sur une affaire perdue', () => {
    const signals = detectDealsForRenewal([{ ...base, is_closed: true, is_won: false, closed_at: daysAgo(400) }], NOW)
    expect(signals).toHaveLength(0)
  })

  it('utilise le seuil unique du contrat, jamais une copie locale (GA-26)', () => {
    const atThreshold = daysAgo(CRM_DEAL_SIGNAL_THRESHOLDS.renewalCycleDays)
    const [signal] = detectDealsForRenewal([{ ...base, is_closed: true, is_won: true, closed_at: atThreshold }], NOW)
    expect(signal).toBeDefined()
  })
})
