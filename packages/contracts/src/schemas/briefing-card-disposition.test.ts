import { describe, expect, it } from 'vitest'
import {
  briefingDismissReasonNature,
  BRIEFING_DISMISS_REASONS,
  BRIEFING_POSTPONE_OPTIONS,
  briefingCardDispositionRequestSchema,
  briefingPostponeUntil,
  excludeDisposedBriefingActions,
  readBriefingCardDispositions,
  withBriefingCardDisposition,
  type BriefingCardDisposition,
} from './briefing-card-disposition.js'

const NOW = new Date('2026-09-28T09:00:00.000Z') // lundi

function card(id: string, observedAt: string | null = null) {
  return { id, fact: observedAt ? { provenance: { observedAt } } : null }
}

describe('briefing card disposition — contrat (#2099.17-.32)', () => {
  it('nomme les quatre options de report et les six motifs de refus, dans l’ordre de #2099', () => {
    expect(BRIEFING_POSTPONE_OPTIONS).toEqual(['this_afternoon', 'tomorrow', 'this_week', 'custom'])
    expect(BRIEFING_DISMISS_REASONS).toEqual([
      'wrong_priority',
      'already_handled',
      'wrong_data',
      'not_now',
      'out_of_scope',
      'other',
    ])
  })

  it('refuse un refus sans motif, et un report sans date', () => {
    expect(briefingCardDispositionRequestSchema.safeParse({ actionId: 'a', disposition: 'dismissed' }).success).toBe(
      false,
    )
    expect(briefingCardDispositionRequestSchema.safeParse({ actionId: 'a', disposition: 'postponed' }).success).toBe(
      false,
    )
    expect(
      briefingCardDispositionRequestSchema.safeParse({ actionId: 'a', disposition: 'dismissed', reason: 'bof' })
        .success,
    ).toBe(false)
    expect(
      briefingCardDispositionRequestSchema.safeParse({
        actionId: 'a',
        disposition: 'dismissed',
        reason: 'wrong_data',
        factObservedAt: null,
      }).success,
    ).toBe(true)
  })

  it('lit le sac de façon tolérante : une entrée corrompue est écartée, pas les autres', () => {
    expect(readBriefingCardDispositions(null)).toEqual([])
    expect(readBriefingCardDispositions({ briefingCardDispositions: 'x' })).toEqual([])
    const read = readBriefingCardDispositions({
      briefingCardDispositions: [
        { actionId: 'a', disposition: 'done', reason: null, until: null, factObservedAt: null, at: NOW.toISOString() },
        { actionId: 'b', disposition: 'inventé' },
      ],
    })
    expect(read.map(entry => entry.actionId)).toEqual(['a'])
  })

  it('un nouveau geste sur la même carte REMPLACE l’ancien, et le sac reste borné', () => {
    const first = withBriefingCardDisposition([], { actionId: 'a', disposition: 'done', factObservedAt: null }, NOW)
    const second = withBriefingCardDisposition(
      first,
      { actionId: 'a', disposition: 'dismissed', reason: 'out_of_scope', factObservedAt: null },
      NOW,
    )
    expect(second).toHaveLength(1)
    expect(second[0]?.disposition).toBe('dismissed')
    let bag: BriefingCardDisposition[] = []
    for (let i = 0; i < 260; i += 1) {
      bag = withBriefingCardDisposition(bag, { actionId: `x${i}`, disposition: 'done', factObservedAt: null }, NOW)
    }
    expect(bag.length).toBeLessThanOrEqual(200)
    expect(bag.at(-1)?.actionId).toBe('x259')
  })
})

describe('excludeDisposedBriefingActions — un refus est respecté (#2099.52)', () => {
  const later = (hours: number) => new Date(NOW.getTime() + hours * 3600_000)

  it('une carte reportée disparaît jusqu’à sa date, puis revient', () => {
    const bag = withBriefingCardDisposition(
      [],
      { actionId: 'a', disposition: 'postponed', until: later(5).toISOString(), factObservedAt: null },
      NOW,
    )
    expect(excludeDisposedBriefingActions([card('a'), card('b')], bag, later(1)).map(c => c.id)).toEqual(['b'])
    expect(excludeDisposedBriefingActions([card('a'), card('b')], bag, later(6)).map(c => c.id)).toEqual(['a', 'b'])
  })

  it('une carte refusée ou déjà traitée ne revient pas sur le même fait', () => {
    const bag = withBriefingCardDisposition(
      withBriefingCardDisposition(
        [],
        { actionId: 'a', disposition: 'dismissed', reason: 'wrong_priority', factObservedAt: '2026-09-27T10:00:00Z' },
        NOW,
      ),
      { actionId: 'b', disposition: 'done', factObservedAt: null },
      NOW,
    )
    const cards = [card('a', '2026-09-27T10:00:00Z'), card('b'), card('c')]
    expect(excludeDisposedBriefingActions(cards, bag, later(24 * 10)).map(c => c.id)).toEqual(['c'])
  })

  it('un FAIT NOUVEAU sur la même carte est une raison de revenir (#2099.54)', () => {
    const bag = withBriefingCardDisposition(
      [],
      { actionId: 'a', disposition: 'dismissed', reason: 'wrong_priority', factObservedAt: '2026-09-27T10:00:00Z' },
      NOW,
    )
    expect(excludeDisposedBriefingActions([card('a', '2026-09-28T08:00:00Z')], bag, later(1)).map(c => c.id)).toEqual([
      'a',
    ])
  })

  it('« pas maintenant » ne tient que 24 h ; un refus au-delà de 30 jours n’est plus appliqué', () => {
    const bag = withBriefingCardDisposition(
      withBriefingCardDisposition(
        [],
        { actionId: 'a', disposition: 'dismissed', reason: 'not_now', factObservedAt: null },
        NOW,
      ),
      { actionId: 'b', disposition: 'dismissed', reason: 'out_of_scope', factObservedAt: null },
      NOW,
    )
    const cards = [card('a'), card('b')]
    expect(excludeDisposedBriefingActions(cards, bag, later(2)).map(c => c.id)).toEqual([])
    expect(excludeDisposedBriefingActions(cards, bag, later(25)).map(c => c.id)).toEqual(['a'])
    expect(excludeDisposedBriefingActions(cards, bag, later(24 * 31)).map(c => c.id)).toEqual(['a', 'b'])
  })

  it('#3671 — « pas pertinent » (préférence) reste distinct de « donnée fausse » (fait corrigé)', () => {
    expect(briefingDismissReasonNature('wrong_data')).toBe('fact_correction')
    expect(briefingDismissReasonNature('already_handled')).toBe('fact_correction')
    for (const reason of ['wrong_priority', 'not_now', 'out_of_scope', 'other'] as const) {
      expect(briefingDismissReasonNature(reason)).toBe('preference')
    }
    const fact = '2026-09-27T10:00:00Z'
    const wrong = withBriefingCardDisposition(
      [],
      { actionId: 'a', disposition: 'dismissed', reason: 'wrong_data', factObservedAt: fact },
      NOW,
    )
    const pref = withBriefingCardDisposition(
      [],
      { actionId: 'a', disposition: 'dismissed', reason: 'out_of_scope', factObservedAt: fact },
      NOW,
    )
    const cards = [{ id: 'a', fact: { provenance: { observedAt: fact } } }]
    const far = new Date(NOW.getTime() + 90 * 24 * 3600_000)
    // un fait déclaré faux ne réapparaît pas tel quel, même après 90 jours
    expect(excludeDisposedBriefingActions(cards, wrong, far)).toEqual([])
    // une préférence expire : ce n'est pas la preuve d'une absence de projet
    expect(excludeDisposedBriefingActions(cards, pref, far)).toHaveLength(1)
    // et un fait nouveau fait toujours revenir la carte corrigée
    const fresh = [{ id: 'a', fact: { provenance: { observedAt: '2026-12-01T00:00:00Z' } } }]
    expect(excludeDisposedBriefingActions(fresh, wrong, far)).toHaveLength(1)
  })

  it('un sac vide rend la liste telle quelle (même référence)', () => {
    const cards = [card('a')]
    expect(excludeDisposedBriefingActions(cards, [], NOW)).toBe(cards)
  })
})

describe('briefingPostponeUntil — les quatre options de report (#2099.21-.24)', () => {
  const tz = 'Europe/Paris'

  it('cet après-midi : 14 h locales, ou dans trois heures si 14 h est passé', () => {
    expect(briefingPostponeUntil('this_afternoon', NOW, tz)).toBe('2026-09-28T12:00:00.000Z')
    const afternoon = new Date('2026-09-28T13:30:00.000Z')
    expect(briefingPostponeUntil('this_afternoon', afternoon, tz)).toBe('2026-09-28T16:30:00.000Z')
  })

  it('demain : 9 h locales le lendemain', () => {
    expect(briefingPostponeUntil('tomorrow', NOW, tz)).toBe('2026-09-29T07:00:00.000Z')
  })

  it('cette semaine : vendredi 9 h ; à partir du vendredi, lundi suivant 9 h', () => {
    expect(briefingPostponeUntil('this_week', NOW, tz)).toBe('2026-10-02T07:00:00.000Z')
    const friday = new Date('2026-10-02T10:00:00.000Z')
    expect(briefingPostponeUntil('this_week', friday, tz)).toBe('2026-10-05T07:00:00.000Z')
  })

  it('date personnalisée : 9 h locales ce jour-là ; une date passée ou illisible rend null', () => {
    expect(briefingPostponeUntil('custom', NOW, tz, '2026-10-10')).toBe('2026-10-10T07:00:00.000Z')
    expect(briefingPostponeUntil('custom', NOW, tz, '2026-09-01')).toBeNull()
    expect(briefingPostponeUntil('custom', NOW, tz, 'demain')).toBeNull()
    expect(briefingPostponeUntil('custom', NOW, tz)).toBeNull()
  })
})
