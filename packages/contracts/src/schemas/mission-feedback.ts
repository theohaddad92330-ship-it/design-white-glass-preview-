import { z } from 'zod'
import { evidenceFieldSourceSchema } from './provenance.js'

/**
 * #2412 — LE DOUBLE POULS DE SATISFACTION D'UNE MISSION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le dépôt sait déjà recueillir un avis AVANT une mission (`submission_feedback`
 * / `submission_consultant_feedback` — le retour sur un POSITIONNEMENT). Rien
 * ne recueillait d'avis PENDANT une mission active : aucune table, aucun écran,
 * aucun appelant (`git grep` sur `mission_feedback`/`MissionFeedback` — zéro
 * résultat avant ce lot).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX RAILS, JAMAIS UN SCORE (#2412.1, #2412.8)
 * ─────────────────────────────────────────────────────────────────────────────
 * La perception CLIENT et l'expérience CONSULTANT sont deux faits distincts —
 * les fusionner en une moyenne ferait disparaître exactement le cas qui compte
 * commercialement : un client ravi et un consultant épuisé (ou l'inverse). Le
 * champ {@link MissionFeedbackRail} n'a donc que deux valeurs, jamais une
 * troisième « globale » qui les mélangerait, et rien dans ce fichier ne calcule
 * de moyenne entre les deux rails ni entre les entrées d'un même rail — la
 * doctrine « aucune probabilité, un score n'est jamais nu » interdit d'ailleurs
 * de réduire un rail à un seul chiffre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRANCHE LIVRÉE, CE QUI RESTE (point énorme, cf. registre #2412)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette tranche porte la STRUCTURE (deux rails, preuve datée/sourcée/attribuée,
 * confidentialité) — pas les taxonomies fines que la source (PDF, hors dépôt)
 * nommerait : les neuf axes client, les neuf axes consultant, les sept moments
 * de collecte et les six formats ne sont PAS sourcés ici, et les inventer
 * violerait « jamais de données fictives ». `note` reste donc un extrait EN
 * TEXTE LIBRE, comme `account-feedback.ts` le fait déjà pour un besoin voisin,
 * en attendant la liste source. `confidence` n'est pas modélisé : cette route
 * est un dépôt humain (`source` toujours `'human'`), pas une lecture
 * automatique de sentiment — rien ne justifierait un cran de confiance inventé.
 */
export const MISSION_FEEDBACK_RAILS = ['client', 'consultant'] as const
export const missionFeedbackRailSchema = z.enum(MISSION_FEEDBACK_RAILS)
export type MissionFeedbackRail = z.infer<typeof missionFeedbackRailSchema>

/**
 * #2408.16, .33, .51 — LE NIVEAU DÉCLARÉ d'une entrée (contrat validé par
 * Louis le 31/10/2026).
 *
 * Trois crans QUALITATIFS posés par la personne qui dépose le retour — jamais
 * un score, jamais une moyenne entre rails ni entre entrées (#2412.1/.8), et
 * jamais une probabilité. OPTIONNEL : une note sans niveau reste valide et se
 * lit « non mesuré » (`null`), jamais « moyen » ni « 0 » (GA-18/19). GA-08 :
 * une valeur neuve s'ajoute EN FIN.
 */
export const MISSION_SATISFACTION_LEVELS = ['low', 'medium', 'high'] as const
export const missionSatisfactionLevelSchema = z.enum(MISSION_SATISFACTION_LEVELS)
export type MissionSatisfactionLevel = z.infer<typeof missionSatisfactionLevelSchema>

/**
 * #2412.10 — la visibilité d'une entrée, RBAC-GOUVERNÉE mais minimale : une
 * entrée `private` n'est jamais rendue à personne d'autre que son auteur (pas
 * même à l'équipe de l'espace) ; ce que la doctrine demande en plus — un rôle
 * manager qui percerait cette confidentialité — reste `retenu` (registre
 * #2412.10) : accorder ce droit sans savoir à QUEL rôle exactement inventerait
 * une porte que personne n'a demandée.
 */
export const missionFeedbackItemSchema = z.object({
  id: z.string().guid(),
  missionId: z.string().guid(),
  rail: missionFeedbackRailSchema,
  /** L'extrait — texte libre, cité tel quel, jamais reformulé (même doctrine
   *  que `account-feedback.ts`, `submission-feedback.entity.ts`). */
  note: z.string().min(1).max(2000),
  /** `true` ⇒ visible du seul auteur. `false` ⇒ visible de l'équipe de
   *  l'espace. Jamais du client, quelle que soit la valeur : cette route n'a
   *  aucun appelant côté portail client. */
  private: z.boolean(),
  source: evidenceFieldSourceSchema,
  /** #2408.16 — le niveau déclaré ; `null` = non déclaré ; absent = API antérieure. */
  level: missionSatisfactionLevelSchema.nullable().optional(),
  recordedByUserId: z.string().guid(),
  createdAt: z.string().datetime(),
})
export type MissionFeedbackItem = z.infer<typeof missionFeedbackItemSchema>

export const createMissionFeedbackSchema = z
  .object({
    rail: missionFeedbackRailSchema,
    note: z.string().trim().min(1).max(2000),
    private: z.boolean().default(false),
    // #2408.16 — optionnel : sans niveau, l'entrée reste une note libre.
    level: missionSatisfactionLevelSchema.nullable().default(null),
  })
  .strict()
export type CreateMissionFeedbackInput = z.infer<typeof createMissionFeedbackSchema>
/** Ce qu'un CLIENT envoie : `private` et `level` y sont optionnels (défauts du schéma). */
export type CreateMissionFeedbackRequest = z.input<typeof createMissionFeedbackSchema>

/** Réponse de `GET /delivery/missions/:id/feedback` — les deux rails déjà
 *  SÉPARÉS (#2412.1) : l'écran n'a jamais à re-trier un tableau plat pour
 *  obtenir la séparation que la doctrine exige. */
export const missionFeedbackRailsSchema = z.object({
  client: z.array(missionFeedbackItemSchema),
  consultant: z.array(missionFeedbackItemSchema),
})
export type MissionFeedbackRails = z.infer<typeof missionFeedbackRailsSchema>

/**
 * #2408.33 / #2408.51 — LE RÉSUMÉ DE SATISFACTION D'UNE MISSION, tel que la
 * liste `GET /delivery/missions` le porte : le DERNIER niveau déclaré de
 * CHAQUE rail, séparés (#2412.1) — jamais fusionnés en un chiffre.
 *
 * `null` sur un rail = aucun niveau déclaré : « non mesuré », jamais « bon ».
 * Une entrée PRIVÉE n'y entre jamais : la liste est partagée, et un niveau
 * privé qui y remonterait trahirait l'entrée que #2412.10 cache.
 */
export const missionSatisfactionSchema = z.object({
  client: missionSatisfactionLevelSchema.nullable(),
  consultant: missionSatisfactionLevelSchema.nullable(),
})
export type MissionSatisfaction = z.infer<typeof missionSatisfactionSchema>

export function missionSatisfactionOf(
  entries: readonly {
    rail: MissionFeedbackRail
    level?: MissionSatisfactionLevel | null
    private: boolean
    createdAt: string
  }[],
): MissionSatisfaction {
  const latest = (rail: MissionFeedbackRail): MissionSatisfactionLevel | null => {
    const measured = entries
      .filter(entry => entry.rail === rail && !entry.private && entry.level != null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return measured[0]?.level ?? null
  }
  return { client: latest('client'), consultant: latest('consultant') }
}

/** #2408.16 — un rail au plus bas suffit ; un rail non mesuré ne compte pas. */
export function isSatisfactionLow(satisfaction: MissionSatisfaction | null | undefined): boolean {
  return satisfaction?.client === 'low' || satisfaction?.consultant === 'low'
}
