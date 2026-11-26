import { describe, expect, it, vi } from 'vitest'
import type { ActionPlanOutcome, ContactCadence } from '@bellum/contracts'
import { announceFollowUps, followUpChannelOnDone } from './faitFollowUps'

// #4418.1 — « Fait » reste DÉCLARATIF : il planifie J+3 / J+6 / J+9 et l'ANNONCE, sans jamais dire « envoyé ».
const cadence = (next: string | null): ContactCadence =>
  ({
    contact_id: 'c1',
    scheduled: true,
    next_step: next ? { key: 'relance', label: 'Relance', offset_days: 3, due_date: next, done: false } : null,
  }) as unknown as ContactCadence

describe('#4418.1 — followUpChannelOnDone', () => {
  it.each<ActionPlanOutcome>(['positive', 'no_response', 'qualified', 'information_obtained'])(
    'une action d’approche faite avec l’issue %s planifie la cadence',
    outcome => expect(followUpChannelOnDone('email', outcome)).toBe('email'),
  )

  it.each<ActionPlanOutcome>([
    'declined',
    'refused',
    'wrong_contact',
    'invalid_contact',
    'action_cancelled',
    'abandoned',
  ])('l’issue %s ferme la piste : aucune relance n’est planifiée', outcome =>
    expect(followUpChannelOnDone('email', outcome)).toBeNull(),
  )

  it('un appel ou une action sans contact (canal non déclarable) ne planifie rien', () => {
    expect(followUpChannelOnDone(null, 'positive')).toBeNull()
  })
})

describe('#4418.1 — announceFollowUps', () => {
  it('déclare le geste, lit la cadence posée et rend la prochaine relance', async () => {
    const api = {
      declareSent: vi.fn().mockResolvedValue({ contact_id: 'c1', declared: true }),
      cadence: vi.fn().mockResolvedValue(cadence('2026-10-31')),
    }
    expect(await announceFollowUps('c1', 'email', api)).toEqual({ nextOn: '2026-10-31' })
    expect(api.declareSent).toHaveBeenCalledWith('c1', 'email')
  })

  it('SAIT DIRE NON : sans prochaine relance lue, rien n’est annoncé (aucune date inventée)', async () => {
    const api = {
      declareSent: vi.fn().mockResolvedValue({ contact_id: 'c1', declared: true }),
      cadence: vi.fn().mockResolvedValue(cadence(null)),
    }
    expect(await announceFollowUps('c1', 'email', api)).toBeNull()
  })

  it('un échec de planification ne défait pas le « Fait » : null, pas d’exception', async () => {
    const api = { declareSent: vi.fn().mockRejectedValue(new Error('boom')), cadence: vi.fn() }
    expect(await announceFollowUps('c1', 'email', api)).toBeNull()
  })
})
