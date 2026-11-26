import { type NextRequest } from 'next/server'
import { operateurDeLaRequete } from '@/lib/guard'

/**
 * QUI a fait le geste — le nom qui part dans le journal d'audit de l'API.
 *
 * DEUX SOURCES, DANS CET ORDRE (#1668)
 *  1. **L'e-mail authentifié**, quand la couche d'identité est allumée. C'est la
 *     demande de l'issue mot pour mot : « L'email authentifié est propagé à
 *     CHAQUE appel d'API admin, et il devient l'auteur dans le journal d'audit ».
 *     Avant lui, le journal disait « quelqu'un » : un seul couple Basic Auth
 *     partagé ne distingue personne.
 *  2. **Le nom d'utilisateur du Basic Auth**, tant que la couche est éteinte —
 *     le comportement d'avant, conservé tel quel.
 *
 * Repli `backoffice` quand l'en-tête est absent ou illisible.
 */
export async function actorFromRequest(req: NextRequest): Promise<string> {
  const operateur = await operateurDeLaRequete(req)
  if (operateur) return operateur.email

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
