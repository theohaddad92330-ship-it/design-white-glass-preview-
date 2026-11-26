import type { ActivitySyncResult } from '@bellum/contracts'
import { INTERACTION_ACTIVITY_KINDS, type Activity, type ActivityKind } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  connectorAbsent,
  excerpt,
  formatDuration,
  collapseRepeatedReads,
  groupByDay,
  localDayKey,
  matchesCategory,
  matchesSearch,
  relationState,
  splitUpcoming,
  visibleSlice,
} from './timeline'

function activity(occurredAt: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id: occurredAt,
    kind: 'email',
    source: 'mailbox',
    direction: 'outbound',
    subject: null,
    body: null,
    bodyTruncated: false,
    bodyRedacted: false,
    occurredAt,
    durationSeconds: null,
    accountId: null,
    contactId: null,
    projectId: null,
    linkReason: null,
    userId: null,
    authorName: null,
    participants: [],
    externalId: null,
    externalUrl: null,
    createdAt: occurredAt,
    ...overrides,
  }
}

describe('localDayKey', () => {
  it('groupe dans le fuseau du LECTEUR, pas en UTC', () => {
    // Un message de 23 h 40 heure de Paris (21 h 40 UTC en été) appartient à
    // AUJOURD'HUI pour son lecteur. Grouper sur la chaîne ISO le pousserait au
    // lendemain seulement si le décalage l'y emmène — d'où la comparaison avec
    // ce que le navigateur du lecteur calcule lui-même.
    const iso = '2026-08-17T21:40:00.000Z'
    const expected = new Date(iso)
    const key = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-${String(expected.getDate()).padStart(2, '0')}`
    expect(localDayKey(iso)).toBe(key)
  })
})

describe('groupByDay', () => {
  it('range du plus récent au plus ancien, même sur une entrée désordonnée', () => {
    // Une saisie rétroactive arrive après coup : un fil qui saute d'un jour à
    // l'autre est illisible.
    const days = groupByDay([
      activity('2026-08-10T09:00:00.000Z'),
      activity('2026-08-15T09:00:00.000Z'),
      activity('2026-08-12T09:00:00.000Z'),
    ])
    expect(days).toHaveLength(3)
    expect(new Date(days[0]!.activities[0]!.occurredAt).getTime()).toBeGreaterThan(
      new Date(days[2]!.activities[0]!.occurredAt).getTime(),
    )
  })

  it('réunit deux activités du même jour sous une seule entête', () => {
    const days = groupByDay([activity('2026-08-15T09:00:00.000Z'), activity('2026-08-15T17:00:00.000Z')])
    expect(days).toHaveLength(1)
    expect(days[0]!.activities).toHaveLength(2)
  })

  it('ne casse pas sur une liste vide', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('relationState', () => {
  it('distingue « rien du tout » de « silencieux depuis longtemps »', () => {
    expect(relationState({ total: 0, awaitingReply: false, daysSinceLastActivity: null })).toBe('empty')
    expect(relationState({ total: 4, awaitingReply: false, daysSinceLastActivity: 90 })).toBe('silent')
  })

  it('« en attente » l’emporte sur l’ancienneté — la balle est dans leur camp', () => {
    expect(relationState({ total: 4, awaitingReply: true, daysSinceLastActivity: 90 })).toBe('awaiting')
  })

  it('« ils ont répondu » quand l’échange est récent et sans attente', () => {
    expect(relationState({ total: 4, awaitingReply: false, daysSinceLastActivity: 3 })).toBe('answered')
  })
})

describe('formatDuration', () => {
  it('rend null plutôt que « 0 min » sur une durée inconnue', () => {
    // « 0 min » se lirait comme un appel qui n'a pas duré ; le fournisseur n'a
    // simplement rien dit.
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(0)).toBeNull()
  })

  it('abrège les minutes et les heures', () => {
    expect(formatDuration(840)).toBe('14 min')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(5400)).toBe('1 h 30')
  })
})

describe('excerpt', () => {
  it('coupe sur un MOT', () => {
    const long = `${'mot '.repeat(80)}fin`
    const cut = excerpt(long, 50)
    expect(cut?.endsWith('…')).toBe(true)
    expect(cut).not.toMatch(/mo…$/)
  })

  it('aplatit les sauts de ligne — un extrait tient sur une ligne', () => {
    expect(excerpt('Bonjour,\n\nComme convenu')).toBe('Bonjour, Comme convenu')
  })

  it('rend null sur un corps absent ou blanc', () => {
    expect(excerpt(null)).toBeNull()
    expect(excerpt('   \n  ')).toBeNull()
  })

  it('laisse un corps court intact, sans points de suspension', () => {
    expect(excerpt('Court')).toBe('Court')
  })
})

/**
 * #2124.59 — les CATÉGORIES de la timeline.
 *
 * Le test vérifie ce qu'un filtre doit savoir faire : laisser passer, et
 * REFUSER. Une catégorie qui laisse tout passer n'est pas un filtre.
 */
describe('matchesCategory (#2124.59)', () => {
  const line = (over: { kind?: ActivityKind; projectId?: string | null; direction?: Activity['direction'] } = {}) => ({
    kind: (over.kind ?? 'email') as ActivityKind,
    projectId: over.projectId ?? null,
    direction: over.direction ?? ('outbound' as const),
  })

  it('« Tout » ne masque rien, y compris une note qui n’a pas de catégorie', () => {
    expect(matchesCategory(line({ kind: 'note' }), 'all')).toBe(true)
  })

  it('« Interactions » réutilise la liste des ÉCHANGES, et refuse le reste', () => {
    for (const kind of INTERACTION_ACTIVITY_KINDS) {
      expect(matchesCategory(line({ kind }), 'interactions')).toBe(true)
    }
    // Une analyse lancée n'est pas un échange avec quelqu'un.
    expect(matchesCategory(line({ kind: 'analysis' }), 'interactions')).toBe(false)
    expect(matchesCategory(line({ kind: 'note' }), 'interactions')).toBe(false)
  })

  it('« Actions » porte aussi les DÉCISIONS tranchées, et refuse un e-mail', () => {
    expect(matchesCategory(line({ kind: 'task' }), 'actions')).toBe(true)
    expect(matchesCategory(line({ kind: 'gate_decision' }), 'actions')).toBe(true)
    expect(matchesCategory(line({ kind: 'email' }), 'actions')).toBe(false)
  })

  it('« Projets » se lit sur le RATTACHEMENT, jamais sur la nature', () => {
    expect(matchesCategory(line({ kind: 'email', projectId: 'p-1' }), 'projects')).toBe(true)
    expect(matchesCategory(line({ kind: 'email', projectId: null }), 'projects')).toBe(false)
  })

  it('« Analyses » ne retient que les analyses', () => {
    expect(matchesCategory(line({ kind: 'analysis' }), 'analyses')).toBe(true)
    expect(matchesCategory(line({ kind: 'workflow' }), 'analyses')).toBe(false)
  })
})

describe('#3688.7 — le fil client ne mélange pas les registres', () => {
  const line = (kind: ActivityKind, direction: Activity['direction'] = 'outbound') => ({
    kind,
    projectId: null,
    direction,
  })

  it('« Interactions » REFUSE une réunion interne : elle a eu lieu, ce n’est pas un échange client', () => {
    expect(matchesCategory(line('meeting', 'internal'), 'interactions')).toBe(false)
    expect(matchesCategory(line('meeting', 'outbound'), 'interactions')).toBe(true)
  })

  it('« Relation client » = échanges + notes, hors interne, hors opérations Bellum', () => {
    expect(matchesCategory(line('email', 'inbound'), 'client')).toBe(true)
    expect(matchesCategory(line('note'), 'client')).toBe(true)
    expect(matchesCategory(line('meeting', 'internal'), 'client')).toBe(false)
    for (const kind of ['crm_lookup', 'analysis', 'workflow', 'stage_change', 'gate_decision', 'task'] as const) {
      expect(matchesCategory(line(kind), 'client')).toBe(false)
    }
  })

  it('« Interne » ne retient que ce qui est interne', () => {
    expect(matchesCategory(line('meeting', 'internal'), 'internal')).toBe(true)
    expect(matchesCategory(line('email', 'outbound'), 'internal')).toBe(false)
  })
})

describe('splitUpcoming (#3688.6/.7 — planifié ≠ tenu)', () => {
  const now = new Date('2026-10-06T12:00:00.000Z')

  it('sépare le futur du passé, le futur du plus proche au plus lointain', () => {
    const past = activity('2026-10-01T09:00:00.000Z')
    const soon = activity('2026-10-08T09:00:00.000Z', { kind: 'meeting' })
    const later = activity('2026-10-20T09:00:00.000Z', { kind: 'meeting' })
    const { upcoming, past: done } = splitUpcoming([later, past, soon], now)
    expect(upcoming.map(item => item.occurredAt)).toEqual([soon.occurredAt, later.occurredAt])
    expect(done).toEqual([past])
  })

  it('une date illisible reste dans le passé : on ne la promet pas « à venir »', () => {
    const broken = activity('pas une date')
    expect(splitUpcoming([broken], now).past).toEqual([broken])
  })
})

describe('matchesSearch (#3688.10)', () => {
  const base = activity('2026-10-01T09:00:00.000Z', {
    subject: 'Deux profils conformité',
    body: 'Disponibles début septembre',
    authorName: 'Camille Roux',
  })

  it('cherche dans l’objet, le contenu et l’auteur, sans tenir compte des accents ni de la casse', () => {
    expect(matchesSearch(base, 'CONFORMITE')).toBe(true)
    expect(matchesSearch(base, 'septembre')).toBe(true)
    expect(matchesSearch(base, 'camille')).toBe(true)
  })

  it('refuse ce qui ne s’y trouve pas ; une recherche vide ne masque rien', () => {
    expect(matchesSearch(base, 'budget')).toBe(false)
    expect(matchesSearch(base, '   ')).toBe(true)
  })

  it('ne lit pas un corps réservé à son auteur (D65)', () => {
    const redacted = activity('2026-10-01T09:00:00.000Z', { body: 'secret', bodyRedacted: true, subject: 'Point' })
    expect(matchesSearch(redacted, 'secret')).toBe(false)
    expect(matchesSearch(redacted, 'point')).toBe(true)
  })
})

describe('visibleSlice (#3688 — chargement progressif)', () => {
  const days = (counts: number[]) =>
    counts.map((count, index) => ({
      day: `2026-10-0${index + 1}`,
      activities: Array.from({ length: count }, (_, i) => activity(`2026-10-0${index + 1}T0${i}:00:00.000Z`)),
    }))

  it('coupe sur le nombre de lignes, jamais au milieu d’une ligne, et dit combien restent', () => {
    const { days: shown, hidden } = visibleSlice(days([3, 3, 3]), 5)
    expect(shown.map(day => day.activities.length)).toEqual([3, 2])
    expect(hidden).toBe(4)
  })

  it('rend tout, sans reste, quand la limite n’est pas atteinte', () => {
    const { days: shown, hidden } = visibleSlice(days([2, 2]), 10)
    expect(shown).toHaveLength(2)
    expect(hidden).toBe(0)
  })
})

describe('connectorAbsent (#2126.6)', () => {
  const source = (
    over: Partial<ActivitySyncResult['sources'][number]> = {},
  ): ActivitySyncResult['sources'][number] => ({
    source: 'mailbox',
    ingested: 0,
    duplicates: 0,
    skipped: [],
    unavailable: 'Aucune messagerie connectée, ou lecture non autorisée',
    reason: 'not_connected',
    ...over,
  })

  it('dit oui quand AUCUNE source n’est branchée', () => {
    const result: ActivitySyncResult = {
      sources: [source({ source: 'mailbox' }), source({ source: 'agenda' }), source({ source: 'telephony' })],
      ingested: 0,
    }
    expect(connectorAbsent(result)).toBe(true)
  })

  it('dit non si UNE seule source est branchée, même silencieuse', () => {
    const result: ActivitySyncResult = {
      sources: [
        source({ source: 'mailbox', reason: null, unavailable: null }),
        source({ source: 'agenda' }),
        source({ source: 'telephony' }),
      ],
      ingested: 0,
    }
    expect(connectorAbsent(result)).toBe(false)
  })

  it('dit non si une source est EN PANNE — ce n’est pas la même réparation', () => {
    const result: ActivitySyncResult = {
      sources: [
        source({ source: 'mailbox' }),
        source({ source: 'agenda', reason: 'error', unavailable: 'Graph 503' }),
        source({ source: 'telephony' }),
      ],
      ingested: 0,
    }
    expect(connectorAbsent(result)).toBe(false)
  })

  it('dit non sur une liste de sources vide', () => {
    expect(connectorAbsent({ sources: [] })).toBe(false)
  })
})

describe('collapseRepeatedReads — #3505', () => {
  const lookup = (at: string, over: Partial<Activity> = {}) => activity(at, { kind: 'crm_lookup', ...over })

  it('regroupe douze consultations identiques en UNE ligne qui porte le compte et la plus récente', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      lookup(`2026-09-30T${String(20 - i).padStart(2, '0')}:00:00.000Z`),
    )
    const entries = collapseRepeatedReads(rows)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.count).toBe(12)
    expect(entries[0]!.activity.occurredAt).toBe(rows[0]!.occurredAt)
  })

  it('NE regroupe PAS ce qui diffère (autre contact, autre auteur) ni un événement qui n’est pas une lecture', () => {
    const entries = collapseRepeatedReads([
      lookup('2026-09-30T10:00:00.000Z'),
      lookup('2026-09-30T09:00:00.000Z', { contactId: 'c-2' }),
      lookup('2026-09-30T08:00:00.000Z', { userId: 'u-2' }),
      activity('2026-09-30T07:00:00.000Z'),
      activity('2026-09-30T06:00:00.000Z'),
    ])
    expect(entries.map(entry => entry.count)).toEqual([1, 1, 1, 1, 1])
  })
})
