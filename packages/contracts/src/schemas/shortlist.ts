import { z } from 'zod'
import { SHORTLIST_MAX } from './match.js'

/**
 * La SHORTLIST (PDF 4 §9, ticket BEL-MTC-302).
 *
 * Le dépôt n'avait pas d'objet shortlist : `shortlisted` n'était qu'une étape
 * d'un positionnement, si bien qu'on ne pouvait pas répondre à « qu'est-ce qui a
 * été proposé, et quand ? ». C'est pourtant la question que pose un client trois
 * semaines plus tard, et celle que pose un manager quand rien n'avance.
 *
 * Trois propriétés, chacune contre une erreur précise :
 *
 *  - **plafonnée à cinq.** « Une shortlist de 12 n'est pas une shortlist » : au
 *    delà, on ne sélectionne plus, on transfère la sélection au client.
 *  - **FIGÉE à la création.** La fiche courte de chaque profil est recopiée, pas
 *    référencée : le vivier continue d'évoluer, et sans copie on ne saurait plus
 *    ce qui a été proposé — seulement ce qui est vrai aujourd'hui.
 *  - **modifiable par DUPLICATION seulement.** Éditer en place effacerait la
 *    trace de ce qui a été envoyé. Une v2 se crée, la v1 reste lisible.
 */

export const SHORTLIST_STATUSES = ['draft', 'shared'] as const
export const shortlistStatusSchema = z.enum(SHORTLIST_STATUSES)

/**
 * La fiche COURTE d'un profil dans une shortlist (§9.1).
 *
 * Trois preuves, pas plus : au-delà, personne ne lit. Une preuve manquante
 * laisse la liste plus courte plutôt que d'être complétée par une phrase creuse.
 */
export const shortlistEntrySchema = z.object({
  consultantId: z.string().guid(),
  /** Recopié au moment de la création — le nom d'aujourd'hui, pas celui de demain. */
  fullName: z.string(),
  title: z.string().nullable(),
  rank: z.number().int().min(1),
  correspondenceScore: z.number().int().min(0).max(100),
  pushableScore: z.number().int().min(0).max(100),
  /** Les compétences RETENUES, avec leur preuve. */
  skills: z.array(z.object({ label: z.string(), level: z.string().nullable(), source: z.string().nullable() })),
  /** La phrase de disponibilité, telle que l'axe l'a écrite. */
  availability: z.string(),
  /** TJM en centimes. `null` = non renseigné ou masqué — jamais 0. */
  dailyRateCents: z.number().int().nonnegative().nullable(),
  proofs: z.array(z.string()).max(3),
  gaps: z.array(z.string()),
})
export type ShortlistEntry = z.infer<typeof shortlistEntrySchema>

export const shortlistSchema = z.object({
  id: z.string().guid(),
  needId: z.string().guid().nullable(),
  needRole: z.string(),
  accountName: z.string().nullable(),
  status: shortlistStatusSchema,
  /** L'exécution de matching dont elle est issue, quand elle en a une. */
  sourceRunId: z.string().guid().nullable(),
  /** La shortlist dont celle-ci est une copie. C'est la seule façon de la modifier. */
  duplicatedFrom: z.string().guid().nullable(),
  entries: z.array(shortlistEntrySchema),
  /**
   * #2320.17 (épopée #2967) — les profils NON ÉVALUABLES du run au moment de
   * la création, figés ici. Sans cette copie, rien ne prouve que la personne
   * qui a composé la shortlist a VU les inconnues avant de choisir — un
   * tableau vide est un fait mesuré (« aucune inconnue à cette date »),
   * jamais une absence de revue.
   */
  reviewedUnknownIds: z.array(z.string().guid()),
  createdAt: z.string(),
  createdBy: z.string().guid().nullable(),
})
export type Shortlist = z.infer<typeof shortlistSchema>

export const createShortlistSchema = z
  .object({
    runId: z.string().guid().nullish(),
    /** Au plus cinq — refusé au-delà, avec un message qui dit pourquoi. */
    consultantIds: z.array(z.string().guid()).min(1).max(SHORTLIST_MAX),
  })
  .strict()
export type CreateShortlist = z.infer<typeof createShortlistSchema>
