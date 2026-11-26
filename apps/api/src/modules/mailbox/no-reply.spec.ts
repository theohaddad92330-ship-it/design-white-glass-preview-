import type { MailMessage } from '@bellum/contracts'
import {
  groupIntoThreads,
  looksLikeAutoReply,
  looksLikeNonCommercialTravelDocument,
  normalizeAddress,
  selectAwaitingReply,
  selectPositiveReplies,
} from './no-reply'

/**
 * Le calcul le plus exposé du socle : dire à un commercial qui ne lui a pas
 * répondu. Deux erreurs symétriques à empêcher — rater un silence (le garde-fou
 * n°14 : « ne pas inventer que tout a reçu une réponse ») et, pire, faire
 * relancer un client qui attend NOTRE retour.
 */

const NOW = new Date('2026-08-03T10:00:00Z')

function message(partial: Partial<MailMessage> & Pick<MailMessage, 'id' | 'direction'>): MailMessage {
  return {
    threadId: 't1',
    subject: 'Sujet',
    from: null,
    to: [],
    cc: [],
    date: '2026-08-01T09:00:00.000Z',
    snippet: null,
    unread: false,
    hasAttachments: false,
    ...partial,
  }
}

describe('groupIntoThreads', () => {
  it('un fil dont le dernier message est sortant attend une réponse', () => {
    const threads = groupIntoThreads(
      [
        message({ id: 'a', direction: 'inbound', date: '2026-07-20T09:00:00.000Z' }),
        message({ id: 'b', direction: 'outbound', date: '2026-07-25T09:00:00.000Z', to: ['jean@acme.com'] }),
      ],
      NOW,
    )
    expect(threads).toHaveLength(1)
    expect(threads[0]?.awaitingReply).toBe(true)
    expect(threads[0]?.daysSinceLastMessage).toBe(9)
    expect(threads[0]?.counterpart).toBe('jean@acme.com')
  })

  it("un fil dont le dernier message est entrant N'attend PAS de relance", () => {
    // C'est nous qui devons répondre : relancer ici serait une faute commerciale.
    const threads = groupIntoThreads(
      [
        message({ id: 'a', direction: 'outbound', date: '2026-07-20T09:00:00.000Z' }),
        message({ id: 'b', direction: 'inbound', date: '2026-07-25T09:00:00.000Z', from: 'jean@acme.com' }),
      ],
      NOW,
    )
    expect(threads[0]?.awaitingReply).toBe(false)
  })

  it('une réponse automatique ne compte pas comme une réponse', () => {
    const threads = groupIntoThreads(
      [
        message({ id: 'a', direction: 'outbound', date: '2026-07-20T09:00:00.000Z' }),
        message({
          id: 'b',
          direction: 'inbound',
          date: '2026-07-21T09:00:00.000Z',
          subject: 'Réponse automatique : absence du bureau',
          from: 'jean@acme.com',
        }),
      ],
      NOW,
    )
    expect(threads[0]?.awaitingReply).toBe(true)
  })

  it('garde les messages sans date exploitable au lieu de les jeter', () => {
    // Les jeter ferait disparaître le fil du décompte des relances — exactement
    // le mensonge que le garde-fou n°14 interdit.
    const threads = groupIntoThreads(
      [
        message({ id: 'a', direction: 'inbound', date: null }),
        message({ id: 'b', direction: 'outbound', date: '2026-08-01T09:00:00.000Z' }),
      ],
      NOW,
    )
    expect(threads[0]?.messageCount).toBe(2)
    expect(threads[0]?.lastDirection).toBe('outbound')
  })

  it('un fil entièrement sans date reste visible, avec une ancienneté inconnue', () => {
    const threads = groupIntoThreads([message({ id: 'a', direction: 'outbound', date: null })], NOW)
    expect(threads[0]?.daysSinceLastMessage).toBeNull()
  })

  it('collecte les AUTRES participants du fil — garde-fou n°12', () => {
    // Répondre à un fil à trois en n'écrivant qu'à une personne coupe les deux
    // autres de la conversation.
    const threads = groupIntoThreads(
      [
        message({
          id: 'a',
          direction: 'outbound',
          date: '2026-08-01T09:00:00.000Z',
          from: 'moi@bellum.fr',
          to: ['jean@acme.com'],
          cc: ['Paule Martin <paule@acme.com>'],
        }),
      ],
      NOW,
    )
    // L'interlocuteur principal n'y figure pas : il est déjà en destinataire.
    expect(threads[0]?.otherParticipants).toEqual(['moi@bellum.fr', 'paule@acme.com'])
  })

  it('agrège plusieurs fils et les trie du plus récent au plus ancien', () => {
    const threads = groupIntoThreads(
      [
        message({ id: 'a', threadId: 'old', direction: 'outbound', date: '2026-06-01T09:00:00.000Z' }),
        message({ id: 'b', threadId: 'new', direction: 'outbound', date: '2026-08-02T09:00:00.000Z' }),
      ],
      NOW,
    )
    expect(threads.map(thread => thread.threadId)).toEqual(['new', 'old'])
  })
})

describe('groupIntoThreads — une relance reprise en nouveau message, pas en réponse', () => {
  // Observé en production le 30/08/2026 (compte réel, écran /mailbox) : six fils
  // au libellé STRICTEMENT identique — « Louis, toujours intéressé ? », même
  // expéditeur, dates du 24 au 29 août — présentés comme six lignes jumelles.
  // Le fournisseur (Gmail/Outlook) leur donne SIX identifiants de fil distincts
  // dès qu'une relance est composée en nouveau message plutôt qu'en réponse — ce
  // que font la plupart des outils de relance. Le calcul doit reconnaître que
  // c'est la MÊME conversation reprise, pas six conversations différentes.
  const RELANCE_NOW = new Date('2026-08-30T10:00:00Z')
  const RELANCE_SUBJECT = 'Louis, toujours intéressé ?'
  const RELANCE_COUNTERPART = 'nathan.kosmowski@esce.fr'

  function relance(day: number, id: string): MailMessage {
    return message({
      id,
      threadId: id, // un identifiant de fil NATIF distinct par message, comme un nouveau compose
      direction: 'outbound',
      subject: RELANCE_SUBJECT,
      from: 'moi@bellum.fr',
      to: [RELANCE_COUNTERPART],
      date: `2026-08-${day}T09:00:00.000Z`,
    })
  }

  it('fusionne une séquence de relances au même sujet, au même interlocuteur, dans la même fenêtre — un SEUL fil avec son compte', () => {
    const messages = [
      relance(24, 'r1'),
      relance(25, 'r2'),
      relance(26, 'r3'),
      relance(27, 'r4'),
      relance(28, 'r5'),
      relance(29, 'r6'),
    ]
    const threads = groupIntoThreads(messages, RELANCE_NOW)

    expect(threads).toHaveLength(1)
    expect(threads[0]?.messageCount).toBe(6)
    expect(threads[0]?.subject).toBe(RELANCE_SUBJECT)
    expect(threads[0]?.counterpart).toBe(RELANCE_COUNTERPART)
    expect(threads[0]?.lastMessageAt).toBe('2026-08-29T09:00:00.000Z')
  })

  it('ne fusionne PAS deux fils au même sujet et au même interlocuteur trop éloignés dans le temps', () => {
    // Un même sujet repris six mois plus tard avec la même personne est vraisemblablement
    // une AUTRE conversation, pas la suite de celle-ci.
    const messages = [
      relance(24, 'r1'),
      message({
        id: 'r-far',
        threadId: 'r-far',
        direction: 'outbound',
        subject: RELANCE_SUBJECT,
        from: 'moi@bellum.fr',
        to: [RELANCE_COUNTERPART],
        date: '2027-03-01T09:00:00.000Z',
      }),
    ]
    const threads = groupIntoThreads(messages, new Date('2027-03-02T10:00:00Z'))
    expect(threads).toHaveLength(2)
  })

  it('ne fusionne PAS deux fils au même sujet mais avec des interlocuteurs différents', () => {
    const messages = [
      relance(24, 'r1'),
      message({
        id: 'r-other',
        threadId: 'r-other',
        direction: 'outbound',
        subject: RELANCE_SUBJECT,
        from: 'moi@bellum.fr',
        to: ['une-autre-personne@example.com'],
        date: '2026-08-25T09:00:00.000Z',
      }),
    ]
    const threads = groupIntoThreads(messages, RELANCE_NOW)
    expect(threads).toHaveLength(2)
  })

  it('une relance sortante fusionnée ne peut PAS devenir une « réponse favorable » (un message qu’on a envoyé soi-même n’est pas une réponse)', () => {
    const messages = [relance(24, 'r1'), relance(25, 'r2'), relance(26, 'r3')]
    const threads = groupIntoThreads(messages, RELANCE_NOW)
    expect(threads[0]?.lastDirection).toBe('outbound')
    expect(selectPositiveReplies(threads, messages)).toHaveLength(0)
  })
})

describe('selectAwaitingReply', () => {
  const base = groupIntoThreads(
    [
      message({ id: 'a', threadId: 'recent', direction: 'outbound', date: '2026-08-01T09:00:00.000Z' }),
      message({ id: 'b', threadId: 'stale', direction: 'outbound', date: '2026-07-10T09:00:00.000Z' }),
      message({ id: 'c', threadId: 'undated', direction: 'outbound', date: null }),
    ],
    NOW,
  )

  it('ne retient que les silences plus longs que le seuil', () => {
    const selected = selectAwaitingReply(base, 7)
    expect(selected.map(thread => thread.threadId)).toEqual(['stale'])
  })

  it('ne relance jamais sur un silence qu’on n’a pas pu mesurer', () => {
    const selected = selectAwaitingReply(base, 1)
    expect(selected.map(thread => thread.threadId)).not.toContain('undated')
  })
})

describe('selectPositiveReplies', () => {
  it('repère un accord dans le dernier message ENTRANT', () => {
    const messages = [
      message({ id: 'a', direction: 'outbound', date: '2026-07-30T09:00:00.000Z' }),
      message({
        id: 'b',
        direction: 'inbound',
        date: '2026-08-01T09:00:00.000Z',
        from: 'jean@acme.com',
        snippet: 'Très intéressé, on peut en parler la semaine prochaine',
      }),
    ]
    const threads = groupIntoThreads(messages, NOW)
    expect(selectPositiveReplies(threads, messages)).toHaveLength(1)
  })

  it('ne prend pas un répondeur d’absence pour un accord', () => {
    const messages = [
      message({
        id: 'b',
        direction: 'inbound',
        date: '2026-08-01T09:00:00.000Z',
        subject: 'Out of office',
        snippet: 'Je suis absent, de retour le 20 août — avec plaisir à mon retour',
      }),
    ]
    const threads = groupIntoThreads(messages, NOW)
    expect(selectPositiveReplies(threads, messages)).toHaveLength(0)
  })
})

describe('normalizeAddress', () => {
  it('extrait l’adresse d’un en-tête nommé', () => {
    expect(normalizeAddress('Jean Dupont <Jean.Dupont@ACME.com>')).toBe('jean.dupont@acme.com')
  })
})

describe('looksLikeAutoReply', () => {
  it('reconnaît les formulations FR et EN', () => {
    expect(looksLikeAutoReply('Automatic reply: vacation', null)).toBe(true)
    expect(looksLikeAutoReply(null, 'Je suis actuellement absent du bureau')).toBe(true)
    expect(looksLikeAutoReply('Re: proposition', 'Merci pour votre envoi')).toBe(false)
  })
})

/**
 * #1400 — les messages du fil voyagent avec lui.
 *
 * Ils étaient récupérés puis JETÉS : le panneau de détail réclamé par le retour
 * demandait une donnée qui traversait déjà le serveur. Ces tests gardent les
 * trois propriétés qui comptent — ils sont là, ils sont ORDONNÉS, et ils sont
 * BORNÉS.
 */
describe('groupIntoThreads — les messages du fil (#1400)', () => {
  it('transporte les messages du fil, du plus ancien au plus récent', () => {
    const threads = groupIntoThreads(
      [
        message({ id: 'b', direction: 'outbound', date: '2026-07-25T09:00:00.000Z' }),
        message({ id: 'a', direction: 'inbound', date: '2026-07-20T09:00:00.000Z' }),
      ],
      NOW,
    )
    expect(threads[0]?.messages?.map(m => m.id)).toEqual(['a', 'b'])
  })

  it('borne à douze : un fil de support ne fait pas exploser la réponse', () => {
    const many = Array.from({ length: 30 }, (_, index) =>
      message({
        id: `m${String(index).padStart(2, '0')}`,
        direction: 'inbound',
        date: `2026-07-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
      }),
    )
    const threads = groupIntoThreads(many, NOW)

    expect(threads[0]?.messages).toHaveLength(12)
    // Ce sont les DOUZE DERNIERS : couper par la tête donnerait un historique
    // qui s'arrête avant ce qui vient de se passer.
    expect(threads[0]?.messages?.at(-1)?.id).toBe('m29')
    expect(threads[0]?.messages?.at(0)?.id).toBe('m18')
    // Et le fil continue d'annoncer sa VRAIE taille : la borne d'affichage ne
    // doit pas se confondre avec le nombre de messages échangés.
    expect(threads[0]?.messageCount).toBe(30)
  })

  it('ne transporte AUCUN corps de message — seulement des métadonnées', () => {
    const threads = groupIntoThreads([message({ id: 'a', direction: 'inbound', snippet: 'extrait' })], NOW)
    const carried = threads[0]?.messages?.[0] ?? {}

    // La règle de sobriété du contrat : objet, expéditeur, date, extrait. Un
    // champ « body » qui apparaîtrait ici transporterait ce qu'on a choisi de
    // ne pas lire, et ce test le dirait.
    expect(Object.keys(carried)).not.toContain('body')
    expect(carried).toMatchObject({ snippet: 'extrait' })
  })
})

// #3671.2 — recette prod 08/10 : le titre de la carte 1 du briefing était
// pollué par le contenu brut d'un billet de train.
describe('looksLikeNonCommercialTravelDocument', () => {
  it('reconnaît un e-billet de train (sujet avec PNR et places)', () => {
    expect(looksLikeNonCommercialTravelDocument('E-billet SNCF Connect - Dossier PNR6R2XQP - 2 voyageurs', null)).toBe(
      true,
    )
  })

  it('reconnaît une confirmation de réservation, en anglais', () => {
    expect(looksLikeNonCommercialTravelDocument('Your booking confirmation — Paris to Lyon', null)).toBe(true)
  })

  it('reconnaît une carte d’embarquement', () => {
    expect(looksLikeNonCommercialTravelDocument('Votre carte d’embarquement TGV 6213', null)).toBe(true)
  })

  it('laisse passer un sujet commercial ordinaire', () => {
    expect(looksLikeNonCommercialTravelDocument('Suite à notre échange', 'Bonjour, je reviens vers vous')).toBe(false)
  })

  it('sujet et extrait vides : jamais un faux positif', () => {
    expect(looksLikeNonCommercialTravelDocument(null, null)).toBe(false)
  })
})
