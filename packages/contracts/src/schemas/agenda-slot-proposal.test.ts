import { describe, expect, it } from 'vitest'
import {
  readAgendaSlotRejections,
  wasSlotRejectedToday,
  withAgendaSlotRejection,
  agendaSlotProposalPreviewRequestSchema,
  agendaSlotProposalConfirmRequestSchema,
  bellumCreatedEventIdsResponseSchema,
} from './agenda-slot-proposal.js'

/**
 * #2770 (#2101.40) — une routine rejetée pour un compte, aujourd'hui, n'est
 * pas reproposée. Même promesse que `agenda-preferences.test.ts` : une
 * entrée corrompue du sac est écartée, elle n'efface pas les autres.
 */
describe('agenda-slot-proposal — la mémoire de refus', () => {
  it('lit une liste vide sans le sac, ou sur une forme invalide', () => {
    expect(readAgendaSlotRejections(null)).toEqual([])
    expect(readAgendaSlotRejections({})).toEqual([])
    expect(readAgendaSlotRejections({ agendaSlotRejections: 'hier' })).toEqual([])
  })

  it('écarte une entrée corrompue SANS effacer les entrées valides à côté', () => {
    expect(
      readAgendaSlotRejections({
        agendaSlotRejections: [{ accountId: 'a1', date: '2026-09-27' }, { accountId: 42 }, 'pas un objet'],
      }),
    ).toEqual([{ accountId: 'a1', date: '2026-09-27' }])
  })

  it('un refus AUJOURD’HUI pour ce compte suspend la proposition', () => {
    const rejections = [{ accountId: 'a1', date: '2026-09-27' }]
    expect(wasSlotRejectedToday(rejections, 'a1', '2026-09-27')).toBe(true)
    expect(wasSlotRejectedToday(rejections, 'a1', '2026-09-28')).toBe(false)
    expect(wasSlotRejectedToday(rejections, 'a2', '2026-09-27')).toBe(false)
  })

  it('ajoute un refus sans le dupliquer (même compte, même jour)', () => {
    const once = withAgendaSlotRejection([], 'a1', '2026-09-27')
    const twice = withAgendaSlotRejection(once, 'a1', '2026-09-27')
    expect(twice).toEqual([{ accountId: 'a1', date: '2026-09-27' }])
  })

  it('reste borné — un sac actif depuis des années ne grossit pas sans fin', () => {
    let rejections: ReturnType<typeof withAgendaSlotRejection> = []
    for (let i = 0; i < 250; i += 1) {
      rejections = withAgendaSlotRejection(rejections, `a${i}`, `2026-01-${String((i % 28) + 1).padStart(2, '0')}`)
    }
    expect(rejections.length).toBe(200)
  })
})

describe('agenda-slot-proposal — les contrats de requête', () => {
  it('preview : une durée par défaut de 60 minutes, jamais deviné en silence côté service', () => {
    const parsed = agendaSlotProposalPreviewRequestSchema.parse({ accountId: 'a1' })
    expect(parsed.durationMinutes).toBe(60)
  })

  it('preview : refuse une durée hors bornes', () => {
    expect(agendaSlotProposalPreviewRequestSchema.safeParse({ accountId: 'a1', durationMinutes: 5 }).success).toBe(
      false,
    )
  })

  it('confirm : exige le compte, le titre exact et les bornes — rien de deviné côté serveur', () => {
    expect(
      agendaSlotProposalConfirmRequestSchema.safeParse({
        accountId: 'a1',
        title: 'Point commercial — ACME',
        start: '2026-09-28T09:00:00.000Z',
        end: '2026-09-28T09:30:00.000Z',
      }).success,
    ).toBe(true)
    expect(agendaSlotProposalConfirmRequestSchema.safeParse({ accountId: 'a1' }).success).toBe(false)
  })
})

/**
 * #2770 (#2101.19/.21/.22/.37) — la liste que la grille/le plateau croisent
 * avec `event.id` pour poser `AgendaEvent.createdByBellum`.
 */
describe('bellumCreatedEventIdsResponseSchema', () => {
  it('accepte une liste vide — aucun évènement écrit par cette porte pour cet utilisateur', () => {
    expect(bellumCreatedEventIdsResponseSchema.safeParse({ eventIds: [] }).success).toBe(true)
  })

  it('accepte une liste d’identifiants', () => {
    const parsed = bellumCreatedEventIdsResponseSchema.safeParse({ eventIds: ['evt-1', 'evt-2'] })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.eventIds).toEqual(['evt-1', 'evt-2'])
  })

  it('refuse un identifiant non-chaîne — jamais un objet deviné', () => {
    expect(bellumCreatedEventIdsResponseSchema.safeParse({ eventIds: [42] }).success).toBe(false)
  })
})
