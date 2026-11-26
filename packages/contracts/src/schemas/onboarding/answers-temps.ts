import { z } from 'zod'

/**
 * La capacité RÉELLE — #2050 (lot L19).
 *
 * Le questionnaire savait dire combien l'ESN compte de consultants ; il ne
 * savait rien dire de ce que la personne peut RÉELLEMENT engager d'une semaine
 * à l'autre. C'est le sujet où la tentation du chiffre faux est maximale : un
 * « 5 h de prospection par semaine » annoncé se transforme en plan d'action de
 * cinq fronts, et le plan n'est jamais tenu.
 *
 * ⚠️ TROIS ÉTATS, JAMAIS UN SEUL NOMBRE (#2050.11 / .12 / .13). Le temps
 * ANNONCÉ, le temps réellement PROTÉGÉ et le temps RÉSIDUEL sont trois faits
 * différents, et les fondre en une valeur unique fabriquerait précisément le
 * chiffre faux. Ils vivent donc dans trois champs distincts, chacun déclaré par
 * la personne — le résiduel n'est PAS calculé par soustraction : une soustraction
 * entre deux bandes dont l'une est absente rendrait un nombre inventé, et
 * « non mesuré n'est jamais 0 » (GA-18 / GA-19).
 *
 * Toutes les colonnes sont ADDITIVES et nullables : une question passée reste
 * `null`, jamais devinée. `.nullable().optional()` comme le profil progressif —
 * un ancien payload qui ignore ces clés reste assignable à `EsnAnswers`.
 */

/**
 * Les bandes d'heures hebdomadaires — écrites UNE seule fois (GA-26, « un
 * réglage vit à un seul endroit »), relues par les TROIS questions de temps.
 * Trois listes recopiées auraient divergé au premier ajustement de borne, et
 * les trois états seraient devenus incomparables — ce qui est exactement ce que
 * #2050.11/.12/.13 demande d'éviter.
 *
 * « Aucune heure dans une semaine ordinaire » est un ZÉRO DÉCLARÉ par la
 * personne, ce qui est vrai ; « Je ne sais pas » est l'absence de mesure, ce qui
 * est un fait différent. Les deux existent, et aucun des deux ne se devine.
 */
export const WEEKLY_SALES_TIME_BANDS = [
  'Aucune heure dans une semaine ordinaire',
  'Moins de 2 heures par semaine',
  '2 à 5 heures par semaine',
  '5 à 10 heures par semaine',
  '10 à 20 heures par semaine',
  'Plus de 20 heures par semaine',
  'Je ne sais pas',
] as const

/** #2050.2 — QUAND, dans les heures ouvrées, ce temps tombe réellement. */
export const WEEKLY_SALES_TIME_SLOTS = [
  'Tôt le matin, avant 9 h',
  'En matinée, entre 9 h et 12 h',
  'Sur la pause déjeuner',
  'En début d’après-midi, entre 14 h et 16 h',
  'En fin de journée, après 16 h',
  'En soirée ou le week-end, hors heures ouvrées',
  'Aucune plage régulière, c’est au fil de l’eau',
] as const

/**
 * #2050.3 à #2050.8 — les activités qui prennent le temps restant. Cinq
 * activités nommées par le retour (missions personnelles, delivery, management,
 * recrutement, marketing) et RIEN d'autre : une sixième famille ajoutée ici
 * serait une charge inventée.
 *
 * ⚠️ `recruits_for_clients` (#1124) dit que l'ESN place des CDI chez ses
 * clients — c'est une OFFRE. « Le recrutement et la qualification des
 * candidats » ci-dessous est une CHARGE de la semaine. Les deux ne se déduisent
 * pas l'un de l'autre (#2050.7).
 */
export const COMPETING_WORKLOADS = [
  'Mes propres missions facturées chez le client',
  'Le delivery et le suivi des consultants en poste',
  'L’encadrement et le management de l’équipe',
  'Le recrutement et la qualification des candidats',
  'Le marketing, le contenu et la présence en ligne',
  'Rien d’autre, je suis à temps plein sur le développement commercial',
] as const

/** #2050.9 — la charge est-elle stable, ou la semaine se fait-elle manger ? */
export const WORKLOAD_VARIABILITY = [
  'Ma charge est stable d’une semaine à l’autre',
  'Elle varie selon les semaines, mais de façon prévisible',
  'Elle est imprévisible, un imprévu peut manger la semaine',
  'Je ne sais pas',
] as const

/** #2050.10 — la capacité à PROTÉGER un créneau, distincte de sa durée. */
export const PROTECTED_SLOT_CAPACITY = [
  'Oui, je bloque des créneaux et ils tiennent',
  'Je bloque des créneaux mais ils sautent souvent',
  'Je ne bloque pas de créneau, je fais au fil de l’eau',
  'Je ne décide pas de mon agenda',
] as const

export const TEMPS_ANSWER_FIELDS = {
  // #2050.1 / #2050.11 — le temps ANNONCÉ : ce que la personne dit consacrer.
  weekly_sales_time_declared: z.string().nullable().optional(),
  // #2050.12 — le temps réellement PROTÉGÉ : ce qui survit à une semaine
  // ordinaire. Jamais dérivé de l'annoncé.
  weekly_sales_time_protected: z.string().nullable().optional(),
  // #2050.13 — le temps RÉSIDUEL : ce qui reste quand le reste a servi. Déclaré
  // lui aussi ; une soustraction `annoncé - protégé` sur une bande absente
  // fabriquerait un chiffre que personne n'a dit.
  weekly_sales_time_residual: z.string().nullable().optional(),
  // #2050.2 — pas de plafond : la personne peut tenir plusieurs plages, et un
  // inventaire tronqué se lirait comme « elle n'en a que trois ».
  weekly_sales_time_slots: z.array(z.string()).optional(),
  // #2050.3 à #2050.8
  competing_workloads: z.array(z.string()).optional(),
  // #2050.9
  workload_variability: z.string().nullable().optional(),
  // #2050.10
  protected_slot_capacity: z.string().nullable().optional(),
}

/**
 * Ces sept réponses décrivent LA PERSONNE, pas l'ESN : les heures que Sarah
 * peut engager ne sont pas celles de son associé, et la charge qui mange sa
 * semaine n'est pas celle de l'équipe.
 *
 * Sans ce classement, la règle de fusion d'espace les routerait vers la fiche
 * CANONIQUE de l'entreprise — et la réponse d'un membre y serait ignorée dès
 * qu'un profil canonique existe (le piège déjà rencontré en #735 sur les cinq
 * questions du Temps 2, puis en #1671-ter sur le frein commercial). La liste est
 * recomposée dans `ESN_PERSONAL_ANSWER_KEYS`, à côté de celle du profil
 * progressif qui porte déjà `weekly_calls`, `weekly_emails` et `sales_routine`.
 */
export const TEMPS_PERSONAL_ANSWER_KEYS = [
  'weekly_sales_time_declared',
  'weekly_sales_time_protected',
  'weekly_sales_time_residual',
  'weekly_sales_time_slots',
  'competing_workloads',
  'workload_variability',
  'protected_slot_capacity',
] as const
