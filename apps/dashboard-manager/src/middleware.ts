import { NextResponse, type NextRequest } from 'next/server'
import { estUnEcranProprietaire, normaliserEmail } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION, DUREE_SESSION_MS, lireSession, optionsCookie, signerSession } from '@/lib/session'

/**
 * Access gate for the whole dashboard-manager backoffice.
 *
 * WHY: this app is a cross-tenant super-admin console (it can read/modify every
 * user, plan and workspace). Its production `*.vercel.app` URL is NOT covered by
 * Vercel's free "Standard Protection" (which only gates preview/deployment URLs,
 * not the assigned production domain), so without this middleware the URL is
 * publicly reachable.
 *
 * DEUX RIDEAUX, DANS CET ORDRE (#1668)
 *
 *  1. **Basic Auth**, inchangé, fail closed. « Le Basic Auth reste en place
 *     pendant la transition, en second rideau. On l'enlève quand les deux
 *     comptes sont opérationnels avec TOTP. » Il ne bouge pas d'une ligne.
 *  2. **L'identité**, PAR-DESSUS : une adresse de `DM_ALLOWED_EMAILS`, un mot de
 *     passe Supabase et un code TOTP, matérialisés par un cookie signé de 8 h.
 *
 * ⚠️ ABSENTE ≠ VIDE, et c'est ce qui rend ce lot livrable sans risque
 * de verrouillage :
 *  - `DM_ALLOWED_EMAILS` **absente** → le second rideau n'existe pas, le chemin
 *    est byte-identique à celui d'avant ce commit. Retirer la variable EST le
 *    retour arrière, et il prend une minute sur Vercel.
 *  - **posée mais ne donnant aucune adresse** → 503, comme le demande T4 de
 *    l'issue. Une configuration écrite qui ne dit rien est une erreur, pas un mode.
 *
 * ⚠️ LE RÔLE SE RELIT ICI, PAS DANS LE COOKIE (#1669). Le jeton ne porte que
 * l'e-mail ; le rôle vient de `DM_ALLOWED_EMAILS` à chaque requête. Rétrograder
 * quelqu'un prend donc effet au déploiement suivant, sans attendre huit heures.
 *
 * Runs on the Edge runtime — use `atob` (no Node `Buffer`), et Web Crypto pour
 * la signature du cookie.
 */
function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time-ish compare so a wrong password can't be probed byte-by-byte
  // via response timing. Length is intentionally leaked (acceptable here).
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Ce qui doit rester atteignable SANS session — sinon on ne peut plus se
 * connecter, et la console se ferme à tout le monde.
 */
const CHEMINS_PUBLICS = [
  '/login',
  '/api/auth/login',
  '/api/auth/enroll',
  '/api/auth/logout',
  // ⚠️ Le diagnostic doit être atteignable QUAND PLUS PERSONNE NE PEUT ENTRER —
  // c'est sa seule raison d'être. Le mettre derrière la session le rendrait
  // inutile exactement le jour où on en a besoin. Il reste derrière le Basic
  // Auth et ne rend ni clé, ni URL de projet, ni adresse.
  '/api/auth/diagnostic',
]

function estPublic(chemin: string): boolean {
  return CHEMINS_PUBLICS.some(base => chemin === base || chemin.startsWith(`${base}/`))
}

function basicAuthRefuse(req: NextRequest): NextResponse | null {
  const expectedUser = process.env['DM_BASIC_AUTH_USER']
  const expectedPass = process.env['DM_BASIC_AUTH_PASSWORD']

  // Fail closed when unconfigured — never serve the backoffice open.
  if (!expectedUser || !expectedPass) {
    return new NextResponse('Backoffice non configuré : authentification manquante.', { status: 503 })
  }

  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    let decoded = ''
    try {
      decoded = atob(header.slice('Basic '.length))
    } catch {
      decoded = ''
    }
    const sep = decoded.indexOf(':')
    if (sep !== -1) {
      const user = decoded.slice(0, sep)
      const pass = decoded.slice(sep + 1)
      if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, expectedPass)) {
        return null
      }
    }
  }

  return new NextResponse('Authentification requise.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BellumAI Backoffice", charset="UTF-8"' },
  })
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const refusBasic = basicAuthRefuse(req)
  if (refusBasic) return refusBasic

  const liste = listeDacces()
  // Le chemin d'avant ce commit, à la ligne près : aucune lecture de cookie,
  // aucune signature, aucun en-tête ajouté.
  if (liste.etat === 'absente') return NextResponse.next()
  if (liste.etat === 'vide') {
    return new NextResponse('Backoffice non configuré : DM_ALLOWED_EMAILS est posée mais ne donne aucune adresse.', {
      status: 503,
    })
  }

  const chemin = req.nextUrl.pathname
  if (estPublic(chemin)) return NextResponse.next()

  const session = await lireSession(req.cookies.get(COOKIE_SESSION)?.value)
  const role = session ? liste.roles.get(normaliserEmail(session.email)) : undefined

  // Session absente, expirée, ou adresse retirée de la liste depuis l'émission.
  if (!session || !role) {
    if (chemin.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'Session expirée — reconnecte-toi.' }, { status: 401 })
    }
    const versLogin = req.nextUrl.clone()
    versLogin.pathname = '/login'
    versLogin.search = `?suite=${encodeURIComponent(chemin + req.nextUrl.search)}`
    const redirection = NextResponse.redirect(versLogin)
    redirection.cookies.delete(COOKIE_SESSION)
    return redirection
  }

  // La trésorerie est le seul écran fermé en LECTURE (#1669, arbitrage du 07/09).
  if (role !== 'owner' && estUnEcranProprietaire(chemin)) {
    const versRefus = req.nextUrl.clone()
    versRefus.pathname = '/acces-refuse'
    versRefus.search = `?ecran=${encodeURIComponent(chemin)}`
    return NextResponse.redirect(versRefus)
  }

  // « Renouvelée à l'activité » : chaque requête repousse l'échéance de 8 h.
  // Huit heures sans rien toucher et le cookie est mort — c'est la même
  // signature qui porte la date, donc rien à invalider côté serveur.
  const reponse = NextResponse.next()
  const renouvele = await signerSession(session.email)
  if (renouvele) reponse.cookies.set(COOKIE_SESSION, renouvele, optionsCookie(DUREE_SESSION_MS))
  return reponse
}

export const config = {
  // Gate everything except Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
