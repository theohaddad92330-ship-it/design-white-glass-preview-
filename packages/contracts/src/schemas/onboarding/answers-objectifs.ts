import { z } from 'zod'
import { fieldSourceSchema } from '../provenance.js'

/**
 * Les objectifs commerciaux NOMMÉS — #2052 (lot L19).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE BLOC REMPLACE
 * ─────────────────────────────────────────────────────────────────────────
 * `monthly_target` (`answers-profil.ts`) est UN champ, choix fermé, sans
 * unité, sans période explicite (le nom la suppose « mensuelle », jamais
 * déclarée), sans horizon, sans niveau d'engagement et sans source. Ses
 * propres choix mélangent des RDV et des comptes dans la même liste
 * (`profile-questionnaire.ts` — `'0-2 RDV'` à côté de `'6+ comptes'`) : rien
 * ne dit lequel des deux a été choisi une fois la chaîne relue ailleurs.
 *
 * `monthly_target` N'EST PAS supprimé (GA-11/GA-12, « on archive, on ne
 * supprime pas ») : la colonne, le champ et sa lecture restent tels quels
 * (#2052.1). Ce bloc AJOUTE `esn_objectives`, qui porte ce que `monthly_target`
 * ne pouvait pas dire — un tableau d'objectifs facultatifs, chacun nommé,
 * chacun structuré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UN TABLEAU D'OBJETS, PAS UNE COLONNE PAR NATURE
 * ─────────────────────────────────────────────────────────────────────────
 * Les huit natures (#2052.2 à #2052.10, hors #2052.8 déjà livré ailleurs —
 * `target_margin`) partagent EXACTEMENT la même forme (Bloc 2 de l'issue :
 * unité, période, horizon, niveau d'engagement, source). Une colonne par
 * nature aurait dupliqué cinq fois la même forme ; un objet partagé la porte
 * une fois, et une neuvième nature s'ajoute par une ligne dans
 * {@link OBJECTIVE_KINDS}, jamais par une migration.
 *
 * Chaque entrée est FACULTATIVE au sens produit : une nature absente du
 * tableau n'est pas un objectif à zéro, c'est un objectif non déclaré
 * (doctrine « non mesuré n'est jamais 0 », GA-18/GA-19) — d'où `value`
 * nullable/optional plutôt qu'un défaut à `0`.
 */

/**
 * #2052.2 à #2052.10 — le catalogue des natures d'objectif, dans l'ordre de
 * l'issue. `target_margin` (#2052.8) reste HORS de ce catalogue : c'est déjà
 * un champ dédié du profil progressif (`profile-questionnaire.ts:153`,
 * `target_margin` — déjà là), et l'y dupliquer romprait GA-26 (un réglage vit
 * à un seul endroit).
 *
 * ⚠️ `revenue` (#2052.7) — le chiffre d'affaires — a une forme PARTICULIÈRE :
 * voir le refinement de {@link esnObjectiveSchema} juste en dessous.
 *
 * ⚠️ `consultants_on_mission_target` (#2052.9) est un OBJECTIF, distinct du
 * CONSTAT `consultants_on_mission` (`answers-profil.ts`, tranche déclarée du
 * profil progressif). Les confondre rendrait « objectif atteint » vrai par
 * construction — le constat validerait toujours son propre objectif.
 */
export const OBJECTIVE_KINDS = [
  'meetings', // #2052.2 — rendez-vous
  'qualified_needs', // #2052.3 — besoins qualifiés
  'profiles_presented', // #2052.4 — profils présentés
  'placements', // #2052.5 — démarrages
  'new_accounts', // #2052.6 — nouveaux comptes
  'revenue', // #2052.7 — chiffre d'affaires (branché sur `modules/objectives`, jamais dupliqué ici)
  'consultants_on_mission_target', // #2052.9 — objectif, DISTINCT du constat `consultants_on_mission`
  'structuring', // #2052.10 — objectif de structuration
] as const
export const objectiveKindSchema = z.enum(OBJECTIVE_KINDS)
export type ObjectiveKind = z.infer<typeof objectiveKindSchema>

/**
 * #2052.12 — la période, OBLIGATOIRE sur chaque objectif : « 20 » par mois et
 * « 20 » par an ne sont pas le même objectif, et `monthly_target` ne pouvait
 * même pas poser la question (son nom suppose « mensuel », sans le dire).
 */
export const OBJECTIVE_PERIODS = ['weekly', 'monthly', 'quarterly', 'yearly'] as const
export const objectivePeriodSchema = z.enum(OBJECTIVE_PERIODS)
export type ObjectivePeriod = z.infer<typeof objectivePeriodSchema>

/**
 * #2052.14, #2052.16, #2052.17 — le niveau d'engagement, ce qui sépare TROIS
 * choses qu'on cessait de confondre :
 *
 *  - `objective`  — un engagement : le commercial ou l'espace s'y tient.
 *  - `benchmark`  — un repère de travail : une valeur de référence pour se
 *    situer, jamais un engagement (#2052.16). Le traiter comme un objectif
 *    fabrique un échec qui n'existe pas.
 *  - `ambition`   — un souhait, non engageant (#2052.17). Le traiter comme un
 *    objectif fabrique un reproche pour une valeur que personne n'a promise.
 *
 * Ce sont des ÉTATS AU CONTRAT, pas des libellés d'écran : le moteur (dossier,
 * plan d'action, cockpit) doit pouvoir les distinguer sans relire une phrase.
 */
export const OBJECTIVE_COMMITMENT_LEVELS = ['objective', 'benchmark', 'ambition'] as const
export const objectiveCommitmentLevelSchema = z.enum(OBJECTIVE_COMMITMENT_LEVELS)
export type ObjectiveCommitmentLevel = z.infer<typeof objectiveCommitmentLevelSchema>

/** Plafond du tableau : une entrée par nature, jamais deux fois la même
 *  (voir le refinement plus bas) — un doublon ne peut donc jamais dépasser
 *  le nombre de natures connues. */
export const OBJECTIVES_MAX_ITEMS = OBJECTIVE_KINDS.length

/**
 * #2052.11 à #2052.15 — ce que porte CHAQUE objectif.
 *
 *  - `value`           — #2052.11, la mesure. `null`/absent = non déclaré,
 *    JAMAIS 0 par défaut (« si cette valeur est absente, 0 est-il VRAI ? »
 *    Non — donc pas de `.default(0)` ici).
 *  - `unit`             — #2052.11, l'unité de `value`. Un nombre sans unité
 *    ne veut rien dire ; `null` pour une nature purement qualitative
 *    (`structuring` sans chiffre, portée par `note`).
 *  - `period`           — #2052.12, OBLIGATOIRE (voir plus haut).
 *  - `horizon`          — #2052.13, la date/l'échéance visée. Distincte de
 *    `period` : `period` est la CADENCE de mesure, `horizon` est le POINT
 *    dans le temps où l'objectif doit être tenu (ex. « fin T2 2027 »).
 *  - `commitmentLevel`  — #2052.14 (voir plus haut).
 *  - `source`/`observedAt` — #2052.15, la provenance. Réutilise
 *    {@link fieldSourceSchema} (`provenance.ts`) plutôt que d'écrire un
 *    second enum de sources à la main (GA-26).
 *  - `note`             — texte libre facultatif, pour une nature qualitative
 *    (`structuring`) ou une précision qu'aucun champ fermé ne porte.
 */
export const esnObjectiveSchema = z
  .object({
    kind: objectiveKindSchema,
    value: z.number().nullable().optional(),
    unit: z.string().min(1).nullable().optional(),
    period: objectivePeriodSchema,
    horizon: z.string().min(1).nullable().optional(),
    commitmentLevel: objectiveCommitmentLevelSchema,
    source: fieldSourceSchema,
    observedAt: z.string().min(1),
    note: z.string().min(1).nullable().optional(),
  })
  .refine(objective => objective.kind !== 'revenue' || (objective.value == null && objective.unit == null), {
    // #2052.7 — `modules/objectives` (MemberObjectiveEntity.target_revenue,
    // `apps/api/src/modules/objectives/objectives.service.ts`) porte DÉJÀ le
    // chiffre d'affaires cible, par membre et par mois. Le dupliquer ici
    // créerait un second registre d'objectifs (GA-26 : un réglage vit à un
    // seul endroit) — deux chemins qui divergeraient au premier écart. La
    // nature `revenue` reste NOMMABLE (elle compte comme objectif suivi),
    // seul son NOMBRE est refusé ici.
    message:
      "#2052.7 — le chiffre d'affaires cible vit dans `modules/objectives` (target_revenue) ; ne pas dupliquer sa valeur ici (GA-26).",
    path: ['value'],
  })
export type EsnObjective = z.infer<typeof esnObjectiveSchema>

/**
 * #2052.1 — remplace le CHAMP UNIQUE `monthly_target` par des objectifs
 * NOMMÉS et facultatifs. `monthly_target` reste au contrat (`answers-profil.ts`),
 * add-only : rien ne le lit moins qu'avant.
 */
export const OBJECTIFS_ANSWER_FIELDS = {
  esn_objectives: z
    .array(esnObjectiveSchema)
    .max(OBJECTIVES_MAX_ITEMS)
    .refine(items => new Set(items.map(item => item.kind)).size === items.length, {
      message: 'Une seule entrée par nature — deux objectifs `meetings` ne peuvent pas coexister.',
    })
    .optional(),
}
