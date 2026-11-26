import { describe, expect, it } from 'vitest'
import { buildKnownAccountValue } from './knownAccountValue'

const presence = (overrides: Record<string, unknown> = {}) => ({
  provider: 'hubspot' as const,
  matched: true,
  contactsCount: 1,
  contacts: [{ id: 'h1', name: 'Marie Dupont', email: 'marie@thales.fr', jobTitle: 'DSI' }],
  openDeals: [],
  lastActivityAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

describe('buildKnownAccountValue (#2556)', () => {
  const contacts = [
    { full_name: 'Marie Dupont', email: 'marie@thales.fr' },
    { full_name: 'Paul Martin', email: null },
    { full_name: 'Karim Benali', email: 'karim@thales.fr' },
  ]
  const signals = [
    { signal: 'Nomination d’un nouveau DSI', date: '2026-09-20' },
    { signal: 'Appel d’offres cloud', date: '2026-08-15' },
    { signal: 'Signal sans date', date: '' },
  ]

  it('nomme les signaux APRÈS le dernier contact CRM et les contacts absents du CRM', () => {
    const value = buildKnownAccountValue({ presence: presence(), contacts, signals })
    expect(value?.newSignals).toEqual(['Nomination d’un nouveau DSI'])
    expect(value?.contactsNotInCrm).toEqual({ count: 2, names: ['Paul Martin', 'Karim Benali'] })
    expect(value?.lastActivityAt).toBe('2026-09-01T00:00:00.000Z')
  })

  it('compte CRM non reconnu ⇒ aucun bloc', () => {
    expect(buildKnownAccountValue({ presence: presence({ matched: false }), contacts, signals })).toBeNull()
    expect(buildKnownAccountValue({ presence: undefined, contacts, signals })).toBeNull()
  })

  it('liste CRM tronquée ⇒ pas de « absents du CRM » (on ne sait pas), jamais deviné', () => {
    const value = buildKnownAccountValue({ presence: presence({ contactsCount: 40 }), contacts, signals })
    expect(value?.contactsNotInCrm).toBeNull()
  })

  it('sans date de dernier contact ⇒ pas de ligne signaux ; rien à ajouter ⇒ aucun bloc', () => {
    const noDate = buildKnownAccountValue({
      presence: presence({ lastActivityAt: null }),
      contacts: [{ full_name: 'Marie Dupont', email: 'marie@thales.fr' }],
      signals,
    })
    expect(noDate).toBeNull()
  })

  // #recette-21-10-K3 — « Ce que Bellum ajoute » ne répète pas les offres déjà listées dans « Signaux de recrutement ».
  it('⚠️ une offre déjà listée dans les signaux de recrutement n’est pas répétée ; les autres signaux restent', () => {
    const value = buildKnownAccountValue({
      presence: presence(),
      contacts,
      signals: [
        { signal: 'Senior Consultant Stratégie DATA / IA', date: '2026-09-20', sourceKind: 'job' },
        { signal: 'Architecte cloud', date: '2026-09-21', sourceKind: 'job' },
        { signal: 'Nomination d’un nouveau DSI', date: '2026-09-22' },
      ],
      listedOfferTitles: ['Senior consultant Stratégie Data et IA'],
    })
    expect(value?.newSignals).toEqual(['Nomination d’un nouveau DSI', 'Architecte cloud'])
  })

  it('un signal de presse au même intitulé qu’une offre listée n’est pas une offre : il reste', () => {
    const value = buildKnownAccountValue({
      presence: presence(),
      contacts,
      signals: [{ signal: 'Architecte cloud', date: '2026-09-21', sourceKind: 'press' }],
      listedOfferTitles: ['Architecte cloud'],
    })
    expect(value?.newSignals).toEqual(['Architecte cloud'])
  })
})
