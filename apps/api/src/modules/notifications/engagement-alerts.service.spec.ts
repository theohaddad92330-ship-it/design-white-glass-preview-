import { EngagementAlertsService } from './engagement-alerts.service'

/**
 * #2082.4 / .5 / .6 — les trois ÉMETTEURS, et la doctrine qui borne le
 * troisième.
 *
 * Ce que ce fichier tient :
 *  · chaque type produit une notification quand sa source a quelque chose à
 *    dire, et RIEN quand elle n'a rien ou qu'elle est muette ;
 *  · 🔴 « Réponse client » n'écrit NI l'expéditeur, NI l'objet, NI un extrait —
 *    D65 tient par ce qui ne traverse pas, pas par une convention de rédaction ;
 *  · un seul interrupteur coché ne fait lire que SA source — un balayage qui
 *    interroge la boîte de quelqu'un qui ne l'a pas demandé est une lecture de
 *    trop.
 */

const NOW = new Date('2026-09-16T06:40:00.000Z')

type Created = { type: string; title: string; body: string; link: string | null; source?: string | null }

function build(options: {
  prefs?: Record<string, unknown>[]
  missions?: { ends_on: string | null; status: string }[]
  accounts?: { workspace_id: string | null }[]
  agenda?: { listEvents: jest.Mock }
  mailbox?: { listRecentMessages: jest.Mock }
  alreadySent?: number
}) {
  const created: Created[] = []
  const notifications = {
    createNotification: jest.fn(async (_userId: string, payload: Created) => {
      created.push(payload)
    }),
    countSince: jest.fn(async () => options.alreadySent ?? 0),
  }
  const service = new EngagementAlertsService(
    { find: jest.fn(async () => options.prefs ?? []) } as never,
    { find: jest.fn(async () => options.missions ?? []) } as never,
    { find: jest.fn(async () => options.accounts ?? [{ workspace_id: 'w' }]) } as never,
    notifications as never,
    options.agenda as never,
    options.mailbox as never,
    undefined,
  )
  return { service, created, notifications }
}

describe('#2082.4 — « Rendez-vous à préparer »', () => {
  it('annonce le NOMBRE de rendez-vous de la fenêtre', async () => {
    const listEvents: jest.Mock = jest.fn(async () => [{ id: '1' }, { id: '2' }])
    const { service, created } = build({ agenda: { listEvents } })
    expect(await service.emitMeetingPrep('u', NOW)).toBe(true)
    expect(created[0]?.type).toBe('meeting_prep')
    expect(created[0]?.title).toBe('2 rendez-vous à préparer')
    // La fenêtre part de MAINTENANT : préparer se fait la veille, pas après.
    expect(listEvents).toHaveBeenCalledWith('u', expect.objectContaining({ from: NOW.toISOString() }))
  })

  it('un agenda vide n’annonce RIEN — il n’y a rien à préparer', async () => {
    const { service, created } = build({ agenda: { listEvents: jest.fn(async () => []) } })
    expect(await service.emitMeetingPrep('u', NOW)).toBe(false)
    expect(created).toEqual([])
  })

  it('un agenda NON BRANCHÉ n’annonce rien non plus — et surtout pas « 0 »', async () => {
    const listEvents = jest.fn(async () => {
      throw new Error('aucun agenda connecté')
    })
    const { service, created } = build({ agenda: { listEvents } })
    expect(await service.emitMeetingPrep('u', NOW)).toBe(false)
    expect(created).toEqual([])
  })

  it('ne répète pas dans la fenêtre d’anti-doublon', async () => {
    const { service, created } = build({ agenda: { listEvents: jest.fn(async () => [{ id: '1' }]) }, alreadySent: 1 })
    expect(await service.emitMeetingPrep('u', NOW)).toBe(false)
    expect(created).toEqual([])
  })
})

describe('#2082.5 — « Fin de mission »', () => {
  it('compte les missions VIVANTES qui se terminent dans la fenêtre', async () => {
    const { service, created } = build({
      missions: [
        { ends_on: '2026-09-30', status: 'active' },
        { ends_on: '2026-10-10', status: 'onboarding' },
        // Hors fenêtre : le renouvellement ne se joue pas encore.
        { ends_on: '2027-03-01', status: 'active' },
        // Déjà passée : ce serait annoncer le passé.
        { ends_on: '2026-01-01', status: 'active' },
        // Une date illisible n'est pas une date.
        { ends_on: 'fin d’année', status: 'active' },
        { ends_on: null, status: 'active' },
      ],
    })
    expect(await service.emitMissionEnd('u', NOW)).toBe(true)
    expect(created[0]?.type).toBe('mission_end')
    expect(created[0]?.title).toBe('2 missions arrivent à leur terme')
  })

  it('aucune mission qui se termine : aucune annonce', async () => {
    const { service, created } = build({ missions: [{ ends_on: '2027-06-01', status: 'active' }] })
    expect(await service.emitMissionEnd('u', NOW)).toBe(false)
    expect(created).toEqual([])
  })
})

describe('#2082.6 — « Réponse client » : le FAIT, jamais le contenu', () => {
  it('annonce qu’une réponse est arrivée, et rien de plus', async () => {
    const listRecentMessages = jest.fn(async () => ({
      ownAddress: 'moi@esn.fr',
      messages: [
        { from: 'client@acme.fr', date: '2026-09-16T05:00:00.000Z' },
        // Ce que la personne a elle-même envoyé n'est pas une réponse.
        { from: 'MOI@esn.fr', date: '2026-09-16T04:00:00.000Z' },
      ],
    }))
    const { service, created } = build({ mailbox: { listRecentMessages } })
    expect(await service.emitClientReply('u')).toBe(true)

    const notification = created[0]
    expect(notification?.type).toBe('client_reply')
    expect(notification?.title).toBe('Une réponse est arrivée')
    // 🔴 D65 — ni l'adresse, ni le domaine, ni un objet, ni un extrait.
    const text = `${notification?.title} ${notification?.body}`
    for (const leak of ['client@acme.fr', 'acme', '@', 'Objet', 'Re :']) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })

  // #2404.7 — D'OÙ vient l'information : la messagerie CONNECTÉE (ce que
  // l'espace a branché), jamais un de nos fournisseurs. `mailboxToolName`
  // (déjà utilisé ailleurs pour nommer l'outil branché, GA-26) traduit le
  // `provider` technique en nom lisible ('google' → 'Gmail').
  it('#2404.7 — nomme la messagerie branchée comme SOURCE', async () => {
    const listRecentMessages = jest.fn(async () => ({
      provider: 'google',
      ownAddress: 'moi@esn.fr',
      messages: [{ from: 'client@acme.fr', date: '2026-09-16T05:00:00.000Z' }],
    }))
    const { service, created } = build({ mailbox: { listRecentMessages } })
    expect(await service.emitClientReply('u')).toBe(true)
    expect(created[0]?.source).toBe('Gmail')
  })

  it('#2404.7 — un provider non nommé laisse la source `null`, jamais devinée', async () => {
    const listRecentMessages = jest.fn(async () => ({
      ownAddress: 'moi@esn.fr',
      messages: [{ from: 'client@acme.fr', date: '2026-09-16T05:00:00.000Z' }],
    }))
    const { service, created } = build({ mailbox: { listRecentMessages } })
    expect(await service.emitClientReply('u')).toBe(true)
    expect(created[0]?.source ?? null).toBeNull()
  })

  it('sans adresse connue, on se TAIT — on ne devine pas ce qui est « entrant »', async () => {
    const listRecentMessages = jest.fn(async () => ({
      ownAddress: null,
      messages: [{ from: 'client@acme.fr', date: '2026-09-16T05:00:00.000Z' }],
    }))
    const { service, created } = build({ mailbox: { listRecentMessages } })
    expect(await service.emitClientReply('u')).toBe(false)
    expect(created).toEqual([])
  })

  it('messagerie non branchée : aucune annonce', async () => {
    const { service, created } = build({ mailbox: { listRecentMessages: jest.fn(async () => null) } })
    expect(await service.emitClientReply('u')).toBe(false)
    expect(created).toEqual([])
  })
})

describe('#2082.4/.5/.6 — le balayage ne lit QUE ce qui a été coché', () => {
  it('un seul interrupteur coché ne fait ouvrir qu’une seule source', async () => {
    const listEvents = jest.fn(async () => [{ id: '1' }])
    const listRecentMessages = jest.fn(async () => null)
    const { service, created } = build({
      prefs: [{ user_id: 'u', meeting_prep: true, mission_end: false, client_reply: false }],
      agenda: { listEvents },
      mailbox: { listRecentMessages },
    })
    await service.run(NOW)
    // La messagerie n'est même pas interrogée : une lecture de boîte que
    // personne n'a demandée est une lecture de trop.
    expect(listRecentMessages).not.toHaveBeenCalled()
    expect(created.map(entry => entry.type)).toEqual(['meeting_prep'])
  })

  it('l’interrupteur d’opérateur coupe AVANT toute lecture', async () => {
    const listEvents = jest.fn(async () => [{ id: '1' }])
    const { service, created } = build({
      prefs: [{ user_id: 'u', meeting_prep: true, mission_end: true, client_reply: true }],
      agenda: { listEvents },
    })
    process.env['ENGAGEMENT_ALERTS_DISABLED'] = 'true'
    try {
      await service.run(NOW)
    } finally {
      delete process.env['ENGAGEMENT_ALERTS_DISABLED']
    }
    expect(listEvents).not.toHaveBeenCalled()
    expect(created).toEqual([])
  })
})
