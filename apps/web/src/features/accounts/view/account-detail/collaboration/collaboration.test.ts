import { describe, expect, it } from 'vitest'
import type { Activity } from '@bellum/contracts'
import { colleagueContributors, spokenKind, teamContributors } from './collaboration'

/**
 * #2128.3 / #2128.4 — la dérivation « qui a touché ce compte », et surtout ce
 * qu'elle refuse de calculer.
 *
 * Le témoin le plus important de cette suite est le dernier : un collègue qui a
 * laissé DIX traces et un collègue qui en a laissé UNE se rangent par la DATE
 * de leur dernière trace, jamais par leur nombre. Si un jour quelqu'un ajoute un
 * `count` « pour trier les plus actifs en haut », ce test doit tomber.
 */

function activity(over: Partial<Activity>): Activity {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    kind: 'email',
    source: 'manual',
    direction: 'outbound',
    subject: null,
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt: '2026-09-10T09:00:00.000Z',
    durationSeconds: null,
    accountId: '11111111-1111-4111-8111-111111111111',
    contactId: null,
    projectId: null,
    linkReason: null,
    userId: null,
    authorName: null,
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: '2026-09-10T09:00:00.000Z',
    ...over,
  } as Activity
}

describe('teamContributors', () => {
  it('rend une entrée par collègue, la plus récente en tête', () => {
    const contributors = teamContributors([
      // ⚠️ La trace la plus ANCIENNE de Sarah est en PREMIER, volontairement :
      // une dérivation qui garderait « la première rencontrée » plutôt que « la
      // plus récente » passerait le test si l'ordre l'arrangeait. Ce qui est
      // gardé ici est la DATE, pas la position.
      activity({ userId: 'u-sarah', authorName: 'Sarah Martin', occurredAt: '2026-09-01T08:00:00.000Z' }),
      activity({ userId: 'u-marc', authorName: 'Marc Dupont', occurredAt: '2026-09-13T08:00:00.000Z', kind: 'call' }),
      activity({ userId: 'u-sarah', authorName: 'Sarah Martin', occurredAt: '2026-09-12T08:00:00.000Z' }),
    ])

    expect(contributors.map(c => c.name)).toEqual(['Marc Dupont', 'Sarah Martin'])
    expect(contributors[0]).toEqual({
      userId: 'u-marc',
      name: 'Marc Dupont',
      lastTouchedAt: '2026-09-13T08:00:00.000Z',
      lastKind: 'call',
    })
    // La trace RETENUE pour Sarah est la plus récente des siennes, pas la
    // première rencontrée dans la liste — d'où l'ordre du tableau ci-dessus.
    expect(contributors[1]?.lastTouchedAt).toBe('2026-09-12T08:00:00.000Z')
  })

  it('écarte une activité dont l’auteur ne peut pas être NOMMÉ', () => {
    const contributors = teamContributors([
      activity({ userId: 'u-sarah', authorName: null }),
      activity({ userId: null, authorName: 'Sarah Martin' }),
    ])

    // Ni « Auteur inconnu », ni un uuid : un bandeau qui dit à qui parler n'a
    // rien à dire sur une ligne qu'il ne peut pas nommer.
    expect(contributors).toEqual([])
  })

  it('écarte une activité dont la date est illisible plutôt que de la dater à maintenant', () => {
    const contributors = teamContributors([
      activity({ userId: 'u-sarah', authorName: 'Sarah Martin', occurredAt: 'pas-une-date' }),
    ])

    expect(contributors).toEqual([])
  })

  it('NE CLASSE PAS par volume : dix traces ne passent pas devant une trace plus récente', () => {
    const dix = Array.from({ length: 10 }, (_, index) =>
      activity({
        userId: 'u-sarah',
        authorName: 'Sarah Martin',
        occurredAt: `2026-09-0${index % 9}T08:00:00.000Z`.replace('-00T', '-01T'),
      }),
    )
    const une = activity({ userId: 'u-marc', authorName: 'Marc Dupont', occurredAt: '2026-09-13T08:00:00.000Z' })

    const contributors = teamContributors([...dix, une])

    expect(contributors.map(c => c.name)).toEqual(['Marc Dupont', 'Sarah Martin'])
    // Et il n'existe aucun compteur à lire : la forme elle-même refuse la
    // question « qui est le plus actif ? ».
    expect(Object.keys(contributors[0] ?? {})).toEqual(['userId', 'name', 'lastTouchedAt', 'lastKind'])
  })

  it('rend une liste vide sur une timeline vide, sans inventer de porteur', () => {
    expect(teamContributors([])).toEqual([])
  })
})

/** #4158.20 — « déjà travaillé par X » : des collègues, dans les 90 jours. */
describe('colleagueContributors (#4158.20)', () => {
  const NOW = Date.parse('2026-10-14T12:00:00.000Z')
  const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

  it('ne nomme jamais moi-même — rien si seul moi ai agi', () => {
    const items = [activity({ userId: 'u-moi', authorName: 'Moi', occurredAt: daysAgo(2) })]
    expect(colleagueContributors(items, 'u-moi', NOW)).toEqual([])
  })

  it('rien quand personne n’a agi', () => {
    expect(colleagueContributors([], 'u-moi', NOW)).toEqual([])
  })

  it('nomme un collègue actif dans les 90 jours, avec la nature de sa dernière trace', () => {
    const items = [activity({ userId: 'u-sarah', authorName: 'Sarah', kind: 'call', occurredAt: daysAgo(5) })]
    expect(colleagueContributors(items, 'u-moi', NOW)).toMatchObject([
      { userId: 'u-sarah', name: 'Sarah', lastKind: 'call' },
    ])
  })

  it('écarte une trace de plus de 90 jours', () => {
    const items = [activity({ userId: 'u-sarah', authorName: 'Sarah', occurredAt: daysAgo(91) })]
    expect(colleagueContributors(items, 'u-moi', NOW)).toEqual([])
  })

  it('une nature système (analyse, changement d’étape) ne se dit pas', () => {
    expect(spokenKind('stage_change')).toBeNull()
    expect(spokenKind('analysis')).toBeNull()
    expect(spokenKind('email')).toBe('email')
  })
})
