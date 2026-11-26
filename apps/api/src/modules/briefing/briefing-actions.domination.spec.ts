import type { AgendaEvent, MailThread } from '@bellum/contracts'
import { buildBriefingActions } from './briefing-actions'

/**
 * #2095.68 / #2095.69 — LA DOMINATION D'ORDRE, SUR UN JEU DE DONNÉES MIXTE.
 *
 * `briefing-actions.spec.ts` et `briefing-actions.imminent.spec.ts` prouvent
 * chaque règle ISOLÉMENT (un rendez-vous imminent passe en tête ; un fil
 * favorable est distingué d'un fil qui attend). Aucun des deux ne mélangeait
 * les FAMILLES dans le MÊME appel — c'est pourtant exactement ce que #2095
 * demande : « un rendez-vous dans 30 min passe avant un signal de compte
 * récent », « une réponse favorable passe avant une relance froide ». Ce
 * fichier fait tenir les deux comme des recettes, sur un brief qui contient
 * les deux familles à la fois — la seule preuve qui répond vraiment à la
 * question posée.
 */

const NOW = new Date('2026-08-03T07:00:00Z')

function meeting(id: string, start: string): AgendaEvent {
  return {
    id,
    summary: 'Point client',
    description: null,
    location: null,
    start,
    end: null,
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
  }
}

function thread(partial: Partial<MailThread> & Pick<MailThread, 'threadId'>): MailThread {
  return {
    subject: 'Proposition',
    counterpart: 'jean@acme.com',
    lastMessageAt: '2026-07-25T09:00:00.000Z',
    lastDirection: 'outbound',
    messageCount: 2,
    awaitingReply: true,
    daysSinceLastMessage: 9,
    unread: false,
    hasAttachments: false,
    otherParticipants: [],
    ...partial,
  }
}

describe('#2095.68 — un rendez-vous imminent passe avant un signal de compte récent', () => {
  it('classe le rendez-vous EN TÊTE, le signal APRÈS, dans le même brief', () => {
    const actions = buildBriefingActions({
      now: NOW,
      meetings: [meeting('soon', '2026-08-03T07:30:00.000Z')],
      conflicts: [],
      awaitingReply: [],
      unread: [],
      positiveReplies: [],
      accountsWithFreshSignal: [
        { accountId: 'acc-1', companyName: 'Vinci', detectedAt: '2026-08-02T08:00:00.000Z', detectionExact: true },
      ],
      staleNeeds: [],
    })

    const meetingIndex = actions.findIndex(a => a.kind === 'meeting_prep')
    const accountIndex = actions.findIndex(a => a.kind === 'account')

    expect(meetingIndex).toBeGreaterThanOrEqual(0)
    expect(accountIndex).toBeGreaterThan(meetingIndex)
    expect(actions[meetingIndex]?.priority).toBeLessThan(actions[accountIndex]?.priority ?? Infinity)
  })
})

describe('#2095.69 — une réponse favorable passe avant une relance froide', () => {
  it('classe la réponse positive AVANT le fil qui attend, dans le même brief', () => {
    const actions = buildBriefingActions({
      now: NOW,
      meetings: [],
      conflicts: [],
      awaitingReply: [thread({ threadId: 'awaiting-1', counterpart: 'anne@client.fr', subject: 'Relance' })],
      unread: [],
      positiveReplies: [thread({ threadId: 'positive-1', counterpart: 'marc@prospect.fr', subject: 'Accord' })],
      accountsWithFreshSignal: [],
      staleNeeds: [],
    })

    const positiveIndex = actions.findIndex(a => a.kind === 'reply')
    const followUpIndex = actions.findIndex(a => a.kind === 'follow_up')

    expect(positiveIndex).toBeGreaterThanOrEqual(0)
    expect(followUpIndex).toBeGreaterThan(positiveIndex)
    expect(actions[positiveIndex]?.priority).toBeLessThan(actions[followUpIndex]?.priority ?? Infinity)
  })
})

describe('#2095.2 / #2095.7 — une fin de mission et un paiement en retard ne cèdent pas à des relances', () => {
  it('garde les deux même quand les relances remplissent déjà le plafond', () => {
    // MESURÉ en production le 24/09/2026 (recette #2095.2/#2095.7) :
    // `GET /briefing/today` rendait `[follow_up×5, reply, conflict]` — les
    // sept places classées (`BRIEFING_ACTIONS_MAX`) — alors qu'une mission à
    // J+7 (< `MISSION_ENDING_SOON_DAYS`=30) et trois factures échues non
    // soldées existaient bien comme candidats. Cinq relances DIFFÉRENTES
    // (un plafond par interlocuteur existe déjà, donc cinq interlocuteurs)
    // reproduisent la même forme.
    const actions = buildBriefingActions({
      now: NOW,
      meetings: [],
      conflicts: [
        {
          first: meeting('a', '2026-08-03T08:00:00.000Z'),
          second: meeting('b', '2026-08-03T08:15:00.000Z'),
          overlapMinutes: 15,
        },
      ],
      awaitingReply: Array.from({ length: 5 }, (_, index) =>
        thread({
          threadId: `follow-${index}`,
          counterpart: `contact${index}@acme.com`,
          daysSinceLastMessage: 9 + index,
        }),
      ),
      unread: [],
      positiveReplies: [thread({ threadId: 'positive-1', counterpart: 'marc@prospect.fr', subject: 'Accord' })],
      accountsWithFreshSignal: [],
      staleNeeds: [],
      missionsEnding: [{ id: 'mission-1', label: 'Industrialisation CI/CD des équipes produit', daysUntilEnd: 7 }],
      overdueInvoices: [
        { id: 'mission-2', label: 'Migration du socle applicatif', daysOverdue: 30 },
        { id: 'mission-3', label: 'Refonte du parcours client', daysOverdue: 25 },
        { id: 'mission-4', label: 'Audit sécurité annuel', daysOverdue: 20 },
      ],
    })

    expect(actions).toHaveLength(7)
    expect(actions.some(action => action.kind === 'mission_end')).toBe(true)
    expect(actions.some(action => action.kind === 'payment_overdue')).toBe(true)
    // La coupe cède la place des relances, jamais celle du conflit ou de la
    // réponse favorable : les deux gardent leur ligne.
    expect(actions.some(action => action.kind === 'conflict')).toBe(true)
    expect(actions.some(action => action.kind === 'reply')).toBe(true)
  })
})
