import { mailDraftHasProof } from '@bellum/contracts'
import { demoBriefing, demoMailboxStatus, demoMailDraft, demoMailReplyDraft, demoMailSearch } from './demo-briefing'
import { DEMO_DELIVERY_CLIENT } from './demo-dataset'

// Décision Louis 04/10/2026 — le rendez-vous de livraison invite une VRAIE personne
// du brief SNCF (coordonnées en clair) : seules ces adresses-là, semées, sortent du `.example`.
const DELIVERY_REAL_ADDRESSES = new Set(
  DEMO_DELIVERY_CLIENT.contacts.map(contact => contact.email).filter((email): email is string => Boolean(email)),
)

/**
 * La règle de parité démo veut qu'une fonctionnalité livrée soit AUSSI remplie
 * en démonstration. Ces tests vérifient les deux moitiés de la promesse : que
 * les écrans montrent quelque chose, et que ce quelque chose est visiblement
 * fictif.
 */
describe('démo — brief du jour et messagerie', () => {
  const NOW = new Date('2026-08-03T07:00:00Z')

  it('n’expose que des adresses du domaine réservé `.example`', () => {
    // RFC 2606 : `.example` n'est attribuable à personne. Aucune adresse
    // produite ici ne peut atteindre une vraie boîte.
    const briefing = demoBriefing({ now: NOW, timeZone: 'Europe/Paris', firstName: 'Théo', accounts: [] })
    const addresses = [
      ...briefing.agenda.events.flatMap(event => [event.organizer, ...event.attendees.map(a => a.email)]),
      ...briefing.mail.awaitingReply.map(thread => thread.counterpart),
      ...briefing.mail.unread.map(thread => thread.counterpart),
      demoMailboxStatus().address,
    ].filter((value): value is string => Boolean(value))

    expect(addresses.length).toBeGreaterThan(0)
    for (const address of addresses)
      expect(address.endsWith('.example') || DELIVERY_REAL_ADDRESSES.has(address)).toBe(true)
  })

  it('date les rendez-vous à partir de la visite, pas d’un jour figé', () => {
    // Un jeu figé afficherait « rendez-vous du 3 août » à un prospect de
    // novembre — pire qu'un écran vide.
    const briefing = demoBriefing({ now: NOW, timeZone: 'Europe/Paris', firstName: null, accounts: [] })
    for (const event of briefing.agenda.events) {
      expect(Date.parse(event.start ?? '')).toBeGreaterThan(NOW.getTime())
    }
  })

  it('montre un conflit d’agenda : c’est une des mécaniques à démontrer', () => {
    const briefing = demoBriefing({ now: NOW, timeZone: 'Europe/Paris', firstName: null, accounts: [] })
    expect(briefing.agenda.conflicts).toHaveLength(1)
  })

  // #2107.28 — la salle de démonstration doit AUSSI dire ce qui a bougé, pas
  // seulement le nom du compte : c'est ce qu'un prospect voit du produit.
  it('dit ce qui a bougé sur chaque compte à suivre, jamais seulement le nom (#2107.28)', () => {
    const briefing = demoBriefing({
      now: NOW,
      timeZone: 'Europe/Paris',
      firstName: 'Théo',
      accounts: [
        { accountId: 'acc-1', companyName: 'Société Générale', website: null },
        { accountId: 'acc-2', companyName: 'Groupe BPCE', website: null },
      ],
    })
    expect(briefing.accountsToWatch.length).toBeGreaterThan(0)
    for (const account of briefing.accountsToWatch) {
      expect(typeof account.signalLabel).toBe('string')
      expect(account.signalLabel?.length).toBeGreaterThan(0)
    }
  })

  // #2107.33 — même parité : « la raison pour laquelle cela concerne cette
  // ESN » doit AUSSI se voir en salle de démonstration.
  it('dit la raison ESN de chaque signal montré, jamais seulement le compte (#2107.33)', () => {
    const briefing = demoBriefing({
      now: NOW,
      timeZone: 'Europe/Paris',
      firstName: 'Théo',
      accounts: [
        { accountId: 'acc-1', companyName: 'Société Générale', website: null },
        { accountId: 'acc-2', companyName: 'Groupe BPCE', website: null },
      ],
    })
    expect(briefing.accountsToWatch.length).toBeGreaterThan(0)
    for (const account of briefing.accountsToWatch) {
      expect(typeof account.esnReason).toBe('string')
      expect(account.esnReason?.length).toBeGreaterThan(0)
    }
  })

  // #4068.6 — l'historique daté du compte se voit AUSSI en salle de démonstration (craft rule n°9).
  it('montre l’historique daté et typé de chaque compte, jamais sa provenance (#4068.6)', () => {
    const briefing = demoBriefing({
      now: NOW,
      timeZone: 'Europe/Paris',
      firstName: 'Théo',
      accounts: [
        { accountId: 'acc-1', companyName: 'Société Générale', website: null },
        { accountId: 'acc-2', companyName: 'Groupe BPCE', website: null },
      ],
    })
    expect(briefing.accountsToWatch.length).toBeGreaterThan(0)
    for (const account of briefing.accountsToWatch) {
      expect(account.history.length).toBeGreaterThan(0)
      for (const fact of account.history) {
        expect(fact.date).toMatch(/^\d{4}-\d{2}-\d{2}/)
        expect(new Date(fact.date).getTime()).toBeLessThan(NOW.getTime())
        expect(fact.label).toMatch(/\(démo\)/)
      }
    }
    expect(JSON.stringify(briefing.accountsToWatch)).not.toMatch(/hubspot|salesforce|dataforge|bodacc/i)
  })

  it('laisse le tri des actions au produit, pas au jeu de démo', () => {
    // `actions` part vide : le service les recalcule avec le MÊME trieur que le
    // vrai brief. Une démo qui scripterait le classement montrerait un
    // comportement que le produit ne sait pas reproduire.
    const briefing = demoBriefing({ now: NOW, timeZone: 'Europe/Paris', firstName: null, accounts: [] })
    expect(briefing.actions).toEqual([])
  })

  it('annonce une boîte visiblement fictive', () => {
    expect(demoMailboxStatus().address).toBe('demo@bellum.example')
    // Rien ne part d'une salle de démo : l'envoi reste fermé.
    expect(demoMailboxStatus().capabilities.send).toBe(false)
  })

  it('la recherche par intention filtre réellement le jeu', () => {
    // Si tous les onglets rendaient la même liste, la démo contredirait la
    // fonctionnalité qu'elle est censée montrer.
    const awaiting = demoMailSearch('no_reply', NOW).threads
    const unread = demoMailSearch('unread', NOW).threads
    expect(awaiting.length).toBeGreaterThan(0)
    expect(unread.length).toBeGreaterThan(0)
    expect(awaiting.map(t => t.threadId)).not.toEqual(unread.map(t => t.threadId))
    expect(awaiting.every(thread => thread.awaitingReply)).toBe(true)
    expect(unread.every(thread => thread.unread)).toBe(true)
  })

  // X66 / #3533 — la recette prod ne pouvait pas rejouer « un fil réellement
  // sans objet » : la salle n'en portait aucun. Un fil attend une réponse SANS
  // objet (null) — l'écran ne doit afficher ni « (sans objet) » ni texte de
  // remplacement (BriefingPage.test.tsx tient le rendu).
  it('#3533 — la salle porte un fil réellement sans objet, en attente d’une réponse', () => {
    const noSubject = demoMailSearch('no_reply', NOW).threads.filter(thread => !thread.subject?.trim())
    expect(noSubject).toHaveLength(1)
    expect(noSubject[0]?.subject).toBeNull()
    expect(noSubject[0]?.counterpart).toBeTruthy()
    expect(noSubject[0]?.awaitingReply).toBe(true)
  })

  // Théo B m1.N1 — la Messagerie a quatre onglets ; « Historique » ne doit pas rester vide devant un prospect.
  it('la salle porte un échange déjà traité, retrouvé par l’intention libre', () => {
    const treated = demoMailSearch('free', NOW).threads.filter(thread => thread.state === 'treated')
    expect(treated.length).toBeGreaterThan(0)
  })

  // Refonte Théo B m1 — la salle ressemble à la page appliquée : chaque fil dit la raison de son rang, les fils
  // scriptés se lisent dans le volet, et « À venir » porte un échange reporté.
  it('chaque fil porte la raison de son rang ; les fils scriptés portent leurs messages', () => {
    const all = demoMailSearch('free', NOW).threads
    expect(all.every(thread => typeof thread.priorityReason === 'string' && thread.priorityLevel)).toBe(true)
    const scripted = all.find(thread => thread.threadId === 'demo-thread-verdal-proposal')
    expect(scripted?.messages?.length).toBeGreaterThan(0)
    expect(scripted?.messages?.every(message => message.snippet)).toBe(true)
    expect(all.find(thread => thread.threadId === 'demo-thread-verdal-positive')?.priorityReason).toBe('positive_reply')
  })

  it('la salle porte un échange reporté, à une date future', () => {
    const snoozed = demoMailSearch('free', NOW).threads.filter(thread => thread.snoozeUntil)
    expect(snoozed).toHaveLength(1)
    expect(Date.parse(snoozed[0]!.snoozeUntil!)).toBeGreaterThan(NOW.getTime())
  })

  it('dit que la requête n’a interrogé aucune messagerie réelle', () => {
    expect(demoMailSearch('budget', NOW).resolvedQuery).toContain('démonstration')
  })

  it('#2394.62 — le brouillon scripté passe la même preuve qu’un dépôt réel, sans lien à ouvrir', () => {
    const draft = demoMailDraft()
    expect(mailDraftHasProof(draft)).toBe(true)
    expect(draft.webUrl).toBeNull()
  })
})

// #4405.4 — « Préparer la réponse » ouvre un mail déjà rédigé : en démonstration
// aussi, pour CHAQUE fil de la boîte (craft rule n°9) — sinon le prospect clique
// sur un fil et découvre une erreur en réunion.
describe('démo — réponse pré-rédigée de chaque fil (#4405.4)', () => {
  const NOW = new Date('2026-08-03T07:00:00Z')
  const threads = demoMailSearch('free', NOW).threads

  it('la boîte de démo expose des fils', () => {
    expect(threads.length).toBeGreaterThan(0)
  })

  it.each(threads.map(item => [item.threadId, item.subject] as const))(
    'le fil %s a sa réponse scriptée',
    (threadId, subject) => {
      const reply = demoMailReplyDraft(threadId)
      expect(reply).not.toBeNull()
      expect(reply?.subject.startsWith('Re:')).toBe(true)
      if (subject) expect(reply?.subject).toBe(subject.startsWith('Re:') ? subject : `Re: ${subject}`)
      expect(reply?.body.length ?? 0).toBeGreaterThan(40)
    },
  )

  it('un fil inconnu rend null — jamais un texte inventé', () => {
    expect(demoMailReplyDraft('demo-thread-inconnu')).toBeNull()
  })
})
