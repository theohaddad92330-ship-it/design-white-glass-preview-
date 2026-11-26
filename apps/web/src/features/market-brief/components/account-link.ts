import type { ReactNode } from 'react'

/**
 * Le lien vers un compte est fourni par l'écran (routeur) : les blocs restent
 * indépendants du routage. Absent ⇒ le nom s'écrit en texte simple.
 */
export type RenderAccountLink = (accountId: string, children: ReactNode) => ReactNode
