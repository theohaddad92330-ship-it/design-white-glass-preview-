import type { OutreachSequence, OutreachSequenceStep } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { SEQUENCE_BUCKETS, bucketCounts, bucketsOf, filterByBucket, progressOf } from './sequences-cockpit'

/**
 * LE COCKPIT DES SÉQUENCES (#1509, #1515).
 *
 * La propriété que ces tests protègent tient en une phrase : **le compteur et
 * le filtre ne peuvent pas se contredire**, parce qu'ils appellent la même
 * fonction. C'est le défaut « un compteur JUSTE peut promettre un filtre FAUX »
 * que ce dépôt a déjà payé une fois, et il ne se voit pas à l'écran — il faut
 * compter les lignes.
 */

const NOW = new Date('2026-09-04T10:00:00.000Z')

function step(over: Partial<OutreachSequenceStep> = {}): OutreachSequenceStep {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sequence_id: '22222222-2222-2222-2222-222222222222',
    position: 0,
    due_at: '2026-09-10T09:00:00.000Z',
    kind: 'email',
    payload: {},
    status: 'pending',
    done_at: null,
    engagement_signal: null,
    engagement_signal_at: null,
    ...over,
  }
}

function sequence(over: Partial<OutreachSequence> = {}): OutreachSequence {
  const steps = over.steps ?? [step()]
  return {
    id: '33333333-3333-3333-3333-333333333333',
    contact_id: '44444444-4444-4444-4444-444444444444',
    contact_name: 'Marie Dubois',
    contact_role: 'DSI',
    account_id: '55555555-5555-5555-5555-555555555555',
    account_name: 'NOVA LOGISTIQUE',
    name: 'Compte froid — email',
    // #2203.32 — lancée seule : aucune campagne (`campaign-label.ts`).
    campaign_label: null,
    // #2378.6/.7 — composée à la main, pas une copie.
    template_key: null,
    consultant_id: null,
    duplicated_from: null,
    forced_over_sequence_id: null,
    force_justification: null,
    status: 'active',
    created_at: '2026-09-01T09:00:00.000Z',
    steps,
    next_step: steps.find(s => s.status === 'pending') ?? null,
    contact_replied: false,
    cancel_reason: null,
    not_now_revalidation: null,
    can_send: true,
    delay_unit: 'calendar_days',
    vacation_until: null,
    ...over,
  }
}

describe('bucketsOf', () => {
  it('une séquence qui court, échéance lointaine : « active » et rien d’autre', () => {
    expect(bucketsOf(sequence(), NOW)).toEqual(['active'])
  })

  it('une échéance AUJOURD’HUI compte dans les deux seaux — un total exclusif mentirait', () => {
    const today = sequence({ steps: [step({ due_at: '2026-09-04T16:00:00.000Z' })] })
    expect(bucketsOf({ ...today, next_step: today.steps[0]! }, NOW)).toEqual(['active', 'dueToday'])
  })

  it('une échéance DÉPASSÉE est due, et plus encore', () => {
    const late = sequence({ steps: [step({ due_at: '2026-08-28T09:00:00.000Z' })] })
    expect(bucketsOf({ ...late, next_step: late.steps[0]! }, NOW)).toContain('dueToday')
  })

  it('« a répondu » SORT de « active » — la séquence s’arrête, l’écran doit le dire une seule fois', () => {
    expect(bucketsOf(sequence({ contact_replied: true }), NOW)).toEqual(['replied'])
  })

  it('un e-mail sans messagerie connectée est BLOQUÉ, pas seulement actif', () => {
    expect(bucketsOf(sequence({ can_send: false }), NOW)).toEqual(['active', 'blocked'])
  })

  it('une séquence terminée n’est dans AUCUN seau — elle n’attend rien', () => {
    expect(bucketsOf(sequence({ status: 'completed' }), NOW)).toEqual([])
  })

  it('le statut vient du DÉRIVÉ, pas de la colonne : une pause ne « court » pas', () => {
    expect(bucketsOf(sequence({ status: 'paused' }), NOW)).toEqual([])
  })
})

describe('le compteur et le filtre ne peuvent pas se contredire', () => {
  const corpus = [
    sequence({ id: 'a1111111-1111-1111-1111-111111111111' }),
    sequence({ id: 'b1111111-1111-1111-1111-111111111111', contact_replied: true }),
    sequence({ id: 'c1111111-1111-1111-1111-111111111111', can_send: false }),
    sequence({ id: 'd1111111-1111-1111-1111-111111111111', status: 'completed' }),
    (() => {
      const s = sequence({
        id: 'e1111111-1111-1111-1111-111111111111',
        steps: [step({ due_at: '2026-09-04T15:00:00.000Z' })],
      })
      return { ...s, next_step: s.steps[0]! }
    })(),
  ]

  it.each(SEQUENCE_BUCKETS)('le compteur « %s » EST le nombre de lignes que son filtre garde', bucket => {
    // La garde du défaut « compteur juste, filtre faux » : elle ne vérifie pas
    // un nombre, elle vérifie l'ÉGALITÉ des deux chemins.
    expect(filterByBucket(corpus, bucket, NOW)).toHaveLength(bucketCounts(corpus, NOW)[bucket])
  })

  it('la garde LIT quelque chose : le corpus produit des seaux non vides', () => {
    // Sans ce test, un corpus vide ferait passer les quatre égalités ci-dessus
    // au vert sur 0 === 0.
    const counts = bucketCounts(corpus, NOW)
    expect(counts.active).toBeGreaterThan(0)
    expect(counts.dueToday).toBeGreaterThan(0)
    expect(counts.replied).toBeGreaterThan(0)
    expect(counts.blocked).toBeGreaterThan(0)
  })

  it('sans filtre, la liste entière — un filtre qui refuse tout ne protège rien', () => {
    expect(filterByBucket(corpus, null, NOW)).toHaveLength(corpus.length)
  })
})

describe('progressOf', () => {
  it('compte les étapes JOUÉES, skippées comprises — une réponse les a coupées, elles ne reviendront pas', () => {
    const s = sequence({
      steps: [
        step({ id: 'a1111111-1111-1111-1111-111111111111', status: 'done' }),
        step({ id: 'b1111111-1111-1111-1111-111111111111', status: 'skipped' }),
        step({ id: 'c1111111-1111-1111-1111-111111111111', status: 'pending' }),
        step({ id: 'd1111111-1111-1111-1111-111111111111', status: 'pending' }),
      ],
    })
    expect(progressOf(s)).toEqual({ done: 2, total: 4 })
  })
})

/**
 * #2877 (recette prod 02/10, défaut vu en passant) — « Bloqués 6 » dans le
 * centre d'approbation et « Bloquées 0 » dans la carte juste dessous : deux
 * définitions de « bloqué ». UNE source : un message bloqué du centre
 * d'approbation bloque la séquence de son contact.
 */
describe('seau « bloquées » — une seule source avec le centre d’approbation (#2877)', () => {
  const blockedContact = '44444444-4444-4444-4444-444444444444'

  it('une séquence qui court dont le contact a un message bloqué tombe dans « bloquées »', () => {
    const running = sequence()
    expect(bucketsOf(running, NOW)).not.toContain('blocked')
    expect(bucketsOf(running, NOW, new Set([blockedContact]))).toContain('blocked')
  })

  it('le compteur et le filtre restent le même prédicat', () => {
    const rows = [
      sequence(),
      sequence({ id: '66666666-6666-6666-6666-666666666666', contact_id: '77777777-7777-7777-7777-777777777777' }),
    ]
    const blocked = new Set([blockedContact])
    expect(bucketCounts(rows, NOW, blocked).blocked).toBe(1)
    expect(filterByBucket(rows, 'blocked', NOW, blocked)).toHaveLength(1)
  })

  it('un message bloqué ne bloque pas une séquence déjà arrêtée', () => {
    const stopped = sequence({ status: 'cancelled' })
    expect(bucketsOf(stopped, NOW, new Set([blockedContact]))).not.toContain('blocked')
  })
})
