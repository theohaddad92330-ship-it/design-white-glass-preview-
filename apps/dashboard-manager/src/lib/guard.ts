import { journaliserAcces } from '@/lib/auth-routes'
import { NextResponse, type NextRequest } from 'next/server'
import { normaliserEmail, peut, type Capability, type Role } from '@/lib/roles'
import { listeDacces } from '@/lib/roles-env'
import { COOKIE_SESSION, lireSession } from '@/lib/session'

/**
 * La porte des rôles, CÔTÉ SERVEUR (#1669).
 *
 * « Le rôle est vérifié CÔTÉ API, pas seulement à l'écran. Un viewer qui appelle
 * /api/admin/users/x/delete reçoit 403, même s'il n'a pas le bouton. »
 *
 * POURQUOI ICI ET PAS DANS LE MIDDLEWARE SEUL
 * Le middleware sait qui parle ; il ne sait pas ce que la requête va FAIRE.
 * `/api/admin/users/x/delete` et `/api/admin/users/x/suspend` se ressemblent et
 * n'exigent pas le même rôle. La capacité se déclare donc là où le geste vit —
 * dans le gestionnaire de route, en une ligne, et la garde
 * `toute-route-declare-sa-capacite.test.ts` refuse celui qui l'oublierait.
 *
 * ⚠️ ON NE FAIT PAS CONFIANCE À UN EN-TÊTE POSÉ PAR LE MIDDLEWARE. La session
 * est relue et re-vérifiée ici, à partir du cookie signé. Un en-tête « x-dm-role »
 * serait un champ que le navigateur peut écrire dès qu'on oublie de le retirer
 * une fois — et c'est exactement le genre d'oubli qu'on ne voit jamais.
 *
 * ⚠️ COUCHE INERTE = COMPORTEMENT D'AVANT. Sans `DM_ALLOWED_EMAILS`, il n'y a
 * pas d'identité, donc pas de rôle à opposer : la porte laisse passer, comme
 * avant ce commit. C'est le Basic Auth qui garde, seul, exactement comme hier.
 */

type Operateur = { email: string; role: Role }

/**
 * Qui parle, et avec quel rôle. `null` quand la couche d'identité est éteinte
 * OU que la session ne vaut rien — les deux se distinguent par `listeDacces()`.
 */
export async function operateurDepuisJeton(jeton: string | undefined): Promise<Operateur | null> {
  const liste = listeDacces()
  if (liste.etat !== 'active') return null
  const session = await lireSession(jeton)
  if (!session) return null
  const email = normaliserEmail(session.email)
  // ⚠️ Le rôle vient de la LISTE, jamais du jeton : une rétrogradation prend
  // effet au déploiement suivant, sans attendre huit heures (#1669).
  const role = liste.roles.get(email)
  return role ? { email, role } : null
}

export async function operateurDeLaRequete(req: NextRequest): Promise<Operateur | null> {
  return operateurDepuisJeton(req.cookies.get(COOKIE_SESSION)?.value)
}

/**
 * Rend une réponse d'ERREUR quand la capacité manque, `null` quand le geste
 * peut se faire. À appeler en PREMIÈRE ligne du gestionnaire :
 *
 *     const refus = await exigerCapacite(req, 'users.delete')
 *     if (refus) return refus
 */
export async function exigerCapacite(req: NextRequest, capacite: Capability): Promise<NextResponse | null> {
  const liste = listeDacces()

  // La couche est éteinte : le chemin d'avant, à l'octet près.
  if (liste.etat === 'absente') return null
  if (liste.etat === 'vide') {
    return NextResponse.json(
      { ok: false, error: 'Back-office non configuré : DM_ALLOWED_EMAILS ne donne aucune adresse.' },
      { status: 503 },
    )
  }

  const operateur = await operateurDeLaRequete(req)
  if (!operateur) {
    return NextResponse.json({ ok: false, error: 'Session expirée — reconnecte-toi.' }, { status: 401 })
  }

  if (!peut(operateur.role, capacite)) {
    // Journalisé : un refus de droit est le signal qu'on veut voir passer, et
    // l'adresse est déjà celle d'un opérateur authentifié, pas d'un client.
    //
    // ⚠️ Cette ligne recopiait `console.warn(JSON.stringify(…))` au lieu
    // d'appeler la porte du journal — exactement le défaut que le docblock
    // d'`auth-routes.ts` dénonce : une décision recopiée diverge à la première
    // correction. Elle a d'ailleurs divergé : ce refus n'était nulle part dans
    // le journal d'accès (#1671.2).
    journaliserAcces('capacite_refusee', req, {
      actorEmail: operateur.email,
      actorRole: operateur.role,
      target: capacite,
    })
    return NextResponse.json(
      { ok: false, error: `Ton rôle (${operateur.role}) n’autorise pas ce geste.` },
      { status: 403 },
    )
  }

  return null
}

/**
 * L'identité Basic-Auth de l'opérateur qui parle, pour la forwarder comme
 * `actor` à l'API (le journal d'audit de l'API sait alors QUI a agi, jamais
 * un jeton utilisateur). Extrait le 28/09/2026 (#2445.12) : `analyses/[id]
 * /stop/route.ts` la portait seule — une SECONDE écriture aurait divergé à
 * la première correction (GA-26).
 */
export function acteurDepuisBasicAuth(req: NextRequest): string {
  const header = req.headers.get('authorization') ?? ''
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
      const sep = decoded.indexOf(':')
      const user = sep === -1 ? decoded : decoded.slice(0, sep)
      if (user) return user
    } catch {
      /* fall through to default */
    }
  }
  return 'backoffice'
}
