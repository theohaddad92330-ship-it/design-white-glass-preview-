import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOKIE_SESSION } from '@/lib/session'

/**
 * La connexion du back-office, bout en bout côté serveur (#1668) — T1 et T5.
 *
 * Supabase est remplacé : ce qui se prouve ici est l'ORDRE des vérifications et
 * ce que chaque refus rend. Que Supabase valide un TOTP est son travail, pas
 * quelque chose que ce dépôt puisse tester sans réseau.
 */

const connecter = vi.fn()
vi.mock('@/lib/backoffice-auth', () => ({
  connecter: (...args: unknown[]) => connecter(...args),
  variablesManquantes: () => [],
}))

const ORIGINE = { ...process.env }

async function poster(corps: Record<string, string>) {
  const { POST } = await import('./route')
  const req = new NextRequest('https://manager.test/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corps),
  })
  const reponse = await POST(req)
  return { reponse, corps: (await reponse.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  process.env['DM_ALLOWED_EMAILS'] = 'theo@bellum-it.com:owner,louis@bellum-it.com:operator'
})

afterEach(() => {
  process.env = { ...ORIGINE }
})

describe('POST /api/auth/login (#1668)', () => {
  it('LIT quelque chose — une connexion complète ouvre une session signée', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    const { reponse, corps } = await poster({ email: 'Louis@Bellum-IT.com', password: 'x', code: '123456' })

    expect(reponse.status).toBe(200)
    expect(corps).toMatchObject({ ok: true, email: 'louis@bellum-it.com', role: 'operator' })
    const cookie = reponse.cookies.get(COOKIE_SESSION)
    expect(cookie?.value).toBeTruthy()
    expect(cookie?.httpOnly).toBe(true)
    expect(cookie?.sameSite).toBe('lax')
  })

  it('T1 — une adresse hors liste rend 403, et n’interroge JAMAIS Supabase', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    const { reponse } = await poster({ email: 'intrus@ailleurs.fr', password: 'x', code: '123456' })

    expect(reponse.status).toBe(403)
    // L'ordre compte : sans lui, la console dirait par sa latence et ses
    // messages quels comptes existent chez le client.
    expect(connecter).not.toHaveBeenCalled()
    expect(reponse.cookies.get(COOKIE_SESSION)).toBeUndefined()
  })

  it('T5 — sans application d’authentification enrôlée, la connexion est refusée', async () => {
    connecter.mockResolvedValue({ etat: 'mfa_absent' })
    const { reponse, corps } = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '123456' })

    expect(reponse.status).toBe(409)
    expect(corps['code']).toBe('mfa_absent')
    expect(reponse.cookies.get(COOKIE_SESSION)).toBeUndefined()
  })

  it('un mot de passe faux et un code faux rendent la MÊME réponse, champ `code` compris', async () => {
    connecter.mockResolvedValue({ etat: 'identifiants_refuses', diagnostic: { statut: 400 } })
    const mdp = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '123456' })
    connecter.mockResolvedValue({ etat: 'code_refuse', diagnostic: { statut: 422 } })
    const totp = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '000000' })

    // Dire lequel des deux a échoué apprendrait à qui essaie qu'il tient le bon
    // mot de passe. Le mettre dans le JSON plutôt que dans le texte ne le
    // cachait de personne : un attaquant lit la réponse, pas l'écran.
    expect(mdp.reponse.status).toBe(401)
    expect(totp.reponse.status).toBe(401)
    expect(mdp.corps).toEqual(totp.corps)
  })

  it('le DIAGNOSTIC Supabase va au journal serveur, JAMAIS dans la réponse (§3)', async () => {
    const journal = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    connecter.mockResolvedValue({
      etat: 'identifiants_refuses',
      diagnostic: { statut: 401, message: 'Invalid API key' },
    })
    const { reponse, corps } = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '123456' })

    expect(reponse.status).toBe(401)
    // Sans cette ligne dans le journal, « clé anon refusée » et « mot de passe
    // faux » sont le même mot — c'est ce qui a bloqué tout le monde le 07/09.
    //
    // Le journal est du JSON : on le PARSE plutôt que d'y chercher une sous-chaîne.
    // Depuis #1671.2 le diagnostic voyage dans `detail`, donc échappé — une
    // assertion sur `'"statut":401'` aurait été verte pour la mauvaise raison
    // puis rouge sans que rien ne casse.
    const lignes = journal.mock.calls
      .map(appel => {
        try {
          return JSON.parse(String(appel[0])) as Record<string, unknown>
        } catch {
          return null
        }
      })
      .filter((l): l is Record<string, unknown> => l !== null)
    const refus = lignes.find(l => l['event'] === 'backoffice.connexion_refusee')
    expect(refus).toBeDefined()
    // Les clés du journal MIROITENT désormais les colonnes de la table (#1671.2).
    expect(refus?.['reason']).toBe('identifiants_refuses')
    expect(JSON.parse(String(refus?.['detail']))).toMatchObject({ statut: 401, message: 'Invalid API key' })

    // Mais rien de tout ça ne part vers le navigateur.
    expect(JSON.stringify(corps)).not.toContain('Invalid API key')
    expect(JSON.stringify(corps)).not.toContain('401')
    journal.mockRestore()
  })

  it('T4 — la liste posée mais vide rend 503, jamais un accès ouvert', async () => {
    process.env['DM_ALLOWED_EMAILS'] = ' , '
    connecter.mockResolvedValue({ etat: 'ok' })
    const { reponse } = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '123456' })

    expect(reponse.status).toBe(503)
    expect(connecter).not.toHaveBeenCalled()
  })

  it('sans liste du tout, la route n’existe pas — la couche est éteinte', async () => {
    delete process.env['DM_ALLOWED_EMAILS']
    const { reponse } = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '123456' })
    expect(reponse.status).toBe(404)
  })

  it('sait dire NON — sans adresse ni mot de passe, aucune vérification n’est déclenchée', async () => {
    connecter.mockResolvedValue({ etat: 'ok' })
    expect((await poster({ email: '', password: 'x', code: '123456' })).reponse.status).toBe(400)
    expect((await poster({ email: 'louis@bellum-it.com', password: '', code: '123456' })).reponse.status).toBe(400)
    expect(connecter).not.toHaveBeenCalled()
  })

  it('LA PREMIÈRE CONNEXION EST POSSIBLE — un code VIDE atteint la vérification', async () => {
    // Le défaut du 07/09 : le code était exigé AVANT de savoir si un facteur
    // existait, donc la connexion qui mène à l'enrôlement était impossible.
    // C'est `connecter()` qui tranche, une fois les facteurs lus.
    connecter.mockResolvedValue({ etat: 'mfa_absent' })
    const { reponse, corps } = await poster({ email: 'louis@bellum-it.com', password: 'x', code: '' })

    expect(connecter).toHaveBeenCalledWith('louis@bellum-it.com', 'x', '')
    expect(reponse.status).toBe(409)
    expect(corps['code']).toBe('mfa_absent')
    // Un code vide n'ouvre jamais rien : aucune session ne sort d'ici.
    expect(reponse.cookies.get(COOKIE_SESSION)).toBeUndefined()
  })
})
