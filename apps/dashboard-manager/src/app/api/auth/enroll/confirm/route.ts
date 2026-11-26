import { NextResponse, type NextRequest } from 'next/server'
import { autoriser, journaliserAcces, journaliserEchec, lireIdentifiants, reponseEchec } from '@/lib/auth-routes'
import { confirmerEnrolement } from '@/lib/backoffice-auth'
import { enrolementOuvert } from '@/lib/roles-env'
import {
  COOKIE_ENROLEMENT,
  COOKIE_SESSION,
  DUREE_SESSION_MS,
  lireEnrolement,
  optionsCookie,
  signerSession,
} from '@/lib/session'

/**
 * Second temps de l'enrôlement (#1668) : le code prouve que le téléphone porte
 * bien la graine, et la session s'ouvre dans la foulée.
 *
 * ⚠️ L'ADRESSE VIENT DU COOKIE SIGNÉ, PAS DU CORPS. Sinon on pourrait démarrer
 * un enrôlement sur son propre compte et le confirmer sur celui d'un autre.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { motDePasse, code } = await lireIdentifiants(req)
  if (!motDePasse || !code) {
    return NextResponse.json({ ok: false, error: 'Mot de passe et code sont requis.' }, { status: 400 })
  }

  if (!enrolementOuvert()) {
    return NextResponse.json({ ok: false, error: 'La fenêtre d’enrôlement est fermée.' }, { status: 403 })
  }

  const enrolement = await lireEnrolement(req.cookies.get(COOKIE_ENROLEMENT)?.value)
  if (!enrolement) {
    return NextResponse.json(
      { ok: false, error: 'Enrôlement expiré — recommence pour obtenir un nouveau QR code.' },
      { status: 400 },
    )
  }

  const acces = autoriser(enrolement.email, req)
  if (!acces.ok) return acces.reponse

  const resultat = await confirmerEnrolement(enrolement.email, motDePasse, enrolement.facteurId, code)
  if (resultat.etat !== 'ok') {
    journaliserEchec('enrolement_refuse', req, enrolement.email, resultat)
    return reponseEchec(resultat)
  }

  const jeton = await signerSession(enrolement.email)
  if (!jeton) {
    return NextResponse.json({ ok: false, error: 'Session impossible à ouvrir côté serveur.' }, { status: 503 })
  }

  journaliserAcces('enrolement_confirme', req, { actorEmail: enrolement.email, actorRole: acces.role })
  const reponse = NextResponse.json({ ok: true, email: enrolement.email, role: acces.role })
  reponse.cookies.set(COOKIE_SESSION, jeton, optionsCookie(DUREE_SESSION_MS))
  reponse.cookies.delete(COOKIE_ENROLEMENT)
  return reponse
}
