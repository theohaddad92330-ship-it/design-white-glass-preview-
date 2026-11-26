import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La route de diagnostic doit RÉPONDRE À LA QUESTION sans jamais rendre un
 * secret (#1668 §3).
 *
 * Les deux moitiés, toutes deux nécessaires : sans la première, la route ne
 * sert à rien ; sans la seconde, elle est une fuite.
 */

const verifierCleAnon = vi.fn()

vi.mock('@/lib/backoffice-auth', async () => {
  const reel = await vi.importActual<typeof import('@/lib/backoffice-auth')>('@/lib/backoffice-auth')
  return { formatCleAnon: reel.formatCleAnon, verifierCleAnon: () => verifierCleAnon() }
})

const ORIGINE = { ...process.env }
const CLE = 'eyJhbGciOiJIUzI1NiJ9.charge-secrete-que-rien-ne-doit-rendre.signature'

beforeEach(() => {
  vi.clearAllMocks()
  process.env['SUPABASE_URL'] = 'https://projet.supabase.test'
  process.env['SUPABASE_ANON_KEY'] = CLE
  process.env['DM_ALLOWED_EMAILS'] = 'theo@bellum-it.com:owner,louis@bellum-it.com:operator'
  process.env['INTERNAL_API_SECRET'] = 'secret-de-test-suffisamment-long-pour-etre-realiste'
  verifierCleAnon.mockResolvedValue({ etat: 'acceptee' })
})

afterEach(() => {
  process.env = { ...ORIGINE }
})

async function lire() {
  const { GET } = await import('./route')
  const reponse = await GET()
  const texte = await reponse.text()
  return { statut: reponse.status, texte, corps: JSON.parse(texte) as Record<string, unknown> }
}

describe('GET /api/auth/diagnostic (#1668 §3)', () => {
  it('LIT quelque chose — elle nomme la forme de la clé et le verdict de Supabase', async () => {
    const { statut, corps } = await lire()

    expect(statut).toBe(200)
    expect(corps['formatCleAnon']).toBe('legacy')
    expect(corps['cleAnon']).toEqual({ etat: 'acceptee' })
    expect(corps['listeDacces']).toEqual({ etat: 'posee', adresses: 2 })
    expect(corps['supabaseUrl']).toBe('posee')
  })

  it('la CAUSE cherchée le 07/09 est lisible d’un coup d’œil : clé legacy REFUSÉE', async () => {
    verifierCleAnon.mockResolvedValue({ etat: 'refusee', statut: 401, message: 'Invalid API key' })
    const { corps } = await lire()

    expect(corps['formatCleAnon']).toBe('legacy')
    expect(corps['cleAnon']).toMatchObject({ etat: 'refusee', statut: 401 })
  })

  it('ne rend JAMAIS la clé, ni l’URL du projet, ni une adresse de la liste', async () => {
    const { texte } = await lire()

    expect(texte).not.toContain(CLE)
    expect(texte).not.toContain('charge-secrete')
    expect(texte).not.toContain('projet.supabase.test')
    expect(texte).not.toContain('bellum-it.com')
    expect(texte).not.toContain('secret-de-test')
  })

  it('sait dire NON — couche éteinte et couche mal posée ne se ressemblent pas', async () => {
    delete process.env['DM_ALLOWED_EMAILS']
    expect((await lire()).corps['listeDacces']).toEqual({ etat: 'absente' })

    vi.resetModules()
    process.env['DM_ALLOWED_EMAILS'] = ' , '
    expect((await lire()).corps['listeDacces']).toEqual({ etat: 'vide' })
  })
})
