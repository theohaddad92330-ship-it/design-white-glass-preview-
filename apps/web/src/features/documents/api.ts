import { config } from '@/lib/api'
import { apiBase } from '@/lib/api-origin'

/**
 * Le téléchargement d'un livrable.
 *
 * `fetch` avec les cookies plutôt qu'un simple `<a href>` : l'API vit sur un
 * autre hôte que la SPA en production, et un lien nu n'emporterait pas la
 * session. Le fichier est reconstruit côté navigateur puis relâché — sans
 * `revokeObjectURL`, chaque téléchargement laisserait le fichier en mémoire
 * jusqu'au rechargement de la page.
 *
 * Le nom du fichier vient de l'en-tête `Content-Disposition` du serveur, qui
 * l'a construit à partir du nom du compte. Le deviner côté client donnerait
 * deux noms différents pour un même document.
 */
export async function downloadDocument(path: string, fallbackName: string): Promise<void> {
  const response = await fetch(`${apiBase()}${path}`, { credentials: 'include' })
  if (!response.ok) throw new Error(`Téléchargement impossible (${response.status})`)

  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename="([^"]+)"/.exec(disposition)
  const name = match?.[1] ?? fallbackName

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
