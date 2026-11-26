import type { Activity } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { lastExpressedObjection } from './expressed-objection'

const call = (occurredAt: string, objection?: string) =>
  ({ kind: 'call', occurredAt, callDebrief: objection === undefined ? null : { objection } }) as Pick<
    Activity,
    'kind' | 'occurredAt' | 'callDebrief'
  >

describe('lastExpressedObjection (#3697.8)', () => {
  it('rend la plus récente objection consignée, avec la date de l’appel qui la porte', () => {
    const result = lastExpressedObjection([
      call('2026-09-01T10:00:00.000Z', 'Budget gelé'),
      call('2026-10-02T10:00:00.000Z', '  Déjà un prestataire  '),
      call('2026-10-03T10:00:00.000Z'),
    ])
    expect(result).toEqual({ text: 'Déjà un prestataire', at: '2026-10-02T10:00:00.000Z' })
  })

  it('SAIT DIRE NON — aucun appel avec objection, un texte vide ou une autre nature : rien, jamais une objection fabriquée', () => {
    expect(lastExpressedObjection([])).toBeNull()
    expect(lastExpressedObjection([call('2026-10-02T10:00:00.000Z', '   ')])).toBeNull()
    expect(
      lastExpressedObjection([
        { kind: 'email', occurredAt: '2026-10-02T10:00:00.000Z', callDebrief: { objection: 'Trop cher' } },
      ] as never),
    ).toBeNull()
  })
})
