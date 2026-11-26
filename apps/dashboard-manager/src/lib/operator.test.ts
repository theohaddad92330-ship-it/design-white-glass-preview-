import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { actorFromRequest } from './operator'
import { COOKIE_SESSION, signerSession } from './session'

/**
 * T3 de #1668 — « action admin → l'email de l'auteur est dans le journal ».
 *
 * Avant ce lot, le journal disait le nom d'un Basic Auth partagé à trois : il
 * ne distinguait personne. C'est le SEUL point de l'issue qui change ce que
 * l'API reçoit, et donc le seul qui se voie depuis l'extérieur du back-office.
 */

const ORIGINE = { ...process.env }
const BASIC = `Basic ${Buffer.from('admin:mdp').toString('base64')}`

function requete(cookie?: string): NextRequest {
  const entetes = new Headers({ authorization: BASIC })
  if (cookie) entetes.set('cookie', `${COOKIE_SESSION}=${cookie}`)
  return new NextRequest('https://manager.test/api/admin/users/u1/suspend', { headers: entetes })
}

beforeEach(() => {
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
})

afterEach(() => {
  process.env = { ...ORIGINE }
})

describe('qui signe une action du back-office (#1668, T3)', () => {
  it('T3 — l’e-mail authentifié devient l’auteur', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    expect(await actorFromRequest(requete(jeton))).toBe('louis@bellum-it.com')
  })

  it('couche éteinte : le nom du Basic Auth, exactement comme avant', async () => {
    delete process.env['DM_ALLOWED_EMAILS']
    expect(await actorFromRequest(requete())).toBe('admin')
  })

  it('sait dire NON — un cookie bricolé ne signe rien', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    // Le repli est le Basic Auth, jamais l'adresse que le cookie prétend porter.
    expect(await actorFromRequest(requete('intrus@x.fr.faux'))).toBe('admin')
  })

  it('sans rien du tout, un nom NEUTRE — jamais une identité inventée', async () => {
    delete process.env['DM_ALLOWED_EMAILS']
    const nue = new NextRequest('https://manager.test/api/admin/users/u1/suspend')
    expect(await actorFromRequest(nue)).toBe('backoffice')
  })
})
