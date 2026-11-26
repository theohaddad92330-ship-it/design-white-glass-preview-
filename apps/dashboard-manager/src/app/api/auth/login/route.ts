import { NextResponse, type NextRequest } from 'next/server'
import {
  autoriser,
  journaliser,
  journaliserAcces,
  journaliserEchec,
  lireIdentifiants,
  reponseEchec,
} from '@/lib/auth-routes'
import { connecter } from '@/lib/backoffice-auth'
import { COOKIE_SESSION, DUREE_SESSION_MS, optionsCookie, signerSession } from '@/lib/session'

/**
 * La connexion du back-office : adresse autorisée + mot de passe + code TOTP,
 * en UNE requête (#1668).
 *
 * ⚠️ Un échange en deux temps (mot de passe, puis code) aurait obligé à garder
 * un jeton Supabase entre les deux — c'est-à-dire à poser dans un cookie
 * exactement ce que le second facteur est censé protéger.
 *
 * ⚠️ LE CODE N'EST PAS EXIGÉ ICI, ET C'EST VOULU. Exiger six chiffres avant
 * même de savoir si un facteur existe rendait la TOUTE PREMIÈRE connexion
 * impossible — celle qui mène justement à l'enrôlement (mesuré en recette le
 * 07/09 : le seul contournement était de taper `000000`). C'est `connecter()`
 * qui décide, une fois la liste des facteurs lue : aucun facteur → 409
 * `mfa_absent` (l'écran propose l'enrôlement), un facteur → le code redevient
 * obligatoire et un code vide est refusé. Un code vide n'ouvre jamais rien.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, motDePasse, code } = await lireIdentifiants(req)
  if (!email || !motDePasse) {
    return NextResponse.json({ ok: false, error: 'Adresse et mot de passe sont requis.' }, { status: 400 })
  }

  const acces = autoriser(email, req)
  if (!acces.ok) return acces.reponse

  const resultat = await connecter(email, motDePasse, code)
  if (resultat.etat !== 'ok') {
    journaliserEchec('connexion_refusee', req, email, resultat)
    return reponseEchec(resultat)
  }

  const jeton = await signerSession(email)
  if (!jeton) {
    // `INTERNAL_API_SECRET` absente : rien ne peut être signé, donc rien ne doit
    // s'ouvrir. Le back-office ne sert de toute façon aucune donnée sans elle.
    journaliser('backoffice.session_non_signable', { email })
    return NextResponse.json({ ok: false, error: 'Session impossible à ouvrir côté serveur.' }, { status: 503 })
  }

  journaliserAcces('connexion', req, { actorEmail: email, actorRole: acces.role })
  const reponse = NextResponse.json({ ok: true, email, role: acces.role })
  reponse.cookies.set(COOKIE_SESSION, jeton, optionsCookie(DUREE_SESSION_MS))
  return reponse
}
