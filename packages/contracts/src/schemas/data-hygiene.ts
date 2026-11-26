import { z } from 'zod'
import { stockBaselineSchema } from './stock-snapshot.js'

/**
 * La vue Qualité des données (PDF 8 §6.3).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI DISTINGUE CETTE VUE DES INDICATEURS DE PERFORMANCE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les taux de performance restent au BACK-OFFICE — arbitrage des 31/07 et 03/08 :
 * un taux affiché à un commercial devient une promesse chiffrée qu'il faut tenir.
 * Ceux-ci sont d'une autre nature : ce sont des LISTES DE TRAVAIL. « 7 comptes
 * sans prochaine action » n'est pas un jugement sur quelqu'un, c'est du travail
 * à faire, et le cacher à la personne qui doit le faire n'aurait aucun sens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE DU §6.3
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un indicateur de qualité qui ne mène nulle part ne sert à rien. » Chaque
 * ligne porte donc l'ÉCRAN qui montre les objets concernés. Une ligne dont
 * l'écran n'existe pas n'est pas livrée : afficher un compte sans pouvoir
 * l'ouvrir transforme une liste de travail en reproche.
 */

export const HYGIENE_CHECKS = [
  /** Comptes suivis sur lesquels rien n'est programmé. */
  'accounts_without_next_action',
  /** Contacts sans adresse — l'enrichissement est le geste. */
  'contacts_without_email',
  /** Projets ouverts sans montant : ils ne pèsent dans aucun pipe. */
  'projects_without_amount',
  /** Missions actives sans date de fin : aucune alerte de renouvellement ne se
   *  déclenchera jamais dessus. */
  'missions_without_end_date',
  /** Besoins sans compétence typée : le matching ne peut pas les traiter. */
  'needs_without_skills',
  /** Consultants dont la disponibilité n'est ni saisie ni dérivable. */
  'talents_unknown_availability',
  /** Doublons de contacts repérés et jamais tranchés. */
  'unresolved_duplicates',
  /** Missions sans coût chargé : leur marge est non mesurable. */
  'missions_without_cost',
  /**
   * #2126.59 (épopée #2787) — contacts marqués `incorrect_contact`
   * (`commercial-outcome.ts`) : la fiche désigne la mauvaise personne, elle
   * reste au dossier mais ne doit plus servir tant que personne ne l'a
   * reprise. AJOUTÉE EN FIN (GA-08).
   */
  'contacts_flagged_incorrect',
] as const
export type HygieneCheck = (typeof HYGIENE_CHECKS)[number]

export const hygieneLineSchema = z.object({
  key: z.enum(HYGIENE_CHECKS),
  /** Objets concernés. `null` = la lecture a échoué — jamais 0. */
  count: z.number().int().nonnegative().nullable(),
  /** Sur combien d'objets du même type. `null` quand la question n'a pas de
   *  dénominateur (un doublon n'est pas une part de quelque chose). */
  total: z.number().int().nonnegative().nullable(),
  /** L'écran qui montre la liste. Toujours renseigné — voir l'en-tête. */
  link: z.string(),
})
export type HygieneLine = z.infer<typeof hygieneLineSchema>

export const dataHygieneSchema = z.object({
  lines: z.array(hygieneLineSchema),
  /**
   * La photo du mois PRÉCÉDENT des SEPT lignes qui sont des stocks (D2 / D49 du
   * 26/08). `unresolved_duplicates` n'y est pas : `duplicate_pairs` porte
   * `created_at`, `decision` et `decided_at`, donc « en attente au 1er mars »
   * se recalcule — une photo de plus serait une seconde vérité.
   *
   * OPTIONNELLE : une vue sans photo est l'état normal du premier mois, et
   * l'écran n'affiche alors aucun pourcentage.
   */
  stockBaseline: stockBaselineSchema.optional(),
})
export type DataHygiene = z.infer<typeof dataHygieneSchema>

/**
 * Les seuils du §6.3, et ce qu'ils veulent dire.
 *
 * `0` signifie « toute occurrence compte » : une mission sans date de fin est
 * une alerte de renouvellement qui ne se déclenchera jamais, il n'y a pas de
 * quota acceptable. Les autres sont des PARTS, parce qu'un grand portefeuille en
 * porte forcément quelques-unes.
 */
export const HYGIENE_THRESHOLDS: Record<HygieneCheck, { kind: 'count' | 'rate'; limit: number }> = {
  accounts_without_next_action: { kind: 'count', limit: 0 },
  contacts_without_email: { kind: 'rate', limit: 0.3 },
  projects_without_amount: { kind: 'rate', limit: 0.2 },
  missions_without_end_date: { kind: 'count', limit: 0 },
  needs_without_skills: { kind: 'count', limit: 0 },
  talents_unknown_availability: { kind: 'rate', limit: 0.3 },
  unresolved_duplicates: { kind: 'count', limit: 20 },
  missions_without_cost: { kind: 'rate', limit: 0.1 },
  // #2126.59 — un seul contact flaggé mérite d'être vu : pas de quota, comme
  // les autres alertes « ne se déclenchera jamais » ci-dessus.
  contacts_flagged_incorrect: { kind: 'count', limit: 0 },
}

/**
 * La population de ce contrôle est-elle VIDE ?
 *
 * Recette du 27/08, en production : « Consultants à disponibilité inconnue —
 * **0 sur 0** », affiché au-dessus d'un vivier qui contenait un profil. Les deux
 * chiffres étaient justes : le contrôle ne compte que les CONSULTANTS, l'espace
 * n'avait que des CANDIDATS, donc numérateur et dénominateur valaient zéro. Mais
 * « 0 sur 0 » se lit « mon vivier est vide » — l'inverse de ce que la liste
 * juste en dessous montrait.
 *
 * Une part dont la population est vide n'est pas une part. `hygieneBreached` le
 * savait déjà (elle rend `null`, « rien à comparer ») ; ce qui manquait était le
 * NOM de cette situation, pour que l'affichage puisse la dire au lieu d'écrire
 * un ratio qui ne mesure rien. Une garde ne protège que ce qui a un nom.
 *
 * `false` quand la lecture a échoué : « je n'ai pas pu lire » et « il n'y a
 * personne à lire » ne se ressemblent pas, et `count === null` porte déjà le
 * premier.
 */
export function hygieneEmptyPopulation(line: HygieneLine): boolean {
  return line.count !== null && line.total === 0
}

/**
 * La ligne dépasse-t-elle son seuil ?
 *
 * `null` quand on ne sait pas : ni « au-dessus », ni « en dessous ». Une lecture
 * qui a échoué ne doit pas s'afficher en vert — c'est la version silencieuse du
 * « zéro qui se lit comme un succès » que tout ce chantier corrige.
 */
export function hygieneBreached(line: HygieneLine): boolean | null {
  if (line.count === null) return null
  const threshold = HYGIENE_THRESHOLDS[line.key]
  if (threshold.kind === 'count') return line.count > threshold.limit
  // Une part sans dénominateur n'est pas une part : rien à comparer. La
  // population vide vit sous son nom, à un seul endroit.
  if (line.total === null || hygieneEmptyPopulation(line)) return null
  return line.count / line.total > threshold.limit
}
