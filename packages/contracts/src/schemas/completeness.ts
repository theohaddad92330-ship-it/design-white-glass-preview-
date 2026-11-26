import { z } from 'zod'

/* ------------------------------------------------------------------ */
/*  Complétude — « calculé sur … »                                     */
/*                                                                     */
/*  Tome 7, partie A, loi 2 « partout, sans exception », élément n°6 :  */
/*  « Complétude — “calculé sur 62 % de tes données” — à créer —       */
/*   absent de TOUS les agrégats. »                                    */
/* ------------------------------------------------------------------ */

/**
 * Ce sur quoi un agrégat est calculé, et ce qui en est SORTI.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CONTRAT EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le produit tient déjà la doctrine **au calcul** : « un axe non évaluable sort
 * du dénominateur, sinon le score mesure la complétude de nos données »
 * (`ScoreWithAxes`), et « un taux sans dénominateur vaut `null`, pas 0 % »
 * (`rate()` du pilotage). Puis un écran affiche « 62 » ou « 4 300 € » tout seul,
 * et le lecteur suppose une mesure COMPLÈTE — parce qu'un chiffre nu se lit
 * toujours comme une vérité entière.
 *
 * C'est la version AFFICHABLE de la même règle : un agrégat dit sur combien
 * d'éléments il est calculé, et nomme ceux qui en sont sortis.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE DÉRIVATION, ET PAS UNE PHRASE PAR ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré le 29/08/2026 avant ce chantier : **quatre** écrans recomposaient
 * l'idée à la main, chacun avec sa formulation et ses propres règles de bord —
 * `pilotage.json:6` (« {{measured}} des {{total}} maillons sont mesurés »),
 * `territory.json:10` (« {{resolved}} entités résolues sur {{total}} »),
 * `pilotage.json:114` (« {{count}} affaire lue »), `contacts.json:355`
 * (« {{points}} points obtenus sur {{evaluatedMax}} évaluables »). Aucune ne
 * traitait le dénominateur NON LU, et deux affichaient un pourcentage sur une
 * population vide. « Une dérivation vit à un seul endroit — deux chemins qui la
 * refont divergent. »
 */
export const completenessSchema = z.object({
  /** Combien d'éléments sont ENTRÉS dans le calcul. Zéro est une mesure. */
  counted: z.number().int().nonnegative(),
  /**
   * La population de référence.
   *
   * `null` veut dire UNE chose : on n'a pas pu la compter. Ni « elle est vide »
   * (c'est `0`), ni « il n'y en a pas » — c'est l'invariant `null` du pilotage,
   * repris tel quel. La clé est OBLIGATOIRE, et c'est le point : l'absence de
   * clé laisserait un agrégat oublier son dénominateur en silence, ce qui est
   * exactement le défaut que ce contrat existe pour rendre impossible.
   */
  total: z.number().int().nonnegative().nullable(),
  /**
   * Ce qui est sorti du dénominateur, NOMMÉ.
   *
   * Même discipline que les axes non évaluables d'un score : « 13 exclus »
   * n'apprend rien, « 13 sans montant saisi » dit quoi compléter pour que
   * l'agrégat devienne fiable.
   */
  excluded: z.array(z.string()).optional(),
})
export type Completeness = z.infer<typeof completenessSchema>

/**
 * Le verdict de complétude — quatre états, et ils ne disent pas la même chose.
 *
 * `unknownTotal` ne porte AUCUNE part : c'est tout l'objet du type. Une part
 * calculée sur un dénominateur qu'on n'a pas lu serait une opinion présentée
 * comme une mesure.
 */
export type CompletenessVerdict =
  | { kind: 'complete'; counted: number; total: number; excluded: string[] }
  | { kind: 'partial'; counted: number; total: number; share: number; excluded: string[] }
  | { kind: 'unknownTotal'; counted: number; excluded: string[] }
  | { kind: 'nothingToCount'; excluded: string[] }

/**
 * Sur combien cet agrégat est-il calculé ?
 *
 * Pure : mêmes entrées → même verdict. Les cinq refus, dans l'ordre où ils se
 * présentent, et chacun pour une raison distincte :
 *
 *  1. **Dénominateur NON LU** (`null`, `NaN`, négatif) → `unknownTotal`. Une
 *     part sur un total qu'on ignore n'est pas une mesure. Le dire coûte une
 *     phrase ; le taire fait passer un échantillon pour une population.
 *  2. **Numérateur illisible** → `unknownTotal` pour la même raison, dans
 *     l'autre sens.
 *  3. **Population VIDE** (`total === 0`) → `nothingToCount`. « 0 % » sur zéro
 *     élément est une division par rien, pas un résultat nul. C'est la règle de
 *     `rate()` du pilotage, appliquée ici.
 *  4. **Dénominateur plus petit que son numérateur** → `unknownTotal`. On ne
 *     devine pas lequel des deux est faux et on ne rogne pas en silence :
 *     rogner écrirait « calculé sur toute la population » sur une paire
 *     incohérente — la promesse inverse de celle de cette primitive.
 *  5. **Complet** (`counted === total`) → `complete`, SANS part. Un « 100 % »
 *     est du bruit : il n'apprend rien que le mot « toutes » ne dise mieux.
 *
 * Ce qui n'est PAS un refus : un numérateur nul sur une population réelle. Zéro
 * sur trente-quatre est une mesure, et c'est même le décrochage qu'on veut voir.
 */
export function deriveCompleteness({ counted, total, excluded }: Completeness): CompletenessVerdict {
  // Un libellé vide n'exclut rien de nommé — il ferait apparaître « Hors du
  // calcul : » suivi de rien, ce qui se lit comme un défaut d'affichage.
  const named = (excluded ?? []).map(label => label.trim()).filter(label => label.length > 0)

  const countedIsReadable = Number.isFinite(counted) && counted >= 0
  const totalIsReadable = total !== null && Number.isFinite(total) && total >= 0

  if (!countedIsReadable) return { kind: 'unknownTotal', counted: 0, excluded: named }
  if (!totalIsReadable) return { kind: 'unknownTotal', counted, excluded: named }
  if (total === 0) return { kind: 'nothingToCount', excluded: named }
  if (counted > total) return { kind: 'unknownTotal', counted, excluded: named }
  if (counted === total) return { kind: 'complete', counted, total, excluded: named }

  return {
    kind: 'partial',
    counted,
    total,
    // Un point de pourcentage entier. Une décimale sur une complétude donnerait
    // une fausse précision : « 61,8 % de tes données » suggère qu'on a compté ce
    // qu'on n'a justement pas compté.
    share: Math.round((counted / total) * 100),
    excluded: named,
  }
}
