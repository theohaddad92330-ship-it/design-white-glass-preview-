import { z } from 'zod'

/**
 * #4996 (lot L4) — `GET /contacts/account/:id?perimeter=mine|all` : la zone d'un membre sur un compte groupe
 * FILTRE (`mine`) ou ORDONNE (`all`) la liste des contacts, jamais ne l'écrit ni ne la borne (c76 : le rôle change
 * l'ordre, jamais le contenu). Sans le paramètre, la réponse reste le tableau d'avant (ajout seul).
 */
export const CONTACT_PERIMETER_VALUES = ['mine', 'all'] as const

export const contactPerimeterSchema = z.enum(CONTACT_PERIMETER_VALUES)

export const contactPerimeterQuerySchema = z.object({ perimeter: contactPerimeterSchema.optional() })

export type ContactPerimeter = z.infer<typeof contactPerimeterSchema>

/**
 * La réponse avec périmètre. `outside_perimeter_count` : le nombre EXACT de contacts hors de la zone du lecteur,
 * `null` quand le lecteur n'a posé aucune zone d'entité sur le compte (aucun filtre, aucun compteur — une absence
 * ne fait pas de ligne).
 */
export interface AccountContactsPerimeterResponse<Row> {
  contacts: Row[]
  outside_perimeter_count: number | null
}
