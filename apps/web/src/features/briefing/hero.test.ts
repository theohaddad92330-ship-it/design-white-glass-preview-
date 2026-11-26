import type { DailyBriefing } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { briefingHeroGesture, briefingHeroSegments, briefingWorstSurfaceState } from './hero'

/**
 * #2387.13 — l'ÉTAT VIDE du cockpit « Aujourd'hui » : quand rien n'est
 * connecté, l'écran doit NOMMER le geste le plus utile, jamais afficher des
 * compteurs à zéro (GA-18 / GA-19). La 25/09 avait cherché cette règle sous un
 * fichier `EmptyState` et conclu « écran absent » — elle vit en fait ici
 * (`hero.ts` → `BriefingHero.tsx`), sans aucun test dédié jusqu'à ce lot.
 */

function payload(over: Partial<DailyBriefing> = {}): DailyBriefing {
  return {
    date: '2026-09-25',
    timeZone: 'Europe/Paris',
    firstName: 'Louis',
    agenda: { state: 'ready', reason: null, readAt: null, events: [], conflicts: [], needsPreparation: [] },
    mail: { state: 'ready', reason: null, readAt: null, awaitingReply: [], positiveReplies: [], unread: [] },
    tasks: { state: 'ready', reason: null, readAt: null, tasks: [], overdueCount: 0, todayCount: 0 },
    accountsToWatch: [],
    actions: [],
    generatedAt: new Date().toISOString(),
    ...over,
  } as unknown as DailyBriefing
}

const NOT_CONNECTED = { state: 'not_connected', reason: null, readAt: null } as const

describe('briefingHeroSegments — jamais un compte à zéro', () => {
  it('ne rend AUCUN segment quand les trois sources sont vides (espace neuf)', () => {
    expect(briefingHeroSegments(payload())).toEqual([])
  })

  it('rend un segment seulement pour un compte strictement positif', () => {
    const data = payload({
      actions: [{ id: 'a1' }] as DailyBriefing['actions'],
      agenda: {
        state: 'ready',
        reason: null,
        readAt: null,
        events: [{ id: 'e1' } as never],
        conflicts: [],
        needsPreparation: [],
      },
    })
    const keys = briefingHeroSegments(data).map(segment => segment.key)
    // #3470 — les priorités sont dites par le sous-titre, jamais un segment.
    expect(keys).not.toContain('priorities')
    expect(keys).toContain('meetings')
    expect(keys).not.toContain('replies')
    expect(keys).not.toContain('followUps')
  })

  it('ne compte pas une source non servie, même si un compte y traînerait à zéro', () => {
    const data = payload({ mail: { ...NOT_CONNECTED, awaitingReply: [], positiveReplies: [], unread: [] } })
    expect(briefingHeroSegments(data).map(s => s.key)).not.toContain('followUps')
  })
})

describe('briefingWorstSurfaceState — l’état qui décide du geste de réparation', () => {
  it('rend `ready_with_data` quand les trois sources ont RÉELLEMENT quelque chose (pas de repli inventé)', () => {
    const data = payload({
      agenda: {
        state: 'ready',
        reason: null,
        readAt: null,
        events: [{ id: 'e1' } as never],
        conflicts: [],
        needsPreparation: [],
      },
      mail: {
        state: 'ready',
        reason: null,
        readAt: null,
        awaitingReply: [{ id: 'm1' } as never],
        positiveReplies: [],
        unread: [],
      },
      tasks: {
        state: 'ready',
        reason: null,
        readAt: null,
        tasks: [{ id: 't1' } as never],
        overdueCount: 0,
        todayCount: 0,
      },
    })
    expect(briefingWorstSurfaceState(data)).toBe('ready_with_data')
  })

  it('rend `ready_empty` — jamais `ready_with_data` — quand les sources répondent sans rien porter', () => {
    // C'est la distinction exacte que #2387.13 demande : une source SERVIE
    // mais VIDE n'est pas la même chose qu'une donnée réelle. `ready_empty`
    // porte le bon avis (« journée calme », pas « rien à montrer »).
    expect(briefingWorstSurfaceState(payload())).toBe('ready_empty')
  })

  it('rend `not_connected` dès qu’UNE source ne l’est pas — même si les deux autres le sont', () => {
    const data = payload({ mail: { ...NOT_CONNECTED, awaitingReply: [], positiveReplies: [], unread: [] } })
    expect(briefingWorstSurfaceState(data)).toBe('not_connected')
  })

  it('un espace totalement neuf (rien de connecté) rend le pire état, pas `ready_empty`', () => {
    const data = payload({
      agenda: { ...NOT_CONNECTED, events: [], conflicts: [], needsPreparation: [] },
      mail: { ...NOT_CONNECTED, awaitingReply: [], positiveReplies: [], unread: [] },
      tasks: { ...NOT_CONNECTED, tasks: [], overdueCount: 0, todayCount: 0 },
    })
    expect(briefingWorstSurfaceState(data)).toBe('not_connected')
  })
})

describe('briefingHeroGesture — le geste nommé, jamais un bouton qui n’atterrit nulle part', () => {
  it('propose `connect` (→ /integrations) pour une source non branchée', () => {
    const gesture = briefingHeroGesture('not_connected')
    expect(gesture).toEqual({ gesture: 'connect', to: '/integrations' })
  })

  it('ne rend RIEN pour `ready_with_data` — la page parle d’elle-même', () => {
    expect(briefingHeroGesture('ready_with_data')).toBeNull()
  })
})

// F2-FIX — « N réponses à traiter » est UNE mesure : /briefing et /mailbox la lisent par la même règle.
describe('F2-FIX — réponses à traiter : une seule règle pour /briefing et /mailbox', () => {
  it('SAIT DIRE NON : des non-lus ne sont PAS des réponses à traiter (11 au lieu de 2 en recette prod du 20/10)', () => {
    const data = payload({
      mail: {
        state: 'ready',
        reason: null,
        readAt: null,
        awaitingReply: [],
        positiveReplies: [{ threadId: 'p1' } as never, { threadId: 'p2' } as never],
        unread: Array.from({ length: 9 }, (_, index) => ({ threadId: `u${index}` }) as never),
      },
    })
    const replies = briefingHeroSegments(data).find(segment => segment.key === 'replies')
    expect(replies?.count).toBe(2)
  })

  it('les deux en-têtes appellent la MÊME fonction du contrat', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const file of ['hero.ts', '../mailbox/hero.ts']) {
      expect(readFileSync(join(__dirname, file), 'utf8'), file).toContain('countRepliesToTreat(')
    }
    const mailboxPage = readFileSync(join(__dirname, '../mailbox/view/MailboxPage.tsx'), 'utf8')
    expect(mailboxPage).toContain('REPLIES_TO_TREAT_REQUEST')
  })
})
