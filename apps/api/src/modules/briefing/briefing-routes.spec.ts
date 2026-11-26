import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AgendaEvent, MailThread } from '@bellum/contracts'
import { buildBriefingActions } from './briefing-actions'

/**
 * Une destination émise par le serveur existe-t-elle côté web ?
 *
 * Ce test existe à cause d'un défaut vu en production, sur le même bloc que
 * `briefing-labels.spec.ts` : « À faire maintenant » de « Aujourd’hui ». Chaque
 * relance ouvrait « Page introuvable ». Le serveur émettait `/messagerie` —
 * le nom de la CAPACITÉ, celui qu'on lit à l'écran — alors que la route
 * s'appelle `/mailbox`. Les rendez-vous, eux, pointaient vers `/agenda`, un
 * écran qui n'a jamais existé.
 *
 * Rien ne pouvait l'attraper : une destination est une CHAÎNE côté serveur et
 * un fichier de route côté web. Deux dépôts logiques, aucun lien. Ce test est
 * ce lien — il lit le vrai arbre de routes de l'app et exige que chaque
 * destination émise s'y trouve.
 *
 * Le routeur, lui, ne se plaint pas : une route inconnue rend la page 404, ce
 * qui est le bon comportement pour un routeur et exactement pourquoi la garde
 * doit vivre ici.
 */

/**
 * Les destinations déclarées par l'arbre de routes généré de l'app web.
 *
 * `FileRoutesByTo` et pas `FileRoutesByFullPath` : c'est la liste des valeurs
 * que `<Link to=…>` accepte, donc exactement ce que le serveur émet. La liste
 * par chemin complet écrit les routes d'index avec une barre finale
 * (`/mailbox/`), qui n'est pas ce qu'on met dans un lien.
 */
function readWebRoutePaths(): string[] {
  const path = join(__dirname, '..', '..', '..', '..', 'web', 'src', 'routeTree.gen.ts')
  const source = readFileSync(path, 'utf8')
  const start = source.indexOf('export interface FileRoutesByTo {')
  const end = source.indexOf('export interface FileRoutesById {')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const block = source.slice(start, end)
  return [...block.matchAll(/^\s*'([^']+)':/gm)].map(match => match[1]!)
}

/** `/accounts/abc` est servi par la route `/accounts/$id`. */
function isServedByAWebRoute(href: string, routes: string[]): boolean {
  const pathname = href.split('?')[0]!.split('#')[0]!
  const parts = pathname.split('/')
  return routes.some(route => {
    const routeParts = route.split('/')
    if (routeParts.length !== parts.length) return false
    return routeParts.every((part, index) => part.startsWith('$') || part === parts[index])
  })
}

function event(id: string): AgendaEvent {
  return {
    id,
    summary: 'Point client',
    description: null,
    location: null,
    start: '2026-08-03T09:00:00.000Z',
    end: '2026-08-03T10:00:00.000Z',
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
  }
}

function thread(threadId: string): MailThread {
  return {
    threadId,
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
  }
}

/** Un brief qui déclenche les cinq familles d'action d'un coup. */
function everyKindOfAction() {
  return buildBriefingActions({
    now: new Date('2026-08-03T07:00:00.000Z'),
    meetings: [event('m1')],
    conflicts: [{ first: event('a'), second: event('b'), overlapMinutes: 30 }],
    awaitingReply: [thread('t1')],
    unread: [],
    positiveReplies: [thread('p1')],
    accountsWithFreshSignal: [
      { accountId: 'acc-1', companyName: 'ACME', detectedAt: '2026-08-02T18:00:00.000Z', detectionExact: true },
    ],
    // #2107.3 — le besoin ouvre SON écran, jamais une liste.
    staleNeeds: [{ id: 'need-1', title: 'DevOps confirmé', days: 9 }],
  })
}

describe('destinations du brief du jour', () => {
  it('chaque action qui propose une destination pointe sur une route qui existe', () => {
    const routes = readWebRoutePaths()
    // Sanité : si l'extraction rendait une liste vide, tout passerait.
    expect(routes).toContain('/mailbox')

    for (const action of everyKindOfAction()) {
      if (action.href === null) continue
      expect(isServedByAWebRoute(action.href, routes)).toBe(true)
    }
  })

  it('aucune destination ne porte le nom de la capacité au lieu de celui de la route', () => {
    // Le défaut exact qu'on a corrigé : `/messagerie` (ce que l'écran DIT) au
    // lieu de `/mailbox` (ce que le routeur SERT).
    for (const action of everyKindOfAction()) {
      expect(action.href ?? '').not.toContain('/messagerie')
      expect(action.href ?? '').not.toContain('/agenda')
    }
  })

  it('une relance ouvre la messagerie sur l’intention qui contient le fil', () => {
    // Sans l'intention, le clic ouvre la liste par défaut : le fil visé n'y est
    // pas forcément, et l'écran se lit « ce fil n'existe pas ».
    const actions = everyKindOfAction()
    const followUp = actions.find(action => action.kind === 'follow_up')
    const reply = actions.find(action => action.kind === 'reply')
    expect(followUp?.href).toBe('/mailbox?intent=no_reply&thread=t1')
    expect(reply?.href).toBe('/mailbox?intent=positive_reply&thread=p1')
  })

  it('une action sans écran où atterrir rend null, jamais une route de repli', () => {
    // Renvoyer vers `/briefing` ferait un clic sans effet — la même impression
    // de panne qu'un 404, un écran plus loin.
    const actions = everyKindOfAction()
    expect(actions.find(action => action.kind === 'conflict')?.href).toBeNull()
    expect(actions.find(action => action.kind === 'meeting_prep')?.href).toBeNull()
  })
})
