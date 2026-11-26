import { NextResponse, type NextRequest } from 'next/server'
import { autoriser, journaliserAcces, journaliserEchec, lireIdentifiants, reponseEchec } from '@/lib/auth-routes'
import { demarrerEnrolement } from '@/lib/backoffice-auth'
import { enrolementOuvert } from '@/lib/roles-env'
import { COOKIE_ENROLEMENT, DUREE_ENROLEMENT_MS, optionsCookie, signerEnrolement } from '@/lib/session'

/**
 * Premier temps de l'enrôlement TOTP (#1668) : rend le QR code et le secret.
 *
 * POURQUOI CETTE ROUTE EXISTE
 * L'issue demande « TOTP absent → connexion refusée ». Appliqué au pied de la
 * lettre, et comme AUCUN écran d'enrôlement n'existe ailleurs dans le produit,
 * cela voudrait dire que personne ne peut jamais se connecter. La fenêtre
 * `DM_ENROLLMENT_OPEN` est ce qui rend la règle applicable : posée le temps
 * d'enrôler, RETIRÉE ensuite — après quoi plus personne ne peut s'auto-enrôler,
 * même en connaissant le Basic Auth et un mot de passe de la liste.
 *
 * ⚠️ Le mot de passe n'est PAS conservé entre les deux temps. Le formulaire le
 * renvoie à la confirmation ; le cookie ne porte que l'adresse et l'identifiant
 * du facteur, signés. Aucun jeton Supabase ne touche le navigateur.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, motDePasse } = await lireIdentifiants(req)
  if (!email || !motDePasse) {
    return NextResponse.json({ ok: false, error: 'Adresse et mot de passe sont requis.' }, { status: 400 })
  }

  if (!enrolementOuvert()) {
    journaliserAcces('enrolement_refuse', req, { actorEmail: email, reason: 'fenetre_fermee' })
    return NextResponse.json(
      { ok: false, error: 'La fenêtre d’enrôlement est fermée. Demande à un propriétaire de la rouvrir.' },
      { status: 403 },
    )
  }

  const acces = autoriser(email, req)
  if (!acces.ok) return acces.reponse

  const resultat = await demarrerEnrolement(email, motDePasse)
  if (resultat.etat !== 'ok') {
    journaliserEchec('enrolement_refuse', req, email, resultat)
    return reponseEchec(resultat)
  }

  const jeton = await signerEnrolement(email, resultat.facteurId)
  if (!jeton) {
    return NextResponse.json({ ok: false, error: 'Enrôlement impossible à ouvrir côté serveur.' }, { status: 503 })
  }

  journaliserAcces('enrolement_demarre', req, { actorEmail: email })
  // ⚠️ `secret` et `qrCode` sont la GRAINE TOTP : ils ne sont rendus qu'ici,
  // une fois, à qui vient de prouver son mot de passe, et ne sont jamais
  // relus ni stockés côté back-office (Supabase les garde).
  const reponse = NextResponse.json({ ok: true, qrCode: resultat.qrCode, secret: resultat.secret })
  reponse.cookies.set(COOKIE_ENROLEMENT, jeton, optionsCookie(DUREE_ENROLEMENT_MS))
  return reponse
}
