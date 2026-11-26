import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le journal d'accès est-il vraiment APPELÉ, et porte-t-il vraiment l'origine ?
 * (#1671.2)
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE PLUTÔT QU'UN SIMPLE TEST DE LA FONCTION.
 * Le défaut n°1 de ce dépôt est du code juste que personne n'appelle. Une
 * fonction `journaliserAcces` parfaitement testée, branchée nulle part, laisserait
 * le journal vide et tous ses tests verts. Ce fichier vérifie donc les DEUX
 * moitiés : que la fonction lit bien les en-têtes, ET que la route de connexion
 * l'appelle — sur le chemin qui réussit comme sur celui qui échoue.
 *
 * L'autre moitié de l'histoire — que le back-office n'écrive PAS en base
 * directement — est tenue par le fait qu'il n'a que la clé anon : passer par
 * l'API avec le secret interne est la seule voie, et c'est cette requête-là
 * qu'on observe ici.
 */

const connecter = vi.fn()
vi.mock('@/lib/backoffice-auth', () => ({
  connecter: (...args: unknown[]) => connecter(...args),
  variablesManquantes: () => [],
}))

const ORIGINE = { ...process.env }
let appels: { url: string; corps: Record<string, unknown>; entetes: Record<string, string> }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  appels = []
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  process.env['API_BASE_URL'] = 'https://api.test'
  process.env['DM_ALLOWED_EMAILS'] = 'louis@bellum-it.com:owner'
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      appels.push({
        url: String(url),
        corps: JSON.parse(String(init.body)) as Record<string, unknown>,
        entetes: init.headers as Record<string, string>,
      })
      return new Response('{}', { status: 200 })
    }),
  )
})

afterEach(() => {
  process.env = { ...ORIGINE }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function requete(entetes: Record<string, string>, corps: Record<string, string>) {
  return new NextRequest('https://manager.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
    body: JSON.stringify(corps),
  })
}

const ORIGINE_VERCEL = {
  'x-forwarded-for': '203.0.113.7, 70.41.3.18',
  'user-agent': 'Mozilla/5.0 (Macintosh)',
  'x-vercel-ip-country': 'FR',
}

describe('journaliserAcces — l’origine est LUE, et la route l’APPELLE (#1671.2)', () => {
  it('une connexion réussie est journalisée AVEC son IP, son navigateur et son pays', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    const { POST } = await import('@/app/api/auth/login/route')
    const reponse = await POST(requete(ORIGINE_VERCEL, { email: 'louis@bellum-it.com', password: 'x', code: '123456' }))

    expect(reponse.status).toBe(200)

    const journal = appels.find(a => a.url.includes('/internal/backoffice/access-journal'))
    expect(journal).toBeDefined()
    expect(journal?.entetes['x-internal-secret']).toBeTruthy()
    expect(journal?.corps).toMatchObject({
      event: 'connexion',
      actorEmail: 'louis@bellum-it.com',
      actorRole: 'owner',
      // ⚠️ Le premier de `x-forwarded-for` est le client ; les suivants sont
      // les relais. Prendre la liste entière rendrait l'adresse inexploitable.
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (Macintosh)',
      country: 'FR',
    })
  })

  it('un refus est journalisé AUSSI — c’est lui que l’alerte de #1671.3 compte', async () => {
    connecter.mockResolvedValue({
      etat: 'identifiants_refuses',
      diagnostic: { statut: 400, code: 'invalid_credentials' },
    })
    const { POST } = await import('@/app/api/auth/login/route')
    await POST(requete(ORIGINE_VERCEL, { email: 'louis@bellum-it.com', password: 'x', code: '123456' }))

    const journal = appels.find(a => a.url.includes('/internal/backoffice/access-journal'))
    expect(journal?.corps).toMatchObject({ event: 'connexion_refusee', reason: 'identifiants_refuses', country: 'FR' })
    // Le diagnostic technique voyage dans le journal, jamais vers l'écran.
    expect(JSON.parse(String(journal?.corps['detail']))).toMatchObject({ statut: 400 })
  })

  it('T1 — une adresse HORS LISTE est journalisée sans jamais interroger Supabase', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    const { POST } = await import('@/app/api/auth/login/route')
    const reponse = await POST(requete(ORIGINE_VERCEL, { email: 'intrus@ailleurs.fr', password: 'x', code: '1' }))

    expect(reponse.status).toBe(403)
    expect(connecter).not.toHaveBeenCalled()
    const journal = appels.find(a => a.url.includes('/internal/backoffice/access-journal'))
    expect(journal?.corps).toMatchObject({ event: 'acces_refuse', reason: 'hors_liste' })
  })

  it('SANS en-tête d’origine, les trois champs sont `null` — jamais « inconnu »', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    const { POST } = await import('@/app/api/auth/login/route')
    await POST(requete({}, { email: 'louis@bellum-it.com', password: 'x', code: '123456' }))

    const journal = appels.find(a => a.url.includes('/internal/backoffice/access-journal'))
    expect(journal?.corps['ip']).toBeNull()
    expect(journal?.corps['country']).toBeNull()
  })

  it('SAIT DIRE NON à sa propre panne — une API injoignable n’empêche pas de se connecter', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('réseau coupé')))
    connecter.mockResolvedValue({ etat: 'ok' })
    const { POST } = await import('@/app/api/auth/login/route')
    const reponse = await POST(requete(ORIGINE_VERCEL, { email: 'louis@bellum-it.com', password: 'x', code: '123456' }))

    // Une trace n'est pas une porte.
    expect(reponse.status).toBe(200)
  })

  it('sans `API_BASE_URL`, rien n’est tenté — et surtout rien n’échoue', async () => {
    delete process.env['API_BASE_URL']
    connecter.mockResolvedValue({ etat: 'ok' })
    const { POST } = await import('@/app/api/auth/login/route')
    const reponse = await POST(requete(ORIGINE_VERCEL, { email: 'louis@bellum-it.com', password: 'x', code: '123456' }))

    expect(reponse.status).toBe(200)
    expect(appels).toHaveLength(0)
  })
})
