import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { middleware } from './middleware'
import { COOKIE_SESSION, DUREE_SESSION_MS, signerSession } from './lib/session'

/**
 * Les deux rideaux du back-office (#1668) et la porte de la trésorerie (#1669).
 *
 * ⚠️ CE QUE CETTE GARDE PROUVE EN PREMIER, ET QUI COMPTE PLUS QUE LE RESTE :
 * sans `DM_ALLOWED_EMAILS`, le chemin est celui d'AVANT. C'est ce qui rend le
 * lot livrable sans risque de verrouillage, et c'est la seule affirmation dont
 * on ne peut pas se contenter de la relire.
 */

const ORIGINE = { ...process.env }

const BASIC = `Basic ${Buffer.from('op:mdp').toString('base64')}`

function requete(chemin: string, cookie?: string): NextRequest {
  const entetes = new Headers({ authorization: BASIC })
  if (cookie) entetes.set('cookie', `${COOKIE_SESSION}=${cookie}`)
  return new NextRequest(`https://manager.test${chemin}`, { headers: entetes })
}

beforeEach(() => {
  process.env['DM_BASIC_AUTH_USER'] = 'op'
  process.env['DM_BASIC_AUTH_PASSWORD'] = 'mdp'
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  delete process.env['DM_ALLOWED_EMAILS']
})

afterEach(() => {
  process.env = { ...ORIGINE }
})

describe('le premier rideau — Basic Auth, inchangé', () => {
  it('LIT quelque chose — une requête complète passe', async () => {
    const reponse = await middleware(requete('/clients'))
    expect(reponse.status).toBe(200)
  })

  it('sait dire NON — sans en-tête, 401 ; sans configuration, 503', async () => {
    const nue = new NextRequest('https://manager.test/clients')
    expect((await middleware(nue)).status).toBe(401)

    delete process.env['DM_BASIC_AUTH_PASSWORD']
    expect((await middleware(requete('/clients'))).status).toBe(503)
  })
})

describe('le second rideau — l’identité (#1668)', () => {
  it('ABSENTE : la couche est INERTE, et aucun cookie n’est posé', async () => {
    const reponse = await middleware(requete('/clients'))
    expect(reponse.status).toBe(200)
    // Le chemin d'avant, à la ligne près : rien n'est signé, rien n'est renvoyé.
    expect(reponse.cookies.get(COOKIE_SESSION)).toBeUndefined()
  })

  it('T4 — POSÉE mais sans aucune adresse : 503, jamais d’accès ouvert', async () => {
    process.env['DM_ALLOWED_EMAILS'] = '  ,  '
    const reponse = await middleware(requete('/clients'))
    expect(reponse.status).toBe(503)
  })

  it('sans session, un écran redirige vers la connexion et une API rend 401', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'

    const ecran = await middleware(requete('/clients'))
    expect(ecran.status).toBe(307)
    expect(ecran.headers.get('location')).toContain('/login?suite=%2Fclients')

    const api = await middleware(requete('/api/admin/users/u1/delete'))
    expect(api.status).toBe(401)
  })

  it('T2 — une session de 8 h 01 renvoie à la connexion', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    const vieux = (await signerSession('louis@bellum-it.com', Date.now() - DUREE_SESSION_MS - 60_000)) ?? ''
    const reponse = await middleware(requete('/clients', vieux))
    expect(reponse.status).toBe(307)
    expect(reponse.headers.get('location')).toContain('/login')
  })

  it('une session valide passe, et son échéance est REPOUSSÉE à chaque requête', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    const reponse = await middleware(requete('/clients', jeton))
    expect(reponse.status).toBe(200)
    // « Renouvelée à l'activité » : le cookie repart, avec une nouvelle date.
    const renouvele = reponse.cookies.get(COOKIE_SESSION)
    expect(renouvele?.value).toBeTruthy()
    expect(renouvele?.httpOnly).toBe(true)
    expect(renouvele?.maxAge).toBe(DUREE_SESSION_MS / 1000)
  })

  it('une adresse RETIRÉE de la liste perd sa session, sans attendre son expiration', async () => {
    const jeton = (await signerSession('parti@bellum-it.com')) ?? ''
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    const reponse = await middleware(requete('/clients', jeton))
    expect(reponse.status).toBe(307)
  })

  it('la connexion reste atteignable sans session — sinon plus personne n’entre', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    for (const chemin of [
      '/login',
      '/api/auth/login',
      '/api/auth/enroll',
      '/api/auth/enroll/confirm',
      '/api/auth/logout',
    ]) {
      expect((await middleware(requete(chemin))).status, chemin).toBe(200)
    }
  })
})

describe('la porte de la trésorerie (#1669)', () => {
  it('un operator est renvoyé des quatre URL de la trésorerie', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:operator'
    const jeton = (await signerSession('louis@bellum-it.com')) ?? ''
    for (const chemin of ['/facturation', '/couts', '/offres', '/usage']) {
      const reponse = await middleware(requete(chemin, jeton))
      expect(reponse.status, chemin).toBe(307)
      expect(reponse.headers.get('location'), chemin).toContain('/acces-refuse')
    }
  })

  it('un owner y entre, et un operator garde tout le reste', async () => {
    process.env['DM_ALLOWED_EMAILS'] = 'theo@bellum-it.com:owner,louis@bellum-it.com:operator'

    const owner = (await signerSession('theo@bellum-it.com')) ?? ''
    expect((await middleware(requete('/facturation', owner))).status).toBe(200)

    const operator = (await signerSession('louis@bellum-it.com')) ?? ''
    for (const chemin of ['/clients', '/monitoring', '/health', '/queues', '/changelog']) {
      expect((await middleware(requete(chemin, operator))).status, chemin).toBe(200)
    }
  })
})
