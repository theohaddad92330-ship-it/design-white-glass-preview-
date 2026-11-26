import { z } from 'zod'
import { cockpitProvenanceSchema } from './dashboard.js'

/**
 * LA RESTITUTION APRÈS UN IMPORT — « BellumAI ne repart pas de zéro » (#2080).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le panneau rendait cinq blocs, quatre d'entre eux à `null` : la règle « non
 * mesuré n'est pas mesuré à zéro » était tenue, mais rien n'était mesuré. Les
 * points #2080.3 / .4 / .6 / .7 / .8 demandaient chacun une LECTURE, et la
 * décision du 16/09/2026 les traite d'un seul lot — parce que cinq
 * branchements séparés auraient produit cinq façons de dire « je ne sais pas ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'UN BLOC PROMET
 * ─────────────────────────────────────────────────────────────────────────────
 * `value: null` veut dire « non mesuré », JAMAIS « zéro ». La différence n'est
 * pas de nuance : « aucun rendez-vous cette semaine » et « ton agenda n'est pas
 * branché » appellent deux gestes opposés. `provenance.sources` porte le
 * POURQUOI — une liste vide dit qu'aucune source n'a pu être lue — et
 * `provenance.computed_at` la date, parce qu'un nombre sans date est un nombre
 * dont on ne sait pas s'il est d'aujourd'hui.
 *
 * On réutilise `cockpitProvenanceSchema` plutôt que d'inventer une deuxième
 * forme de provenance : deux formes, ce serait deux vocabulaires de sources qui
 * divergent, et un écran qui nomme « ta messagerie » là où l'autre nomme
 * « mailbox ».
 *
 * ⚠️ Un compte affiché ici est un COMPTE, pas une part de marché : ces nombres
 * mesurent ce que TON espace SAIT, jamais ce que le marché fait.
 */
export const restitutionBlockSchema = z.object({
  /** Le nombre mesuré. `null` = non mesuré — jamais un zéro de remplissage. */
  value: z.number().int().min(0).nullable(),
  provenance: cockpitProvenanceSchema,
})

/**
 * Les cinq blocs du panneau qui demandaient une lecture.
 *
 * `contradictions` est le questionnaire avec LUI-MÊME
 * (`detectQuestionnaireContradictions`) — pas un croisement de l'import avec le
 * questionnaire, qui n'existe pas et ne s'invente pas.
 */
export const restitutionSummarySchema = z.object({
  relations: restitutionBlockSchema,
  upcoming: restitutionBlockSchema,
  meetings: restitutionBlockSchema,
  missing_data: restitutionBlockSchema,
  contradictions: restitutionBlockSchema,
})

export type RestitutionBlock = z.infer<typeof restitutionBlockSchema>
export type RestitutionSummary = z.infer<typeof restitutionSummarySchema>

/**
 * L'HORIZON des blocs « à venir », en jours — un seul nombre, un seul endroit.
 *
 * Il borne les prochaines échéances ET les rendez-vous. Deux constantes
 * auraient divergé au premier ajustement, et le panneau aurait annoncé « 3
 * échéances » sur trente jours à côté de « 2 rendez-vous » sur quatorze, sans
 * que rien ne le dise (GA-26).
 */
export const RESTITUTION_HORIZON_DAYS = 30
