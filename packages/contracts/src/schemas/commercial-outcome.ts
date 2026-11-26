import { z } from 'zod'

/**
 * #2126.47/.48/.50/.51/.53/.54/.55/.60 (épopée #2787) — L'OUTCOME COMMERCIAL.
 *
 * Le geste empêché avant ce fichier : aucun endroit du produit ne permettait
 * d'enregistrer NOMMÉMENT ce qu'un compte ou un contact a produit — une
 * relation qualifiée, un partenaire jugé pertinent ou non, un contact qui
 * s'avère incorrect, un message qui obtient une réponse, un consultant
 * positionné, un refus. #2126 le demandait par un champ ; c'est un OBJET,
 * parce qu'il doit survivre à la fiche qu'il commente (#2126.60 — un outcome
 * ne réécrit JAMAIS rétroactivement une preuve historique : il s'AJOUTE au
 * dossier, il ne corrige aucune ligne passée).
 *
 * Sept valeurs, jamais six : #2126.48 (« partenaire pertinent OU NON ») est
 * un DOUBLE bipolaire, pas un champ optionnel sur un type unique — un outcome
 * enregistré est toujours un FAIT ponctuel et daté, jamais un champ qu'on
 * réécrit (même raison que #2126.60).
 *
 * `reason` est LIBRE (#2126.55) : contrairement à un statut fermé, la raison
 * d'un refus ou d'un contact incorrect ne se laisse pas enfermer dans une
 * liste sans en perdre le sens — c'est un COMMENTAIRE qui accompagne le fait,
 * jamais un second fait qui pèserait dans un calcul.
 *
 * GA-08 — un enum ne perd jamais de valeur et n'en insère jamais au milieu :
 * une septième valeur s'ajoute EN FIN de {@link COMMERCIAL_OUTCOME_TYPES}.
 */
export const COMMERCIAL_OUTCOME_TYPES = [
  /** #2126.47 — la relation avec ce contact est jugée qualifiée. */
  'qualified_relationship',
  /** #2126.48 — ce partenaire (ESN, éditeur, apporteur d'affaires…) est pertinent. */
  'partner_relevant',
  /** #2126.48 — ce partenaire n'est PAS pertinent. Distinct de `declined` : un
   *  partenaire écarté n'a pas forcément refusé quoi que ce soit. */
  'partner_not_relevant',
  /** #2126.50 — la fiche désigne la mauvaise personne (poste quitté, homonyme,
   *  coordonnée fausse) — distinct d'un simple refus de répondre. */
  'incorrect_contact',
  /** #2126.51 — un message envoyé a obtenu une réponse. */
  'message_replied',
  /** #2126.53 — un consultant a été positionné grâce à ce contact/compte. */
  'consultant_positioned',
  /** #2126.54 — refus explicite (offre, mise en relation, rendez-vous…). */
  'declined',
] as const
export const commercialOutcomeTypeSchema = z.enum(COMMERCIAL_OUTCOME_TYPES)
export type CommercialOutcomeType = z.infer<typeof commercialOutcomeTypeSchema>

/**
 * #2126.60 — le ledger est APPEND-ONLY par construction : ce contrat ne
 * déclare ni schéma de mise à jour ni schéma de suppression, et
 * `outcomes.controller.ts` ne porte que `POST` et `GET`. Rien n'écrase une
 * ligne passée ; une correction s'exprime en enregistrant un NOUVEL outcome,
 * daté, jamais en réécrivant l'ancien.
 */
export const commercialOutcomeSchema = z.object({
  id: z.string().guid(),
  accountId: z.string().guid(),
  /** `null` — un outcome de PARTENARIAT (#2126.48) ou de refus peut porter sur
   *  le compte entier, sans contact précis. */
  contactId: z.string().guid().nullable(),
  type: commercialOutcomeTypeSchema,
  reason: z.string().trim().min(1).max(2000).nullable(),
  recordedBy: z.string().guid(),
  recordedAt: z.string(),
})
export type CommercialOutcome = z.infer<typeof commercialOutcomeSchema>

export const createCommercialOutcomeSchema = z
  .object({
    contactId: z.string().guid().nullish(),
    type: commercialOutcomeTypeSchema,
    reason: z.string().trim().min(1).max(2000).nullish(),
  })
  .strict()
export type CreateCommercialOutcomeInput = z.infer<typeof createCommercialOutcomeSchema>

export const commercialOutcomesResponseSchema = z.object({ items: z.array(commercialOutcomeSchema) })
export type CommercialOutcomesResponse = z.infer<typeof commercialOutcomesResponseSchema>

/**
 * #2126.56/.58/.59 (substrat partagé, GA-26 — un réglage vit à un seul
 * endroit) — le compte PAR TYPE, lu par les trois boucles livrées cette
 * itération :
 *  - le classement (`contact-eligibility.ts`) EXCLUT un contact marqué
 *    `incorrect_contact` du chemin recommandé (#2126.56) — la même porte
 *    ferme aussi les recommandations futures (#2126.58), puisque
 *    `filterEligibleContacts` est le SEUL filtre amont des deux ;
 *  - la qualité des données (`data-hygiene.service.ts`) compte les contacts
 *    marqués incorrects non corrigés (#2126.59).
 *
 * #2126.57 (golden tests) n'a PAS de fold-in automatique — décision écrite
 * dans `apps/ia/app/eval/README.md` et reprise dans le commentaire de
 * livraison de l'épopée : le corpus golden est un référentiel interne
 * hand-curated (`c77_gate_qualite_ia_bloque_sur_role_cle`), décorrélé des
 * espaces clients qui enregistrent ces outcomes — y brancher un flux vivant
 * romprait exactement la stabilité que ce gate protège.
 */
export const commercialOutcomeSummarySchema = z.object({
  accountId: z.string().guid(),
  counts: z.partialRecord(commercialOutcomeTypeSchema, z.number().int().min(0)),
  /** Contacts marqués `incorrect_contact` (le dernier mot, #2297 — une
   *  correction humaine gagne toujours n'aura de sens que si demain une
   *  fiche « corrigée » peut lever l'exclusion ; hors périmètre de ce lot). */
  incorrectContactIds: z.array(z.string().guid()),
})
export type CommercialOutcomeSummary = z.infer<typeof commercialOutcomeSummarySchema>
