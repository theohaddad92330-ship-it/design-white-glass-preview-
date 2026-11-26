import { z } from 'zod'
import { provenanceEntityTypeSchema } from './provenance.js'

/**
 * Notes — la mémoire écrite à la main, empilable et datée.
 *
 * `contacts.note` existait déjà : UNE chaîne libre, écrasée à chaque saisie.
 * Deux commerciaux sur le même compte écrivaient donc l'un sur l'autre, et on
 * ne pouvait pas savoir quand une information avait été apprise — or « le
 * budget est gelé » n'a de valeur que daté.
 *
 * La table est polymorphe (`entityType` + `entityId`) plutôt qu'une colonne par
 * objet : un compte, un contact, un projet, un consultant et une mission
 * appellent tous la même chose, et la première FK dédiée en aurait entraîné
 * cinq autres.
 */

export const noteEntityTypeSchema = provenanceEntityTypeSchema
export type NoteEntityType = z.infer<typeof noteEntityTypeSchema>

/** Borne de longueur : une note est une note, pas un compte rendu. */
export const NOTE_MAX_LENGTH = 10_000

/**
 * #3895 — LA PORTÉE ENTITÉ DU GROUPE (décision Louis 11/10). Une note achats écrite
 * sur Sanofi peut valoir aussi pour Sanofi Pasteur : l'auteur le DIT (rattachement
 * explicite), le produit ne l'infère jamais. Seules les entités du MÊME groupe
 * (même tête capitalistique) sont acceptées — le service l'impose.
 */
export const NOTE_GROUP_SCOPE_MAX = 20

const groupScopeIdsSchema = z
  .array(z.string().guid())
  .max(NOTE_GROUP_SCOPE_MAX)
  .refine(ids => new Set(ids).size === ids.length, { message: 'Entités en double' })

export const noteScopeAccountSchema = z.object({ id: z.string().guid(), name: z.string() })
export type NoteScopeAccount = z.infer<typeof noteScopeAccountSchema>

export const noteSchema = z.object({
  id: z.string().guid(),
  entityType: noteEntityTypeSchema,
  entityId: z.string().guid(),
  body: z.string(),
  authorId: z.string().guid().nullable(),
  /** Nom affichable de l'auteur, résolu côté serveur. `null` quand le membre a
   *  quitté l'espace — l'écran affiche « Auteur inconnu », jamais un id brut. */
  authorName: z.string().nullable(),
  /** Épinglée en tête de la fiche. Le reste est antéchronologique. */
  pinned: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** #3895 — les AUTRES entités du groupe pour lesquelles l'auteur a dit que la note vaut. */
  alsoAppliesTo: z.array(noteScopeAccountSchema).default([]),
  /** #3895 — quand la note est lue depuis une entité qui n'est pas celle où elle a été écrite :
   *  l'entité d'origine. `null` pour une note écrite ici. */
  inheritedFrom: noteScopeAccountSchema.nullable().default(null),
})
export type Note = z.infer<typeof noteSchema>

export const createNoteSchema = z
  .object({
    entityType: noteEntityTypeSchema,
    entityId: z.string().guid(),
    body: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
    pinned: z.boolean().optional(),
    /** #3895 — compte seulement ; jamais le compte lui-même. */
    alsoAppliesToAccountIds: groupScopeIdsSchema.optional(),
  })
  .strict()
  .refine(value => value.alsoAppliesToAccountIds === undefined || value.entityType === 'account', {
    message: 'La portée groupe ne concerne que les notes de compte',
    path: ['alsoAppliesToAccountIds'],
  })
  .refine(value => !value.alsoAppliesToAccountIds?.includes(value.entityId), {
    message: 'Le compte de la note ne se liste pas lui-même',
    path: ['alsoAppliesToAccountIds'],
  })
export type CreateNoteInput = z.infer<typeof createNoteSchema>

export const updateNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(NOTE_MAX_LENGTH).optional(),
    pinned: z.boolean().optional(),
    alsoAppliesToAccountIds: groupScopeIdsSchema.optional(),
  })
  .strict()
  .refine(
    value => value.body !== undefined || value.pinned !== undefined || value.alsoAppliesToAccountIds !== undefined,
    {
      message: 'Rien à modifier',
    },
  )
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>

export const listNotesQuerySchema = z
  .object({
    entityType: noteEntityTypeSchema,
    entityId: z.string().guid(),
  })
  .strict()
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>
