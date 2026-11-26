import { beforeEach, describe, expect, it } from 'vitest'
import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'
import { dismissResume, pickResumeCandidate, readDismissedResumes } from './home-resume'

const thread = (over: Partial<AgentChatHistoryItem>): AgentChatHistoryItem =>
  ({
    id: 't1',
    account_id: null,
    conversation_id: 'c1',
    title: 'Préparer le rendez-vous SNCF',
    created_at: '2026-10-01T08:00:00Z',
    ...over,
  }) as AgentChatHistoryItem

const NONE = new Set<string>()
const RUNNING = new Set(['c1', 'ca', 'cb', 'conv-9'])

describe('pickResumeCandidate (#3773.4)', () => {
  it('rend la conversation la plus récemment active — last_message_at prime sur created_at', () => {
    const picked = pickResumeCandidate(
      [
        thread({
          id: 'a',
          conversation_id: 'ca',
          created_at: '2026-10-05T08:00:00Z',
          last_message_at: '2026-10-05T09:00:00Z',
        }),
        thread({
          id: 'b',
          conversation_id: 'cb',
          created_at: '2026-09-01T08:00:00Z',
          last_message_at: '2026-10-06T07:00:00Z',
        }),
      ],
      { activeConversationId: null, dismissed: NONE, running: RUNNING },
    )
    expect(picked?.id).toBe('b')
  })

  it('sans fil reprenable, rend null — aucune carte vide', () => {
    expect(pickResumeCandidate([], { activeConversationId: null, dismissed: NONE, running: RUNNING })).toBeNull()
    expect(pickResumeCandidate(null, { activeConversationId: null, dismissed: NONE, running: RUNNING })).toBeNull()
    expect(pickResumeCandidate(undefined, { activeConversationId: null, dismissed: NONE, running: RUNNING })).toBeNull()
  })

  it('ignore un fil sans titre lisible — jamais une ligne vide', () => {
    expect(
      pickResumeCandidate([thread({ title: '   ' })], {
        activeConversationId: null,
        dismissed: NONE,
        running: RUNNING,
      }),
    ).toBeNull()
  })

  it('ne propose pas le fil déjà ouvert', () => {
    expect(
      pickResumeCandidate([thread({ conversation_id: 'c1' })], {
        activeConversationId: 'c1',
        dismissed: NONE,
        running: RUNNING,
      }),
    ).toBeNull()
  })

  it('ne repropose pas un fil écarté, et passe au suivant', () => {
    const picked = pickResumeCandidate(
      [thread({ id: 'a', last_message_at: '2026-10-06T09:00:00Z' }), thread({ id: 'b', conversation_id: 'cb' })],
      { activeConversationId: null, dismissed: new Set(['a']), running: RUNNING },
    )
    expect(picked?.id).toBe('b')
  })

  it('porte les identifiants du fil, pour que le clic retrouve LE BON objet (compte + conversation)', () => {
    const picked = pickResumeCandidate([thread({ account_id: 'acc-9', conversation_id: 'conv-9' })], {
      activeConversationId: null,
      dismissed: NONE,
      running: RUNNING,
    })
    expect(picked).toMatchObject({ account_id: 'acc-9', conversation_id: 'conv-9' })
  })
})

describe('pickResumeCandidate — seul un tour réellement en cours se reprend (R2 #4962)', () => {
  it('une conversation terminée (aucun tour en cours) n’est jamais proposée', () => {
    expect(
      pickResumeCandidate([thread({ conversation_id: 'c1' })], {
        activeConversationId: null,
        dismissed: NONE,
        running: new Set(),
      }),
    ).toBeNull()
  })

  it('propose le fil dont le tour tourne, pas le plus récent des terminés', () => {
    const picked = pickResumeCandidate(
      [
        thread({ id: 'fini', conversation_id: 'cf', last_message_at: '2026-10-09T09:00:00Z' }),
        thread({ id: 'encours', conversation_id: 'cb', last_message_at: '2026-10-01T09:00:00Z' }),
      ],
      { activeConversationId: null, dismissed: NONE, running: new Set(['cb']) },
    )
    expect(picked?.id).toBe('encours')
  })
})

describe('les reprises écartées', () => {
  beforeEach(() => window.localStorage.clear())

  it('survivent au rechargement de l’écran', () => {
    dismissResume('t1')
    dismissResume('t2')
    expect([...readDismissedResumes()].sort()).toEqual(['t1', 't2'])
  })

  it('un stockage corrompu ne casse pas l’accueil', () => {
    window.localStorage.setItem('bellum:chat:resume-dismissed', '{pas du json')
    expect(readDismissedResumes().size).toBe(0)
  })
})
