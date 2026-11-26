import { NextResponse, type NextRequest } from 'next/server'
import { journaliserAcces } from '@/lib/auth-routes'
import { operateurDeLaRequete } from '@/lib/guard'
import { COOKIE_ENROLEMENT, COOKIE_SESSION } from '@/lib/session'

/**
 * « Déconnexion explicite disponible » (#1668).
 *
 * Le cookie est la seule trace de la session — le retirer la termine, sans état
 * serveur à nettoyer. Répond 200 même sans session : se déconnecter deux fois
 * n'est pas une erreur.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const operateur = await operateurDeLaRequete(req)
  if (operateur) journaliserAcces('deconnexion', req, { actorEmail: operateur.email })

  const reponse = NextResponse.json({ ok: true })
  reponse.cookies.delete(COOKIE_SESSION)
  reponse.cookies.delete(COOKIE_ENROLEMENT)
  return reponse
}
