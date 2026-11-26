import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Ce que le back-office doit pouvoir DIRE quand une connexion échoue (#1668).
 *
 * POURQUOI CE FICHIER EXISTE
 * Le 07/09/2026, personne n'arrivait à se connecter en production : le serveur
 * rendait « Adresse, mot de passe ou code refusé » et n'écrivait rien d'autre
 * que `raison: 'identifiants_refuses'` dans son journal. Deux causes tenaient
 * dans ce seul mot — mot de passe faux, ou clé anon refusée par Supabase — et
 * rien ne permettait de les séparer. Un refus indistinct à l'ÉCRAN est une
 * décision de sécurité ; un refus indistinct dans le JOURNAL est une panne
 * qu'on ne peut pas diagnostiquer.
 *
 * Ce que ces tests prouvent, donc : le code d'erreur de Supabase VOYAGE
 * jusqu'à l'appelant (qui le journalise), et il ne se retrouve JAMAIS dans ce
 * qui part vers le navigateur — cette seconde moitié est tenue par
 * `route.test.ts`.
 */

const signInWithPassword = vi.fn()
const listFactors = vi.fn()
const challengeAndVerify = vi.fn()

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: (...a: unknown[]) => signInWithPassword(...a),
      signOut: async () => ({ error: null }),
      mfa: {
        listFactors: (...a: unknown[]) => listFactors(...a),
        challengeAndVerify: (...a: unknown[]) => challengeAndVerify(...a),
      },
    },
  }),
}))

const ORIGINE = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env['SUPABASE_URL'] = 'https://projet.supabase.test'
  process.env['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiJ9.charge.signature'
  listFactors.mockResolvedValue({ data: { totp: [{ id: 'facteur-1' }], all: [] }, error: null })
  challengeAndVerify.mockResolvedValue({ error: null })
})

afterEach(() => {
  process.env = { ...ORIGINE }
  vi.unstubAllGlobals()
})

describe('connecter — le diagnostic Supabase remonte (#1668)', () => {
  it('LIT quelque chose — une connexion complète rend « ok »', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const { connecter } = await import('./backoffice-auth')
    await expect(connecter('louis@bellum-it.com', 'mdp', '123456')).resolves.toEqual({ etat: 'ok' })
  })

  it('une CLÉ refusée (401 « Invalid API key ») est distinguable dans le diagnostic', async () => {
    signInWithPassword.mockResolvedValue({
      error: { name: 'AuthApiError', status: 401, code: undefined, message: 'Invalid API key' },
    })
    const { connecter } = await import('./backoffice-auth')
    const resultat = await connecter('louis@bellum-it.com', 'mdp', '123456')

    // L'état reste indistinct — c'est lui qui produit le message d'écran.
    expect(resultat.etat).toBe('identifiants_refuses')
    // Mais le diagnostic, lui, nomme la cause : 401 = la clé, pas le compte.
    expect(resultat).toMatchObject({ diagnostic: { statut: 401, message: 'Invalid API key' } })
  })

  it('un MOT DE PASSE faux (400 `invalid_credentials`) porte un diagnostic DIFFÉRENT', async () => {
    signInWithPassword.mockResolvedValue({
      error: { name: 'AuthApiError', status: 400, code: 'invalid_credentials', message: 'Invalid login credentials' },
    })
    const { connecter } = await import('./backoffice-auth')
    const resultat = await connecter('louis@bellum-it.com', 'mdp', '123456')

    expect(resultat.etat).toBe('identifiants_refuses')
    expect(resultat).toMatchObject({ diagnostic: { statut: 400, code: 'invalid_credentials' } })
  })

  it('sait dire NON — sans erreur Supabase, aucun diagnostic n’est inventé', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    listFactors.mockResolvedValue({ data: { totp: [], all: [] }, error: null })
    const { connecter } = await import('./backoffice-auth')
    const resultat = await connecter('louis@bellum-it.com', 'mdp', '123456')

    expect(resultat).toEqual({ etat: 'mfa_absent' })
    expect(resultat).not.toHaveProperty('diagnostic')
  })

  it('un facteur existe et le code est VIDE : refusé sans consommer de défi Supabase', async () => {
    signInWithPassword.mockResolvedValue({ error: null })
    const { connecter } = await import('./backoffice-auth')
    const resultat = await connecter('louis@bellum-it.com', 'mdp', '')

    expect(resultat.etat).toBe('code_refuse')
    expect(challengeAndVerify).not.toHaveBeenCalled()
  })
})

describe('formatCleAnon — quelle clé est posée, sans jamais la rendre (#1668 §3)', () => {
  it('reconnaît une clé legacy, une clé publiable et une clé SECRÈTE mal posée', async () => {
    const { formatCleAnon } = await import('./backoffice-auth')

    process.env['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiJ9.x.y'
    expect(formatCleAnon()).toBe('legacy')

    process.env['SUPABASE_ANON_KEY'] = 'sb_publishable_abcdef'
    expect(formatCleAnon()).toBe('publiable')

    // ⚠️ Une clé `sb_secret_` ici serait une faille : elle contourne le RLS.
    process.env['SUPABASE_ANON_KEY'] = 'sb_secret_abcdef'
    expect(formatCleAnon()).toBe('secrete')

    delete process.env['SUPABASE_ANON_KEY']
    expect(formatCleAnon()).toBe('absente')
  })
})

describe('verifierCleAnon — la clé est-elle acceptée par Supabase ? (#1668 §3)', () => {
  it('200 sur /auth/v1/settings = clé acceptée', async () => {
    const fetchFactice = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchFactice)
    const { verifierCleAnon } = await import('./backoffice-auth')

    await expect(verifierCleAnon()).resolves.toEqual({ etat: 'acceptee' })
    // La clé voyage en en-tête, jamais dans l'URL (elle finirait dans un journal).
    const [url, options] = fetchFactice.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://projet.supabase.test/auth/v1/settings')
    expect((options.headers as Record<string, string>)['apikey']).toBeTruthy()
  })

  it('401 = clé REFUSÉE — c’est ce verdict qui manquait le 07/09', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Invalid API key', { status: 401 })))
    const { verifierCleAnon } = await import('./backoffice-auth')
    await expect(verifierCleAnon()).resolves.toMatchObject({ etat: 'refusee', statut: 401 })
  })

  it('sait dire NON — sans configuration, elle NOMME ce qui manque au lieu de conclure', async () => {
    delete process.env['SUPABASE_ANON_KEY']
    const fetchFactice = vi.fn()
    vi.stubGlobal('fetch', fetchFactice)
    const { verifierCleAnon } = await import('./backoffice-auth')

    await expect(verifierCleAnon()).resolves.toEqual({ etat: 'non_configure', manquantes: ['SUPABASE_ANON_KEY'] })
    expect(fetchFactice).not.toHaveBeenCalled()
  })

  it('un réseau muet n’est pas une clé invalide — « injoignable » n’est pas « refusée »', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    const { verifierCleAnon } = await import('./backoffice-auth')
    await expect(verifierCleAnon()).resolves.toMatchObject({ etat: 'injoignable' })
  })
})
