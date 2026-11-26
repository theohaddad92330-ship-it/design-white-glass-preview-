import { pendingFollowUps, type InteractionFact } from './linkedin-follow-ups'

const NOW = new Date('2026-08-10T12:00:00.000Z')

const fact = (over: Partial<InteractionFact> = {}): InteractionFact => ({
  contactId: 'c1',
  contactName: 'Marc Dupuis',
  kind: 'connection_accepted',
  occurredAt: '2026-08-01T09:00:00.000Z',
  ...over,
})

describe('pendingFollowUps', () => {
  const base = { now: NOW, afterDays: 3 }

  it('remonte une acceptation restée silencieuse', () => {
    const rows = pendingFollowUps([fact()], base)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ contactId: 'c1', contactName: 'Marc Dupuis', daysSinceAccepted: 9 })
  })

  it('ne remonte rien avant le délai', () => {
    expect(pendingFollowUps([fact({ occurredAt: '2026-08-09T12:00:00.000Z' })], base)).toEqual([])
  })

  it('une réponse reçue arrête la relance', () => {
    const rows = pendingFollowUps(
      [fact(), fact({ kind: 'reply_received', occurredAt: '2026-08-02T09:00:00.000Z' })],
      base,
    )
    expect(rows).toEqual([])
  })

  it('un message déjà envoyé met la relance en pause', () => {
    // Relancer quelqu'un à qui on vient d'écrire est la façon la plus rapide de
    // se faire ignorer — c'est le reproche que le rapport fait aux séquences.
    const rows = pendingFollowUps(
      [fact(), fact({ kind: 'message_sent', occurredAt: '2026-08-03T09:00:00.000Z' })],
      base,
    )
    expect(rows).toEqual([])
  })

  it('une acceptation PLUS RÉCENTE qu’un ancien échange rouvre le compteur', () => {
    const rows = pendingFollowUps(
      [
        fact({ kind: 'message_sent', occurredAt: '2026-01-05T09:00:00.000Z' }),
        fact({ occurredAt: '2026-08-01T09:00:00.000Z' }),
      ],
      base,
    )
    expect(rows).toHaveLength(1)
  })

  it('garde la dernière acceptation quand il y en a plusieurs', () => {
    const rows = pendingFollowUps(
      [fact({ occurredAt: '2026-01-01T09:00:00.000Z' }), fact({ occurredAt: '2026-08-05T09:00:00.000Z' })],
      base,
    )
    expect(rows[0]?.daysSinceAccepted).toBe(5)
  })

  it('ignore une invitation envoyée mais jamais acceptée', () => {
    expect(pendingFollowUps([fact({ kind: 'connection_sent' })], base)).toEqual([])
  })

  it('ignore une date illisible plutôt que de la traiter comme aujourd’hui', () => {
    expect(pendingFollowUps([fact({ occurredAt: 'pas une date' })], base)).toEqual([])
  })

  it('classe du silence le plus ancien au plus récent', () => {
    const rows = pendingFollowUps(
      [
        fact({ contactId: 'recent', occurredAt: '2026-08-05T09:00:00.000Z' }),
        fact({ contactId: 'ancien', occurredAt: '2026-07-01T09:00:00.000Z' }),
      ],
      base,
    )
    expect(rows.map(r => r.contactId)).toEqual(['ancien', 'recent'])
  })

  it('une interaction sur une publication ne compte pas comme un échange', () => {
    // Réagir à un post n'est pas écrire à quelqu'un : la relance reste due.
    const rows = pendingFollowUps(
      [fact(), fact({ kind: 'post_engagement', occurredAt: '2026-08-06T09:00:00.000Z' })],
      base,
    )
    expect(rows).toHaveLength(1)
  })
})
