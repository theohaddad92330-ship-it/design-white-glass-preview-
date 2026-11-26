import { describe, expect, it } from 'vitest'
import {
  nextWatchRunOn,
  SIGNAL_WATCH_CADENCES,
  signalStateKey,
  signalStateRequestSchema,
  watchRequestSchema,
} from './signal-library.js'

describe('signalStateKey — la clé d’un signal survit à une ré-analyse', () => {
  it('ne dépend ni de la casse, ni des espaces, ni des accents multiples', () => {
    expect(signalStateKey('  Recrutement de 12 ingénieurs  data ')).toBe(
      signalStateKey('recrutement de 12 ingénieurs data'),
    )
  })

  it('borne la clé (jamais une ligne démesurée en base)', () => {
    expect(signalStateKey('x'.repeat(2000)).length).toBeLessThanOrEqual(300)
  })

  it('deux faits différents ne partagent pas la clé', () => {
    expect(signalStateKey('Levée de fonds')).not.toBe(signalStateKey('Nomination d’un DSI'))
  })
})

describe('signalStateRequestSchema', () => {
  const item = { account_id: '3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b11', signal_key: 'levée de fonds' }

  it('accepte un état et le retour à « aucun » (null = remettre dans la bibliothèque)', () => {
    expect(signalStateRequestSchema.safeParse({ items: [item], state: 'saved' }).success).toBe(true)
    expect(signalStateRequestSchema.safeParse({ items: [item], state: null }).success).toBe(true)
  })

  it('refuse un état inconnu et une liste vide', () => {
    expect(signalStateRequestSchema.safeParse({ items: [item], state: 'deleted' }).success).toBe(false)
    expect(signalStateRequestSchema.safeParse({ items: [], state: 'saved' }).success).toBe(false)
  })
})

describe('watchRequestSchema — une veille par compte, avec cadence', () => {
  const base = {
    name: 'Transformation & Data',
    account_ids: ['3f2b1c1e-5a0e-4a52-9d5c-0a6a2a6f5b11'],
    natures: [],
    keywords: [],
    cadence: '3_days',
    starts_on: '2026-10-22',
    timezone: 'Europe/Paris',
    channel: 'in_app',
    shared: false,
  }

  it('accepte une veille complète (aucune nature = toutes)', () => {
    expect(watchRequestSchema.safeParse(base).success).toBe(true)
  })

  it('exige au moins un compte et une cadence connue', () => {
    expect(watchRequestSchema.safeParse({ ...base, account_ids: [] }).success).toBe(false)
    expect(watchRequestSchema.safeParse({ ...base, cadence: 'hourly' }).success).toBe(false)
  })

  it('les six cadences de Théo existent, en jours', () => {
    expect(SIGNAL_WATCH_CADENCES.map(c => c.days)).toEqual([1, 3, 5, 7, 14, 30])
  })
})

describe('nextWatchRunOn — la prévision, jamais un chiffre inventé', () => {
  it('avant la date de départ : le départ lui-même', () => {
    expect(nextWatchRunOn('2026-10-25', 3, '2026-10-22')).toBe('2026-10-25')
  })

  it('après le départ : le prochain multiple de la cadence, jamais dans le passé', () => {
    expect(nextWatchRunOn('2026-10-01', 3, '2026-10-22')).toBe('2026-10-22')
    expect(nextWatchRunOn('2026-10-01', 3, '2026-10-23')).toBe('2026-10-25')
  })

  it('une date de départ illisible ne produit aucune échéance', () => {
    expect(nextWatchRunOn('bientôt', 3, '2026-10-22')).toBeNull()
  })
})
