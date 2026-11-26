import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildBriefingActions } from './briefing-actions'

/**
 * « RIEN NE SERA ENVOYÉ » — la promesse du bandeau, tenue par construction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le bandeau de « Aujourd’hui » affiche « rien ne sera envoyé ». C'est la
 * phrase qui rend l'écran acceptable : un commercial accepte qu'un outil lui
 * propose sept gestes le matin PARCE QU'il sait qu'aucun ne partira sans lui.
 *
 * Une promesse affichée n'est pas une promesse tenue. La doctrine du dépôt le
 * dit dans l'autre sens depuis longtemps — « le copilote n'envoie jamais
 * d'e-mail : ses outils de proposition n'ont AUCUN chemin d'écriture, ce n'est
 * pas une convention, c'est l'absence de code ». Cette garde est la version
 * brief de cette phrase : elle relit le producteur de cartes et EXIGE que la
 * promesse tombe le jour où un chemin d'envoi apparaîtrait.
 *
 * Autrement dit : on ne peut pas ajouter un envoi au brief sans que la CI
 * demande de retirer la phrase. C'est la seule façon qu'une promesse survive à
 * la personne qui l'a écrite.
 *
 * Ce que la garde prouve, comme toute garde de ce dépôt :
 *  - elle LIT quelque chose (le fichier producteur, et les deux fichiers de
 *    traduction — un chemin devenu faux fait tomber le premier test) ;
 *  - elle sait dire NON (ajouter un `href` vers une route d'envoi, ou un appel
 *    d'envoi dans le producteur, la fait rougir).
 */

/** Le producteur de cartes — le seul endroit qui décide où une carte mène. */
const PRODUCER = join(__dirname, 'briefing-actions.ts')

/**
 * Les racines de route qu'une carte a le droit d'ouvrir. TOUTES sont des
 * écrans de LECTURE : la messagerie ouvre un fil, le dossier d'un compte
 * s'ouvre en consultation. Aucune ne poste quoi que ce soit.
 */
const READ_ONLY_ROUTE_PREFIXES = ['/mailbox', '/accounts/', '/projects/needs/']

/**
 * Ce qu'un chemin d'ENVOI ressemblerait dans ce fichier.
 *
 * Volontairement large : on préfère un faux positif — qui se lève en une
 * minute — à un envoi qui passe. `intent=` est exclu du motif parce que la
 * messagerie s'ouvre PAR intention de lecture (`intent=no_reply`), ce qui n'a
 * rien à voir.
 */
const SENDING_VERBS = /\bsend\b|\bsendMail\b|\bsendMessage\b|\bpost\(|\.post\b|envoie|envoyer/i

/** Retire les commentaires : un docblock qui EXPLIQUE la règle la violerait. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function readWebLocale(locale: string): string {
  return readFileSync(
    join(__dirname, '..', '..', '..', '..', 'web', 'src', 'i18n', 'locales', locale, 'briefing.json'),
    'utf8',
  )
}

describe('« rien ne sera envoyé » — la promesse du brief', () => {
  it('lit bien le producteur ET les deux traductions — sinon la garde serait verte sur du vide', () => {
    const source = readFileSync(PRODUCER, 'utf8')
    expect(source.length).toBeGreaterThan(1000)
    expect(source).toContain('buildBriefingActions')
    // La promesse est AFFICHÉE : si elle disparaît des traductions, cette garde
    // n'a plus d'objet et doit être supprimée avec elle.
    expect(readWebLocale('fr')).toContain('rien ne sera envoyé')
    expect(readWebLocale('en')).toContain('nothing will be sent')
  })

  it('le producteur de cartes ne contient AUCUN verbe d’envoi', () => {
    // Si ce test tombe : soit un envoi est arrivé dans le brief — et alors la
    // phrase « rien ne sera envoyé » doit disparaître du bandeau, dans les deux
    // langues — soit un mot du motif est apparu sans envoyer quoi que ce soit,
    // et c'est le motif qu'il faut resserrer. Ne JAMAIS retirer la garde.
    const code = stripComments(readFileSync(PRODUCER, 'utf8'))
    const offending = code.split('\n').filter(line => SENDING_VERBS.test(line))
    expect(offending).toEqual([])
  })

  it('aucune carte ne mène ailleurs que sur un écran de LECTURE', () => {
    const actions = buildBriefingActions({
      now: new Date('2026-08-03T07:00:00.000Z'),
      meetings: [],
      conflicts: [],
      unread: [],
      awaitingReply: [
        {
          threadId: 't1',
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
        },
      ],
      positiveReplies: [],
      accountsWithFreshSignal: [
        { accountId: 'acc-1', companyName: 'ACME', detectedAt: '2026-08-02T18:00:00.000Z', detectionExact: true },
      ],
      staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
    })

    // Sanité : une liste vide passerait ce test pour rien.
    expect(actions.length).toBeGreaterThan(0)
    const foreign = actions
      .map(action => action.href)
      .filter((href): href is string => href !== null)
      .filter(href => !READ_ONLY_ROUTE_PREFIXES.some(prefix => href.startsWith(prefix)))
    expect(foreign).toEqual([])
  })

  it('aucune carte ne porte d’artefact « prêt à partir »', () => {
    // Un artefact préparé est un BROUILLON : il se relit, il ne s'envoie pas.
    // Le jour où un producteur en fabriquera, ce test dira que son genre doit
    // rester dans la liste fermée du contrat — et cette liste ne contient
    // aucun genre qui parte tout seul.
    const actions = buildBriefingActions({
      now: new Date('2026-08-03T07:00:00.000Z'),
      meetings: [],
      conflicts: [],
      unread: [],
      awaitingReply: [],
      positiveReplies: [],
      accountsWithFreshSignal: [
        { accountId: 'acc-1', companyName: 'ACME', detectedAt: '2026-08-02T18:00:00.000Z', detectionExact: true },
      ],
      staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
    })
    expect(actions.length).toBeGreaterThan(0)
    for (const action of actions) {
      expect(action.preparedArtifacts.every(artifact => artifact.kind !== 'draft_message' || !artifact.href)).toBe(true)
    }
  })
})
