import { z } from 'zod'

/**
 * #2088.12/.13 (DÉCISION Louis 18/09/2026, point 16) — les deux PREMIERS vrais
 * NOMBRES du questionnaire : le chiffre d'affaires et le nombre de
 * consultants.
 *
 * Mesuré le 18/09 : le corpus Temps 1 ne porte AUCUN type de question
 * `number` — le seul champ « chiffré », `consultant_size`, est un choix de
 * TRANCHES délibéré (#2088.12, `entreprise.ts`). Ajouter un type `number`
 * sans question réelle derrière serait du code mort ; Louis tranche qu'il y en
 * a deux, et que le type, sa colonne, son UNITÉ visible et sa PÉRIODE
 * arrivent ensemble, dans ce seul bloc.
 *
 * ⚠️ CE QUI EXISTE NE SE PERD PAS. `consultant_size` (tranche) N'EST NI
 * RETIRÉE NI RENOMMÉE : `consultant_count` est une colonne ADDITIVE,
 * indépendante. Un profil qui a répondu « 10 à 50 consultants » avant ce
 * lot garde cette réponse, lisible et affichable telle quelle par tous ses
 * lecteurs actuels (prompt IA, prérempli, tableau de bord démo…) ; son
 * `consultant_count` vaut `null` tant que la personne ne l'a pas renseigné
 * explicitement — jamais un nombre DEVINÉ à partir de la tranche (ce serait
 * une donnée fabriquée, interdite par la doctrine).
 *
 * `annual_revenue_amount` est une question ENTIÈREMENT NOUVELLE : aucune
 * tranche de chiffre d'affaires n'existait avant ce lot dans `esn_profiles`.
 *
 * #2088.13 — LA PÉRIODE EST OBLIGATOIRE QUAND ELLE CHANGE LE SENS. Un chiffre
 * d'affaires sans période ne veut rien dire : « 800 000 » peut être le
 * dernier exercice CLOS (un fait) ou l'exercice EN COURS estimé (une
 * projection) — deux choses différentes pour qui les lit ensuite (audit
 * commercial, contexte du copilote). `annual_revenue_period` est donc une
 * question À PART ENTIÈRE, portée par la donnée (sa propre colonne), pas
 * seulement par le libellé de la question amont — voir
 * `lib/questions/chiffre-affaires.ts` (web), qui ne la POSE que si un montant
 * a déjà été saisi (`when`) : une période sans montant ne veut, elle non
 * plus, rien dire.
 *
 * `consultant_count` ne porte PAS de période : un effectif se lit à
 * l'instant présent, contrairement à un chiffre d'affaires qui court sur un
 * exercice — même distinction que `revenue_recurrence` (récurrent/ponctuel)
 * qui n'a jamais eu besoin d'un troisième champ pour se faire comprendre.
 *
 * Valeurs PERSISTÉES verbatim en français, comme le reste du bloc Temps 1
 * (`ACTIVITY_REFERENCE_PERIODS`, `answers-mesures.ts`, même convention).
 */
export const ANNUAL_REVENUE_PERIODS = ['Dernier exercice clos', 'Exercice en cours (estimation)'] as const

export type AnnualRevenuePeriod = (typeof ANNUAL_REVENUE_PERIODS)[number]

export const CHIFFRES_CLES_ANSWER_FIELDS = {
  /** #2088.12 — nombre RÉEL de consultants, additif à `consultant_size` (tranche). */
  consultant_count: z.number().int().nonnegative().nullable().catch(null),
  /** #2088.12/.13 — chiffre d'affaires annuel, en euros. */
  annual_revenue_amount: z.number().nonnegative().nullable().catch(null),
  /** #2088.13 — la période que `annual_revenue_amount` couvre. */
  annual_revenue_period: z.enum(ANNUAL_REVENUE_PERIODS).nullable().catch(null),
}
