import { quantile } from './market-memory-cohort-index.js'

/**
 * #1638.2 — LA PRÉVALENCE D'UNE TECHNOLOGIE DANS NOTRE RÉFÉRENTIEL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE DIT, ET CE QU'ELLE NE DIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Sur combien d'entreprises de NOTRE corpus cette technologie est-elle
 * observée, comparé aux autres technologies du MÊME corpus ? » — et rien
 * d'autre. C'est une propriété de ce que NOUS SAVONS, jamais un fait de marché
 * (doctrine `c65_couverture_nest_pas_un_fait_de_marche`, garde GA-259) : « rare
 * dans notre référentiel » ne veut pas dire « rare sur le marché », et le
 * complément ne veut pas dire « personne ne la demande ».
 *
 * ⚠️ Elle ne CLASSE PAS les preuves, et le retour qui la commande est explicite
 * sur ce point : « ne jamais utiliser le volume brut pour dire qu'une preuve est
 * meilleure — un savoir-faire rare peut être plus pertinent qu'un savoir-faire
 * ubiquitaire ». D'où trois PALIERS NOMMÉS et aucun scalaire : un nombre se
 * trierait, un palier se lit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES QUANTILES, ET PAS UN SEUIL ÉCRIT À LA MAIN
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour dit « uniquement après calibration ». Le dépôt a déjà payé le
 * contraire une fois : `MARKET_TECHNO_UBIQUITY_MAX_SHARE`
 * (`market-techno-affinity.ts`) est une PART FIXE — un quart — dont le
 * docblock reconnaît en toutes lettres qu'elle « n'est pas ancrée sur une
 * mesure », faute d'avoir pu lire la distribution du corpus depuis un poste de
 * développement.
 *
 * Une borne calculée en QUANTILE n'a pas ce défaut : elle est une propriété de
 * la distribution elle-même, quelle qu'elle soit. La calibration n'est pas
 * reportée à plus tard, elle est REFAITE à chaque lecture sur le corpus du
 * jour — c'est aussi pourquoi les bornes ne sont écrites nulle part et ne
 * peuvent pas vieillir. Le mot « relativement » du libellé est vrai par
 * construction : un tiers est un rang, pas une affirmation absolue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE REFUS — une mesure impossible ne dit jamais « tout va bien »
 * ─────────────────────────────────────────────────────────────────────────────
 * {@link technoPrevalenceScale} rend `null`, et l'écran se tait, dans quatre cas :
 *
 * 1. **Moins de {@link TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS} technologies
 *    mesurées.** Un tiers calculé sur dix valeurs est un artefact du hasard.
 * 2. **Bornes EFFONDRÉES** (`rareMax >= specialiseeMax`). C'est le cas d'un
 *    corpus où une même valeur occupe les deux tiers du bas : les quantiles
 *    tombent au même endroit, et il n'y a plus trois paliers mais un.
 * 3. **Un palier MAJORITAIRE.** Les bornes peuvent ne pas s'effondrer et
 *    laisser quand même « rare » désigner deux technologies sur trois — le nom
 *    du palier contredirait alors ce qu'il compte. Une majorité n'est pas une
 *    rareté : c'est une propriété du mot, pas un réglage.
 * 4. **Un palier « courante » VIDE.** Si rien n'est au-dessus de la borne
 *    haute, les deux autres paliers mentent sur ce qu'ils excluent.
 *
 * Et {@link technoPrevalenceOf} rend `null` pour une technologie ABSENTE de la
 * table des fréquences : sa fréquence est inconnue, et « inconnu » n'est pas
 * « rare » — la même règle que `discriminantCommonTechnos`.
 */

/** Les trois paliers, du plus rare au plus répandu. La liste EXHAUSTIVE. */
export const TECHNO_PREVALENCE_TIERS = ['rare', 'specialisee', 'courante'] as const
export type TechnoPrevalenceTier = (typeof TECHNO_PREVALENCE_TIERS)[number]

/**
 * Combien de technologies DISTINCTES le corpus doit mesurer pour qu'un tiers
 * veuille dire quelque chose.
 *
 * ⚠️ **C'est le SEUL nombre de ce fichier qui ne soit pas une propriété du
 * corpus**, et il faut le dire — les deux bornes, elles, se calculent. Trente
 * laisse dix technologies par palier au minimum : sous ce nombre, une borne se
 * déplace au gré d'UNE seule ligne du corpus, et le palier d'une technologie
 * changerait au prochain import sans que rien n'ait changé pour elle.
 *
 * Son mode d'échec est le SILENCE : sous ce plancher, aucune échelle, donc
 * aucun libellé. Il ne peut pas produire une catégorie fausse, seulement
 * l'absence de catégorie — c'est ce qui permet de l'écrire sans avoir lu la
 * distribution réelle.
 *
 * Il vit ICI et nulle part ailleurs (GA-26).
 */
export const TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS = 30

/**
 * Aucun palier ne peut désigner PLUS que cette part du corpus.
 *
 * La moitié, et ce n'est pas un réglage : c'est la définition des mots. Un
 * palier qui compte la majorité des technologies du corpus ne peut pas
 * s'appeler « rare », ni « spécialisée ». La seule chose à en faire est de se
 * taire.
 */
const TIER_MAJORITY_SHARE = 0.5

/**
 * Les deux bornes, calculées sur la distribution du jour.
 *
 * Elles ne sont JAMAIS persistées : une borne rangée quelque part serait une
 * calibration périmée le lendemain de l'import suivant.
 */
export interface TechnoPrevalenceScale {
  /** Fréquence ≤ cette valeur ⇒ `rare`. Quantile 1/3 de la distribution. */
  readonly rareMax: number
  /** Fréquence ≤ cette valeur (et > `rareMax`) ⇒ `specialisee`. Quantile 2/3. */
  readonly specialiseeMax: number
  /** Sur combien de technologies mesurées ces bornes ont été calculées. */
  readonly distinctTechnos: number
}

/** Même normalisation que partout ailleurs sur les libellés du corpus. */
function fold(techno: string): string {
  return techno.trim().toLowerCase()
}

/** Les QUATRE raisons de ne pas produire d'échelle — la liste EXHAUSTIVE. */
export const TECHNO_PREVALENCE_REFUSALS = ['tooFewTechnos', 'collapsedBounds', 'majorityTier', 'emptyTopTier'] as const
export type TechnoPrevalenceRefusal = (typeof TECHNO_PREVALENCE_REFUSALS)[number]

/**
 * L'échelle, ou le REFUS NOMMÉ — un refus est une décision, pas une absence.
 *
 * Le nom du refus n'est lu par aucun écran (il ne dirait rien à un commercial)
 * mais il est indispensable au script de mesure : sans lui, un corpus qui ne
 * produit jamais d'échelle est indiscernable d'un corpus vide, et le bloc
 * resterait muet en production sans que personne ne sache pourquoi.
 */
export type TechnoPrevalenceScaleRead =
  | { readonly kind: 'scale'; readonly scale: TechnoPrevalenceScale }
  | { readonly kind: 'refused'; readonly reason: TechnoPrevalenceRefusal; readonly distinctTechnos: number }

/**
 * LA décision, à cet unique endroit — deux chemins qui la referaient divergent.
 *
 * @param frequency par technologie normalisée, sur combien d'entreprises du
 *                  corpus elle est observée (`MarketMemoryService`).
 */
export function technoPrevalenceScaleRead(frequency: ReadonlyMap<string, number>): TechnoPrevalenceScaleRead {
  // Une fréquence illisible ou nulle n'est pas une mesure : elle sort de la
  // distribution, elle ne la tire pas vers le bas.
  const values = [...frequency.values()].filter(value => Number.isFinite(value) && value > 0).sort((a, b) => a - b)
  const distinctTechnos = values.length
  if (distinctTechnos < TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS) {
    return { kind: 'refused', reason: 'tooFewTechnos', distinctTechnos }
  }

  const rareMax = quantile(values, 1 / 3)
  const specialiseeMax = quantile(values, 2 / 3)
  // Inatteignable au-dessus du plancher (`quantile` ne rend `null` que sur un
  // tableau vide) — la branche donne son type aux deux bornes, sans jamais
  // inventer de valeur de repli.
  if (rareMax === null || specialiseeMax === null) {
    return { kind: 'refused', reason: 'tooFewTechnos', distinctTechnos }
  }

  // #1638.2 — bornes effondrées : il n'y a plus trois paliers mais un.
  if (rareMax >= specialiseeMax) return { kind: 'refused', reason: 'collapsedBounds', distinctTechnos }
  // #1638.2 — « courante » vide : les deux autres paliers mentiraient sur ce
  // qu'ils excluent.
  if (values[distinctTechnos - 1] <= specialiseeMax) {
    return { kind: 'refused', reason: 'emptyTopTier', distinctTechnos }
  }

  // #1638.2 — un palier MAJORITAIRE : une majorité n'est pas une rareté.
  const majority = distinctTechnos * TIER_MAJORITY_SHARE
  const rareCount = values.filter(value => value <= rareMax).length
  const specialiseeCount = values.filter(value => value > rareMax && value <= specialiseeMax).length
  if (rareCount > majority || specialiseeCount > majority) {
    return { kind: 'refused', reason: 'majorityTier', distinctTechnos }
  }

  return { kind: 'scale', scale: { rareMax, specialiseeMax, distinctTechnos } }
}

/** L'échelle du corpus, ou `null` quand il n'y a rien d'affirmable. */
export function technoPrevalenceScale(frequency: ReadonlyMap<string, number>): TechnoPrevalenceScale | null {
  const read = technoPrevalenceScaleRead(frequency)
  return read.kind === 'scale' ? read.scale : null
}

/**
 * Le palier d'une fréquence DÉJÀ connue, sur une échelle DÉJÀ calculée.
 *
 * Les deux bornes sont INCLUSIVES en bas : une technologie exactement sur la
 * borne reste dans le palier du dessous. Le sens de l'inégalité doit être écrit
 * une fois et une seule — deux appelants qui la refont divergent.
 */
export function technoPrevalenceTier(companies: number, scale: TechnoPrevalenceScale): TechnoPrevalenceTier {
  if (companies <= scale.rareMax) return 'rare'
  if (companies <= scale.specialiseeMax) return 'specialisee'
  return 'courante'
}

/**
 * Le palier d'une technologie SAISIE (par qui déclare une preuve), ou `null`.
 *
 * `null` couvre les trois « on ne sait pas », qui ne se rendent JAMAIS comme un
 * palier : pas d'échelle, libellé vide, ou technologie absente de la table des
 * fréquences.
 */
export function technoPrevalenceOf(
  techno: string,
  frequency: ReadonlyMap<string, number>,
  scale: TechnoPrevalenceScale | null,
): TechnoPrevalenceTier | null {
  if (scale === null) return null
  const key = fold(techno)
  if (!key) return null
  const companies = frequency.get(key)
  // Fréquence inconnue ou illisible ⇒ aucun palier. « Inconnu » n'est pas « rare ».
  if (typeof companies !== 'number' || !Number.isFinite(companies) || companies <= 0) return null
  return technoPrevalenceTier(companies, scale)
}
