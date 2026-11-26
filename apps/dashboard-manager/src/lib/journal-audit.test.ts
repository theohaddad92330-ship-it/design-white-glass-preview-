import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { journaliserAudit, resultatDeStatut } from '@/lib/journal-audit'

/**
 * LA PORTE DU JOURNAL D'AUDIT (#1666) — et le fait qu'elle soit APPELÉE.
 *
 * ⚠️ POURQUOI CE FICHIER TIENT LES DEUX MOITIÉS.
 * Le défaut n°1 de ce dépôt est du code juste que personne n'appelle. Une
 * fonction `journaliserAudit` parfaitement testée, branchée nulle part,
 * laisserait le journal vide et tous ses tests verts. Ce fichier vérifie donc
 * que la porte écrit ce qu'il faut, ET qu'une vraie route la traverse — ici
 * `/api/admin/email-reveal`, celle que #1670.4 avait explicitement laissée en
 * attente de ce journal.
 *
 * (L'exhaustivité, elle — les vingt-sept gestionnaires mutants —, est tenue par
 * `src/architecture/journal-audit-a-des-ecrivains.test.ts`.)
 */

const ORIGINE = { ...process.env }
let appels: { url: string; corps: Record<string, unknown>; entetes: Record<string, string> }[] = []

beforeEach(() => {
  vi.clearAllMocks()
  appels = []
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  process.env['API_BASE_URL'] = 'https://api.test'
  // Couche d'identité au repos : l'auteur vaudra `null`, jamais « inconnu ».
  delete process.env['DM_ALLOWED_EMAILS']
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      appels.push({
        url: String(url),
        corps: JSON.parse(String(init.body)) as Record<string, unknown>,
        entetes: init.headers as Record<string, string>,
      })
      return new Response('{"ok":true}', { status: 200 })
    }),
  )
})

afterEach(() => {
  process.env = { ...ORIGINE }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function requete(entetes: Record<string, string> = {}): NextRequest {
  return new NextRequest('https://manager.test/api/admin/users/u-1/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...entetes },
  })
}

const ORIGINE_VERCEL = {
  'x-forwarded-for': '203.0.113.7, 70.41.3.18',
  'user-agent': 'Mozilla/5.0 (Macintosh)',
  'x-vercel-ip-country': 'FR',
}

describe('resultatDeStatut — un refus n’est pas une panne (#1666)', () => {
  it('LIT quelque chose — les trois familles de codes se distinguent', () => {
    expect(resultatDeStatut(200)).toBe('succes')
    expect(resultatDeStatut(204)).toBe('succes')
    // Un 403 est le produit qui FONCTIONNE : le rôle ne permettait pas le geste.
    expect(resultatDeStatut(403)).toBe('refus')
    expect(resultatDeStatut(400)).toBe('refus')
    // Un 502 est le produit qui ne fonctionne pas.
    expect(resultatDeStatut(502)).toBe('echec')
  })

  it('SAIT DIRE NON — un code ABSENT vaut « échec », jamais « réussi »', () => {
    // On ne sait pas si le geste a abouti, et un journal d'audit qui SUPPOSE la
    // réussite est pire qu'un journal vide.
    expect(resultatDeStatut(null)).toBe('echec')
    expect(resultatDeStatut(undefined)).toBe('echec')
    expect(resultatDeStatut(Number.NaN)).toBe('echec')
  })
})

describe('journaliserAudit — la porte écrit les six colonnes (#1666)', () => {
  it('l’origine est LUE : IP, navigateur, pays', async () => {
    await journaliserAudit(requete(ORIGINE_VERCEL), {
      operation: 'users.delete',
      category: 'suppression',
      subjectType: 'user',
      subjectId: 'u-1',
      statusCode: 200,
    })

    const appel = appels.find(a => a.url.includes('/internal/admin/audit-journal'))
    expect(appel).toBeDefined()
    expect(appel?.entetes['x-internal-secret']).toBeTruthy()
    expect(appel?.corps).toMatchObject({
      operation: 'users.delete',
      category: 'suppression',
      outcome: 'succes',
      subjectType: 'user',
      subjectId: 'u-1',
      statusCode: 200,
      // ⚠️ Le premier de `x-forwarded-for` est le client ; les suivants sont les
      // relais. Prendre la liste entière rendrait l'adresse inexploitable.
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (Macintosh)',
      country: 'FR',
    })
  })

  it('SANS en-tête d’origine, les champs restent `null` — jamais « inconnu »', async () => {
    await journaliserAudit(requete(), { operation: 'banners.create', category: 'ordinaire', statusCode: 201 })

    const corps = appels[0]?.corps
    expect(corps?.['ip']).toBeNull()
    expect(corps?.['country']).toBeNull()
    // Couche d'identité au repos : pas d'auteur nommé, et surtout pas d'auteur
    // inventé.
    expect(corps?.['actorEmail']).toBeNull()
  })

  it('le RÉSULTAT se déduit du code — un 403 est un refus, pas un échec', async () => {
    await journaliserAudit(requete(), { operation: 'users.delete', category: 'suppression', statusCode: 403 })
    expect(appels[0]?.corps['outcome']).toBe('refus')
  })

  it('SAIT DIRE NON à sa propre panne — une API injoignable ne casse pas le geste', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('réseau coupé')))
    // La ligne s'écrit APRÈS le geste : jeter rendrait une erreur pour une
    // action bel et bien faite.
    await expect(
      journaliserAudit(requete(), { operation: 'users.suspend', category: 'permission', statusCode: 200 }),
    ).resolves.toBeUndefined()
  })

  it('sans `API_BASE_URL`, rien n’est tenté — et surtout rien n’échoue', async () => {
    delete process.env['API_BASE_URL']
    await journaliserAudit(requete(), { operation: 'users.suspend', category: 'permission', statusCode: 200 })
    expect(appels).toHaveLength(0)
  })
})

describe('la route qui ATTENDAIT ce journal l’appelle vraiment (#1670.4 → #1666)', () => {
  it('révéler une adresse écrit une ligne `email.reveal`, et seulement la forme MASQUÉE', async () => {
    const { POST } = await import('@/app/api/admin/email-reveal/route')
    const req = new NextRequest('https://manager.test/api/admin/email-reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...ORIGINE_VERCEL },
      body: JSON.stringify({ context: '/clients', masked: 'm****@societe.com' }),
    })

    const reponse = await POST(req)
    expect(reponse.status).toBe(204)

    const audit = appels.find(a => a.url.includes('/internal/admin/audit-journal'))
    expect(audit?.corps).toMatchObject({
      operation: 'email.reveal',
      category: 'ordinaire',
      outcome: 'succes',
      subjectLabel: 'm****@societe.com',
    })
    // ⚠️ SEULE LA FORME MASQUÉE VOYAGE. Tracer une révélation ne doit pas être
    // un second chemin par lequel l'adresse s'écrit quelque part.
    expect(String(audit?.corps['subjectLabel'])).toContain('****')
  })
})
