import type { CapacityForecast, DsoResult, Measurability, NumberExplanation, RevenueLine } from '@bellum/contracts'

/**
 * LES QUATRE CHIFFRES DOTÉS DU GESTE — PDF 6 §5.1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CES QUATRE, ET PAS QUINZE
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un explique branché sur quinze chiffres à moitié ne vaut rien. » Ces quatre
 * ont été choisis pour une raison mesurable : leur calcul porte DÉJÀ sa
 * complétude côté serveur — `measurability`, `undatable`, `disputed`,
 * `measured`/`unmeasured`, `withoutAmount`/`sourceRows`. La ligne obligatoire
 * n'a donc rien à inventer, ce qui est la seule façon de la livrer honnêtement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CHAQUE LIGNE DIT, ET CE QU'ELLE REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * FORMULE    l'énoncé, en toutes lettres. Traduit, jamais dérivé du code.
 * CALCUL     les OPÉRANDES réellement combinées. Le taux d'intercontrat porte
 *            le littéral du §5.1 (« 7 / 56 ») parce que ses deux termes sont
 *            dans la réponse ; les trois autres portent la méthode et le nombre
 *            d'observations (« médiane de 12 délais »), parce que leurs termes
 *            internes ne sortent pas de l'API. Écrire une arithmétique qu'on n'a
 *            pas serait pire que de dire ce qu'on a.
 * SOURCE     d'où vient le chiffre. La DATE de calcul n'est pas rendue par ces
 *            quatre routes : `computedAt` vaut donc `null`, et le panneau
 *            n'écrit pas d'heure plutôt que d'écrire celle de la requête —
 *            « recalculé à 06:12 » serait un horodatage indiscernable du sien.
 * COMPLÉTUDE obligatoire. Portée par `<Completeness>` / `deriveCompleteness`.
 * SEUIL      vient de `kpiTarget` via `formatKpiTarget`, formaté par l'appelant :
 *            un seuil vit à un seul endroit (GA-26), et le réécrire ici
 *            divergerait le jour où quelqu'un change la cible.
 * DÉCISION   la SEULE conséquence que le dépôt code réellement sur ces chiffres :
 *            sous le seuil de MESURABILITÉ, l'écran retire la comparaison à la
 *            cible (`targetValue` n'est pas passé au badge). Le panneau le dit,
 *            avec ce qui manque. Au-dessus du seuil, aucune consigne n'est
 *            codée — la ligne disparaît plutôt que d'en inventer une. ⚠️ Le
 *            seuil d'ALERTE de marge, lui, est un réglage d'espace que cet
 *            écran n'interroge pas : l'annoncer d'ici serait le deviner.
 *
 * ⚠️ Chaque constructeur rend `null` — donc AUCUN geste — dès que son chiffre
 * n'est pas là ou que ses opérandes ne sont pas lisibles. C'est la règle : un
 * chiffre qui ne sait pas expliquer son calcul n'affiche pas le bouton.
 */

/** Un traducteur du namespace `explain`, tel que `useTranslation` le rend. */
type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * LA SEULE DÉCISION QUE LE DÉPÔT CODE SUR CES CHIFFRES.
 *
 * Sous le seuil de mesurabilité, l'écran RETIRE la comparaison à la cible — il
 * ne passe pas `targetValue` au badge. C'est une conséquence réelle, écrite
 * dans le code, et l'utilisateur ne la voit pas : il voit un chiffre sans badge
 * et ne sait pas pourquoi. Le panneau la nomme, avec ce qui manque.
 *
 * Au-dessus du seuil, `null` : aucune consigne n'est codée, et en écrire une
 * (« si > 10 %, revoyez vos TJM ») serait une opinion signée du produit.
 */
function notMeasurableDecision(state: Measurability | undefined, t: Translate): string | null {
  if (!state || state.measurable) return null
  return t('decision.notMeasurable', { count: state.missing })
}

/**
 * TAUX D'INTERCONTRAT — l'exemple même du §5.1.
 *
 * Le seul des quatre dont le CALCUL est le littéral de la source : `onBench` et
 * le nombre de consultants comptés sont tous deux dans la réponse.
 */
export function benchRateExplanation(
  capacity: CapacityForecast | undefined,
  thresholds: readonly string[],
  t: Translate,
): NumberExplanation | null {
  const bench = capacity?.bench
  if (!bench || bench.rate === null) return null
  const people = bench.measurability.observed
  // Un dénominateur nul ne produit pas un taux : `computeCapacity` l'interdit
  // déjà, et le vérifier ici évite d'écrire « 0 / 0 » si la garantie changeait.
  if (people <= 0) return null

  return {
    metric: 'bench_rate',
    formula: t('formula.bench_rate'),
    calculation: `${bench.onBench} / ${people}`,
    source: { label: t('source.bench_rate'), computedAt: null },
    completeness: {
      counted: people,
      // ⚠️ `unmeasured` compte les consultants que la capacité n'a pas su lire.
      // Les additionner donne la population de départ ; les taire ferait passer
      // un échantillon pour l'effectif.
      total: people + capacity.unmeasured,
      excluded: capacity.unmeasured > 0 ? [t('excluded.bench_rate', { count: capacity.unmeasured })] : undefined,
    },
    thresholds,
    decision: notMeasurableDecision(bench.measurability, t),
  }
}

/**
 * MARGE COMMERCIALE — l'exemple du brief : « 28 % sur les 9 missions qui
 * portent un coût chargé, 4 n'en ont pas ».
 *
 * #2575.3 — ce chiffre est `aggregateMargin` (packages/contracts/src/schemas/
 * revenue.ts), le niveau COMMERCIAL du moteur, pas son niveau `gross`. Le nom
 * de la fonction en tenait pas compte ; il portait « brute » sur un nombre
 * commercial.
 *
 * `measurability` est OPTIONNEL dans la signature : la marge est le seul des
 * quatre dont l'écran affiche le chiffre MÊME sous le seuil (« sous le seuil, le
 * chiffre reste calculé »). Un appelant qui ne lit pas cet état obtient une
 * explication sans ligne DÉCISION, jamais une ligne fausse.
 */
export function commercialMarginExplanation(
  margin:
    | { marginPercent: number | null; measured: number; unmeasured: number; measurability?: Measurability }
    | undefined,
  thresholds: readonly string[],
  t: Translate,
): NumberExplanation | null {
  if (!margin || margin.marginPercent === null) return null
  if (margin.measured <= 0) return null

  return {
    metric: 'gross_margin',
    formula: t('formula.gross_margin'),
    calculation: t('calculation.gross_margin', { count: margin.measured }),
    source: { label: t('source.gross_margin'), computedAt: null },
    completeness: {
      counted: margin.measured,
      total: margin.measured + margin.unmeasured,
      excluded: margin.unmeasured > 0 ? [t('excluded.gross_margin', { count: margin.unmeasured })] : undefined,
    },
    thresholds,
    decision: notMeasurableDecision(margin.measurability, t),
  }
}

/**
 * DÉLAI DE PAIEMENT — deux exclusions distinctes, et elles ne se confondent pas.
 *
 * `undatable` (dates inexploitables) et `disputed` (factures en litige, sorties
 * par le `WHERE` de la requête) sont comptées SÉPARÉMENT. ⚠️ `disputed === null`
 * veut dire « on n'a pas su compter », pas « aucune contestée » : la ligne
 * d'exclusion disparaît alors plutôt que d'annoncer un zéro qu'aucune mesure
 * n'a produit.
 */
export function dsoExplanation(
  dso: DsoResult | undefined,
  thresholds: readonly string[],
  t: Translate,
): NumberExplanation | null {
  if (!dso || dso.days === null) return null
  const counted = dso.measurability.observed
  if (counted <= 0) return null

  const excluded: string[] = []
  if (dso.undatable > 0) excluded.push(t('excluded.dso_undatable', { count: dso.undatable }))
  if (dso.disputed !== null && dso.disputed > 0) {
    excluded.push(t('excluded.dso_disputed', { count: dso.disputed }))
  }

  return {
    metric: 'dso_days',
    formula: t('formula.dso_days'),
    calculation: t('calculation.dso_days', { count: counted }),
    source: { label: t('source.dso_days'), computedAt: null },
    completeness: {
      counted,
      // ⚠️ `disputed` non lu ⇒ le TOTAL est inconnu, pas « counted + undatable ».
      // Une population amputée d'un terme qu'on sait manquant se lirait comme
      // une population complète.
      total: dso.disputed === null ? null : counted + dso.undatable + dso.disputed,
      excluded: excluded.length > 0 ? excluded : undefined,
    },
    thresholds,
    decision: notMeasurableDecision(dso.measurability, t),
  }
}

/**
 * CA SIGNÉ — la somme des lignes qui ont pu être chiffrées.
 *
 * ⚠️ `sourceRows === null` retire le geste : le champ est récent, et un écran
 * servi par une API antérieure ne connaît pas son dénominateur. Expliquer sans
 * pouvoir dire sur quoi serait exactement ce que la ligne COMPLÉTUDE interdit.
 */
export function signedRevenueExplanation(line: RevenueLine | undefined, t: Translate): NumberExplanation | null {
  if (!line || line.amountCents === null || line.sourceRows === null) return null
  const counted = Math.max(0, line.sourceRows - line.withoutAmount)
  if (counted <= 0) return null

  return {
    metric: 'signed_revenue',
    formula: t('formula.signed_revenue'),
    calculation: t('calculation.signed_revenue', { count: counted }),
    source: { label: t('source.signed_revenue'), computedAt: null },
    completeness: {
      counted,
      total: line.sourceRows,
      excluded: line.withoutAmount > 0 ? [t('excluded.signed_revenue', { count: line.withoutAmount })] : undefined,
    },
    // Aucune cible chiffrée sur le CA signé : la source n'en pose pas, et en
    // inventer une ferait comparer un montant à une opinion.
    thresholds: [],
    decision: null,
  }
}
