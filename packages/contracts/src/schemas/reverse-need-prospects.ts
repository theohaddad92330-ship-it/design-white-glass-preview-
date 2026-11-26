import { z } from 'zod'

/**
 * « Un besoin sans candidat ouvre une piste » — la prospection inversée lue
 * depuis un BESOIN plutôt que depuis un compte (PDF 2 §7.5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNIQUE SOURCE DE LA FORME
 * ─────────────────────────────────────────────────────────────────────────────
 * Longtemps dupliquée localement, champ pour champ, dans
 * `apps/api/src/modules/projects/reverse-need-prospects.ts` (le calcul, qui y
 * reste — croisement SQL puis {@link sharedSkillTerms}/{@link rankReverseProspects}
 * du même fichier) et dans `apps/web/src/features/projects/open-needs/api.ts`
 * (la lecture). Deux copies identiques ne divergent pas le jour où on les
 * écrit : elles divergent le jour où un champ est ajouté d'un seul côté, et
 * rien ne le signale — voir GA-204 (`reverse-need-prospects.test.ts`), qui
 * vérifie qu'il n'en reste plus qu'une.
 *
 * `ReverseProspectsSection` (`features/accounts/.../plan/`) répond à une
 * AUTRE question — « qui a TRAVAILLÉ chez ce compte et est ailleurs
 * aujourd'hui », des PERSONNES depuis l'historique de poste Apollo d'UN
 * compte précis. Rien à réutiliser : la donnée, le périmètre et la question
 * n'ont que le nom « prospection inversée » en commun.
 */

/** Une piste : un AUTRE compte, avec un besoin ouvert qui partage la zone et
 *  au moins une compétence avec le besoin de référence. */
export const reverseProspectMatchSchema = z.object({
  need_id: z.string(),
  need_title: z.string(),
  /** #2558.1 — `null` ENSEMBLE quand la piste est un besoin SANS projet : la
   *  piste vaut par son compte et sa compétence, pas par une affaire ouverte.
   *  ⚠️ Jamais `''` — une étiquette vide se lirait comme un projet sans nom. */
  project_id: z.string().nullable(),
  project_label: z.string().nullable(),
  account_id: z.string(),
  account_name: z.string(),
  /** La zone TELLE QUE CE besoin-là la porte — pas recopiée de la référence :
   *  les deux sont "la même zone" au sens de `sameZone`, pas forcément
   *  écrites à l'identique. */
  location: z.string(),
  shared_skills: z.array(z.string()),
  /**
   * `true` quand ce compte est DÉJÀ celui d'un membre de l'espace
   * (`accounts.assigned_to` = l'appelant) — le « portefeuille » au sens où
   * `account.entity.ts` le nomme. Une piste qui retombe sur son propre client
   * doit le DIRE : cliquer dessus et découvrir qu'on le connaît déjà casse la
   * confiance dans tout l'écran.
   */
  already_in_portfolio: z.boolean(),
})
export type ReverseProspectMatch = z.infer<typeof reverseProspectMatchSchema>

/** Pourquoi le croisement n'a PAS tourné — distinct d'une liste vide, qui dit
 *  qu'il a tourné et n'a trouvé personne. */
export const REVERSE_PROSPECTS_UNAVAILABLE_REASONS = ['location_missing', 'skills_missing'] as const
export const reverseProspectsUnavailableReasonSchema = z.enum(REVERSE_PROSPECTS_UNAVAILABLE_REASONS)
export type ReverseProspectsUnavailableReason = (typeof REVERSE_PROSPECTS_UNAVAILABLE_REASONS)[number]

export const reverseProspectsResultSchema = z.object({
  needId: z.string(),
  location: z.string().nullable(),
  skillTerms: z.array(z.string()),
  /** `null` = le croisement a tourné, et il n'a trouvé personne — une AUTRE
   *  réponse qu'un motif d'indisponibilité, même si `matches` est vide dans
   *  les deux cas. */
  unavailableReason: reverseProspectsUnavailableReasonSchema.nullable(),
  matches: z.array(reverseProspectMatchSchema),
})
export type ReverseProspectsResult = z.infer<typeof reverseProspectsResultSchema>
