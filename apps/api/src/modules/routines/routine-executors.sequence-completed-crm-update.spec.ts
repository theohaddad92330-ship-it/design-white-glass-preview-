import { RoutineExecutors } from './routine-executors'
import type { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import type { Repository } from 'typeorm'

/**
 * Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — une séquence d'outreach
 * `completed` propose une mise à jour CRM, jamais une écriture (doctrine
 * « une écriture CRM/ERP passe par une porte »). Même patron que
 * `positive_replies` : elle SIGNALE.
 */
type Row = { id: string; contact_id: string; completed_at: Date; contact_name: string | null }

function queryBuilderReturning(rows: Row[]) {
  const qb = {
    innerJoin: () => qb,
    where: () => qb,
    andWhere: () => qb,
    select: () => qb,
    addSelect: () => qb,
    orderBy: () => qb,
    getRawMany: async () => rows,
  }
  return qb
}

function executorOver(rows: Row[] | 'unavailable'): RoutineExecutors {
  const outreachSequences =
    rows === 'unavailable'
      ? undefined
      : ({ createQueryBuilder: () => queryBuilderReturning(rows) } as unknown as Repository<OutreachSequenceEntity>)
  return new RoutineExecutors(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
    undefined,
    undefined,
    outreachSequences,
  )
}

const NOW = new Date('2026-09-26T09:00:00.000Z')

describe('séquence terminée : proposition de mise à jour CRM', () => {
  it('aucun espace de travail résolu : elle se tait et le dit', async () => {
    const outcome = await executorOver([]).run('sequence_completed_crm_update', 'u1', NOW, '')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('Aucun espace de travail résolu')
  })

  it('le dépôt de séquences est indisponible : elle se tait plutôt que de planter', async () => {
    const outcome = await executorOver('unavailable').run('sequence_completed_crm_update', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toContain('ne sont pas disponibles')
  })

  it('aucune séquence terminée récemment : elle se tait, rien à dire', async () => {
    const outcome = await executorOver([]).run('sequence_completed_crm_update', 'u1', NOW, 'w1')
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).toBe('Aucune séquence terminée récemment.')
  })

  it('une séquence terminée : une occurrence PAR SÉQUENCE, jamais une notification globale (idempotence par objet)', async () => {
    const outcome = await executorOver([
      { id: 'seq-1', contact_id: 'c1', completed_at: new Date('2026-09-25T10:00:00.000Z'), contact_name: 'Léa Martin' },
    ]).run('sequence_completed_crm_update', 'u1', NOW, 'w1')

    // `notified: false` au niveau global — la doctrine « signale, n'écrit
    // rien » se tient via `items` (comme `meetingCancelled`), jamais une
    // notification unique qui masquerait l'idempotence par objet.
    expect(outcome.notified).toBe(false)
    expect(outcome.items).toHaveLength(1)
    expect(outcome.items?.[0]?.objectId).toBe('seq-1')
    expect(outcome.items?.[0]?.notification.link).toBe('/contacts/c1')
    expect(outcome.items?.[0]?.notification.body).toContain('Léa Martin')
  })

  it('un contact sans nom connu : elle le DIT plutôt que d’inventer un nom', async () => {
    const outcome = await executorOver([
      { id: 'seq-2', contact_id: 'c2', completed_at: new Date('2026-09-25T10:00:00.000Z'), contact_name: null },
    ]).run('sequence_completed_crm_update', 'u1', NOW, 'w1')
    expect(outcome.items?.[0]?.notification.body).toContain('Un contact')
    expect(outcome.items?.[0]?.notification.body).not.toContain('null')
  })
})
