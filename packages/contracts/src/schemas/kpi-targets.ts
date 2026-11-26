import { z } from 'zod'
import { HYGIENE_THRESHOLDS } from './data-hygiene.js'

/**
 * LES CIBLES CHIFFRÉES DES INDICATEURS — PDF 5 §13.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un indicateur sans cible ne pilote rien. « DSO 71 jours » ne dit pas s'il faut
 * s'inquiéter ; « DSO 71 jours, cible < 65 » le dit en un coup d'œil. La cible
 * est ce qui transforme une mesure en décision, et c'est la seule chose qui
 * manquait à des calculs par ailleurs justes et affichés.
 *
 * L'écran Finance l'écrivait lui-même, en refusant un anneau de « taux de
 * réalisation » : *« l'orange dit "c'est mauvais". Mauvais par rapport à quoi ?
 * Une couleur d'alerte suppose un objectif, et l'objectif n'est pas tranché. »*
 * Pour ces dix indicateurs-là, il l'est — la source le chiffre. Ce fichier ne
 * fait que cesser de le perdre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN NOMBRE, UN SEUL ENDROIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces dix nombres ne se recopient NULLE PART : ni dans un composant, ni dans une
 * requête, ni dans une traduction. L'écran lit la cible, la formate avec son
 * sens, et compare. Une cible recopiée dans le front et dans l'API est déjà un
 * défaut — et le dépôt en portait la preuve : le dictionnaire des indicateurs
 * écrivait « Sous 90 % » là où la source dit « > 85 % », et « Au-delà de 20 % »
 * pour la marge non mesurée là où la source dit « < 10 % » (le 20 % appartenant,
 * lui, à un AUTRE indicateur). Personne ne pouvait le voir, parce que le nombre
 * de la source n'était écrit nulle part dans le code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX FAMILLES DE CIBLES, ET C'EST LA DISTINCTION QUI PORTE LE LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Huit cibles mesurent la PERFORMANCE de l'ESN : le délai de paiement, le taux
 * d'intercontrat, la marge brute.
 *
 * Deux mesurent notre propre IGNORANCE — « marge non mesurée < 10 % », « missions
 * non mesurables < 20 % ». Elles ne disent rien de la santé de l'entreprise :
 * elles disent à quel point les autres chiffres méritent d'être crus. Un espace
 * dont 60 % des missions n'ont pas de coût saisi affiche une marge qui ne décrit
 * pas l'espace, et c'est le SEUL indicateur capable de le dire.
 *
 * Les rendre du même vert que les autres ferait lire « tout va bien » là où la
 * phrase juste est « on sait de quoi on parle ». `measures` porte la différence,
 * et l'écran l'écrit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les SEPT autres indicateurs du §13.3 — missions actives, les quatre chiffres
 * d'affaires, le délai clôture → prêt à facturer, le CA bloqué, l'encours en
 * retard, les missions à risque mesurables. La source ne les chiffre pas, et
 * leur inventer une cible transformerait une opinion en repère.
 *
 * Le seuil d'ALERTE de marge non plus (§9.4, « proposition : < 15 % »). Il est
 * réglable par espace et éteint par défaut : c'est un réglage de l'utilisateur,
 * pas une cible du produit. Les deux vivent déjà à un endroit chacun.
 */

/**
 * Le SENS d'une cible : de quel côté est le mieux.
 *
 * C'est l'attribut qui empêche l'erreur la plus bête et la plus coûteuse — un
 * écran qui colore au hasard du signe. « < 65 j » pour le délai de paiement veut
 * dire que moins est mieux ; « > 85 % » pour les CRA, l'inverse exact.
 */
export const KPI_TARGET_DIRECTIONS = [
  /** Strictement SOUS la borne. Moins est mieux : délai de paiement, intercontrat. */
  'below',
  /** Strictement AU-DESSUS. Plus est mieux : CRA reçus, renouvellements. */
  'above',
  /** ENTRE deux bornes, comprises. Au-dessus AUSSI c'est hors cible — une marge
   *  de 62 % en régie ne se félicite pas, elle se vérifie. */
  'band',
  /** ZÉRO exactement. « Une seule suffit » : une mission sans date de fin est une
   *  alerte de renouvellement qui ne se déclenchera jamais. */
  'zero',
] as const
export const kpiTargetDirectionSchema = z.enum(KPI_TARGET_DIRECTIONS)
export type KpiTargetDirection = (typeof KPI_TARGET_DIRECTIONS)[number]

/** L'unité de la borne. Elle décide du formatage ET de ce que la garde de prose
 *  a le droit de comparer : « 30 jours » ne contredit pas une cible en %. */
export const KPI_TARGET_UNITS = ['percent', 'days', 'count'] as const
export const kpiTargetUnitSchema = z.enum(KPI_TARGET_UNITS)
export type KpiTargetUnit = (typeof KPI_TARGET_UNITS)[number]

/** Ce que la cible mesure vraiment. Voir le docblock : deux des dix ne parlent
 *  pas de l'ESN, elles parlent de la qualité de nos données sur l'ESN. */
export const KPI_TARGET_MEASURES = ['performance', 'completeness'] as const
export const kpiTargetMeasureSchema = z.enum(KPI_TARGET_MEASURES)
export type KpiTargetMeasure = (typeof KPI_TARGET_MEASURES)[number]

export const kpiTargetSchema = z
  .object({
    /** La clé de l'indicateur du dictionnaire (`MANAGER_KPIS`) qu'elle vise. */
    kpi: z.string().min(1).max(64),
    direction: kpiTargetDirectionSchema,
    unit: kpiTargetUnitSchema,
    /** La borne. Pour `band`, la borne BASSE ; pour `zero`, `0`. */
    bound: z.number(),
    /** La borne HAUTE d'une bande. `null` partout ailleurs. */
    upperBound: z.number().nullable(),
    measures: kpiTargetMeasureSchema,
    /** D'où vient le nombre. Un seuil dont on a perdu le repère redevient une
     *  opinion — et se re-litige tous les trois mois. */
    source: z.string().min(9),
  })
  .superRefine((target, ctx) => {
    if (target.direction === 'band') {
      if (target.upperBound === null || target.upperBound <= target.bound) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${target.kpi}: bande sans borne haute supérieure` })
      }
      return
    }
    if (target.upperBound !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${target.kpi}: borne haute hors d'une bande` })
    }
    if (target.direction === 'zero' && target.bound !== 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${target.kpi}: cible « zéro » dont la borne n'est pas 0` })
    }
  })
export type KpiTarget = z.infer<typeof kpiTargetSchema>

/** La citation qui porte les dix — écrite une fois, pour ne pas la re-litiger. */
const PDF5 = 'PDF 5 §13.3 — « Missions actives · missions sans date de fin (cible 0) · … »'

/**
 * DEUX DES DIX NOMBRES VIVAIENT DÉJÀ DANS LE DÉPÔT — et ils ne se recopient pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA MESURE A TROUVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `HYGIENE_THRESHOLDS` (vue Qualité des données, PDF 8 §6.3) porte déjà, sous
 * un autre nom, deux des cibles du PDF 5 §13.3 — et ce sont les MÊMES questions,
 * pas des voisines :
 *
 *  · `missions_without_cost` — `COUNT(missions actives sans coût chargé) ÷
 *    COUNT(missions actives)`, limite `0.1` — est mot pour mot « marge non
 *    mesurée (< 10 %) ». Une mission sans coût chargé est exactement une mission
 *    dont la marge n'est pas calculable ;
 *  · `missions_without_end_date`, limite `0` — est « missions sans date de fin
 *    (cible 0) ».
 *
 * Les réécrire ici en donnerait DEUX versions, et deux versions divergent :
 * celle qu'on règle et celle qu'on oublie. La cible RÉFÉRENCE donc la limite
 * d'hygiène, et une garde vérifie que la référence est vivante — si quelqu'un
 * re-code `10` en dur, elle passe encore ; si quelqu'un change la limite
 * d'hygiène, la cible suit, ce qui est le comportement voulu (GA-26).
 *
 * ⚠️ Les limites d'hygiène sont des PARTS (`0.1`), les cibles des POURCENTAGES
 * (`10`). Et `0.1 * 100` vaut `10.000000000000002` en JavaScript — un nombre qui
 * s'afficherait tel quel dans une pilule de cible.
 */
function asPercent(rate: number): number {
  return Number((rate * 100).toFixed(1))
}

/**
 * Les dix cibles chiffrées, dans l'ordre du §13.3.
 *
 * Sept des dix-sept indicateurs de la liste n'en portent pas : la source ne les
 * chiffre pas. Leur absence est une information, pas un trou à combler.
 */
export const KPI_TARGETS: readonly KpiTarget[] = [
  {
    kpi: 'missions_without_end_date',
    direction: 'zero',
    unit: 'count',
    // Référencée, jamais recopiée : la vue Qualité des données porte déjà ce
    // zéro et le compare (`hygieneBreached`).
    bound: HYGIENE_THRESHOLDS.missions_without_end_date.limit,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « missions sans date de fin (cible 0) » — même nombre que HYGIENE_THRESHOLDS.missions_without_end_date, qui le porte`,
  },
  {
    kpi: 'gross_margin',
    direction: 'band',
    unit: 'percent',
    bound: 25,
    upperBound: 40,
    measures: 'performance',
    // La borne haute n'est pas un plafond de performance : au-dessus de 40 %,
    // c'est presque toujours un coût chargé non saisi, donc une marge fausse.
    source: `${PDF5} « marge brute (25-40 % satisfaisant) » ; repère de marché du §1 : moyenne observée 23 %, en baisse de 5 points depuis 2020`,
  },
  {
    kpi: 'unmeasured_margin',
    direction: 'below',
    unit: 'percent',
    // La MÊME question que `missions_without_cost` de la vue Qualité : une
    // mission sans coût chargé est une mission dont la marge n'est pas
    // calculable. Un seul nombre, référencé.
    bound: asPercent(HYGIENE_THRESHOLDS.missions_without_cost.limit),
    upperBound: null,
    measures: 'completeness',
    source: `${PDF5} « marge non mesurée (< 10 %) » ; §9.2 « coût non renseigné ⇒ marge non mesurée. Jamais 0 €. » — même nombre que HYGIENE_THRESHOLDS.missions_without_cost`,
  },
  {
    kpi: 'timesheets_on_time',
    direction: 'above',
    unit: 'percent',
    bound: 85,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « CRA reçus avant J+5 (> 85 %) » ; §6, la cadence CRA se pose à J+5`,
  },
  /**
   * ⚠️ `timesheets_received` — la famille finance porte un indicateur voisin
   * (« relevés reçus À la clôture ÷ attendus ») et il NE porte PAS cette cible.
   *
   * Ce n'est pas un oubli, c'est la distinction qui compte : « reçu avant J+5 »
   * est une mesure de PONCTUALITÉ, « reçu à la clôture » est un état à un
   * instant. Les 85 % de la source portent sur la première. Coller la cible sur
   * la seconde donnerait un chiffre vert le 31 du mois sur un espace où tous les
   * relevés sont arrivés le 28 — c'est-à-dire trois semaines trop tard pour
   * facturer, ce que la cible existait justement pour dire.
   */
  {
    kpi: 'dso_days',
    direction: 'below',
    unit: 'days',
    bound: 65,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « DSO opérationnel (< 65 j) » ; repère du §1 : DSO PME/ETI 65 jours, retard de paiement moyen 13,6 jours`,
  },
  {
    kpi: 'renewal_rate',
    direction: 'above',
    unit: 'percent',
    bound: 60,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « taux de renouvellement (> 60 %) » ; repris au §7, « N15 taux de renouvellement (cible > 60 %) »`,
  },
  {
    kpi: 'missions_ending_without_plan',
    direction: 'zero',
    unit: 'count',
    bound: 0,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « missions T-30 sans plan (0) » ; §7, « missions T-30 sans plan (cible 0) »`,
  },
  {
    kpi: 'bench_rate',
    direction: 'below',
    unit: 'percent',
    bound: 5,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « taux d'intercontrat (< 5 % bien piloté) » ; repère du §1 : moyenne de marché 11,4 %`,
  },
  {
    kpi: 'bench_duration_days',
    direction: 'below',
    unit: 'days',
    bound: 41,
    upperBound: null,
    measures: 'performance',
    source: `${PDF5} « durée moyenne d'intercontrat (< 41 j) » ; repère du §1 : « intercontrat moyen 11,4 % pour 41 jours, ≈ 5 480 €/mois par consultant »`,
  },
  {
    kpi: 'unmeasurable_missions',
    direction: 'below',
    unit: 'percent',
    bound: 20,
    upperBound: null,
    measures: 'completeness',
    source: `${PDF5} « missions non mesurables (< 20 %) » ; §5.1, « moins de 3 axes sur 7 ⇒ non mesurable, avec la liste de ce qui manque »`,
  },
]

/**
 * La cible d'un indicateur, ou `null`.
 *
 * `null` veut dire « la source ne chiffre pas celui-là », et l'écran l'affiche
 * alors sans cible plutôt qu'avec une cible devinée. C'est la même discipline
 * que partout ailleurs : on n'invente pas la donnée qui manque.
 */
export function kpiTarget(key: string, targets: readonly KpiTarget[] = KPI_TARGETS): KpiTarget | null {
  return targets.find(target => target.kpi === key) ?? null
}

/**
 * Où en est-on par rapport à la cible.
 *
 * ⚠️ TROIS états, jamais deux. `unmeasured` n'est pas un `off_target` poli : les
 * deux appellent des gestes opposés. « DSO 71 j, cible < 65 » fait relancer des
 * clients ; « DSO non mesurable, 6 factures sur 10 » fait enregistrer des
 * paiements. Les fondre ferait relancer des clients qui ont payé.
 *
 * Et surtout : une valeur absente ne se compare PAS comme un zéro. Un délai de
 * paiement inconnu traité comme `0` passerait la cible « < 65 j » haut la main
 * et s'afficherait vert — « on est payé le jour même », le meilleur résultat
 * imaginable, sur un espace où l'on ne sait rien.
 */
export type KpiTargetStatus = 'on_target' | 'off_target' | 'unmeasured'

export function compareToTarget(value: number | null | undefined, target: KpiTarget): KpiTargetStatus {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'unmeasured'
  switch (target.direction) {
    case 'below':
      return value < target.bound ? 'on_target' : 'off_target'
    case 'above':
      return value > target.bound ? 'on_target' : 'off_target'
    case 'band':
      // `upperBound` est garanti par le schéma ; le repli protège une donnée
      // qui arriverait d'ailleurs que de cette liste.
      if (target.upperBound === null) return 'unmeasured'
      return value >= target.bound && value <= target.upperBound ? 'on_target' : 'off_target'
    case 'zero':
      // Un compte négatif n'est pas « mieux que zéro » : c'est une lecture qu'on
      // ne sait pas interpréter, et la réponse honnête est qu'on ne sait pas.
      if (value < 0) return 'unmeasured'
      return value === 0 ? 'on_target' : 'off_target'
  }
}
