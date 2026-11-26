/**
 * Le BURN et le RUNWAY, dérivés d'une trésorerie SAISIE À LA MAIN (#1649).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DE LA SAISIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune connexion bancaire n'existe, et en inventer une serait un chantier à
 * part. Deux minutes de saisie mensuelle débloquent les deux chiffres qui
 * décident si l'entreprise vit. Inventer un solde serait pire que rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LE LITTÉRAL DE #1649 EST INCOMPLET, ET ON NE PEUT PAS LE LIVRER TEL QUEL
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue demande TROIS champs saisis (solde, dépenses fixes, dépenses
 * variables) puis une ligne dérivée :
 *
 *     Burn du mois = fixes + variables − encaissements du mois
 *
 * Les encaissements n'y sont ni saisis ni dérivables : ce sont des ENTRÉES DE
 * CAISSE, et le dépôt n'en a aucune trace — le MRR est une position théorique
 * (grille × abonnements), pas de l'argent arrivé, et une facture marquée
 * « payée » ne porte pas sa date d'encaissement (`paid_on` reste honnêtement
 * NULL, voir `manual-billing-schedule.ts`). Dériver les encaissements du MRR
 * ferait passer une estimation pour de la caisse.
 *
 * D'où un QUATRIÈME champ saisi — « Encaissements du mois » — qui garde la
 * formule de l'issue EXACTE au lieu de la tronquer. Un mois dont les
 * encaissements n'ont pas été saisis vaut `null`, pas zéro : « je n'ai pas
 * relevé » n'est pas « je n'ai rien encaissé », et la différence change le
 * signe du burn.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Aucun mois n'est pré-rempli avec le précédent.
 *  - Un mois non saisi produit « non mesuré » partout, jamais une estimation.
 *  - Le burn moyen exige AU MOINS 2 mois saisis. Un seul mois ne fait pas une
 *    moyenne — c'est le test explicite de l'issue.
 *  - L'historique est immuable au sens où on CORRIGE un mois ; on ne recalcule
 *    jamais les précédents à partir de lui.
 */

/** Un mois de trésorerie tel qu'il est SAISI. Tout est en centimes. */
export interface TreasuryMonth {
  /** `YYYY-MM`. */
  month: string
  /** Solde bancaire au 1er du mois. `null` = non relevé, jamais zéro. */
  bankBalanceCents: number | null
  /** Salaires, outils, hébergement. */
  fixedExpensesCents: number | null
  /** Fournisseurs IA, ponctuel. */
  variableExpensesCents: number | null
  /** Ce qui est RÉELLEMENT entré en caisse — voir l'avertissement du fichier. */
  collectedCents: number | null
}

/**
 * Le burn d'UN mois, ou `null` si l'un de ses trois termes manque.
 *
 * Un burn calculé avec des encaissements absents serait systématiquement trop
 * haut, et il aurait l'air d'un chiffre.
 */
export function burnOf(month: TreasuryMonth): number | null {
  const { fixedExpensesCents, variableExpensesCents, collectedCents } = month
  if (fixedExpensesCents === null || variableExpensesCents === null || collectedCents === null) return null
  return fixedExpensesCents + variableExpensesCents - collectedCents
}

/**
 * Le burn MOYEN des trois derniers mois mesurés, `upTo` compris.
 *
 * « Des trois derniers » : on prend les trois mois les plus récents dont le
 * burn est mesurable, jamais une fenêtre calendaire fixe — un trou de saisie en
 * juillet ne doit pas faire disparaître la moyenne d'août.
 */
export function averageBurnCents(
  months: readonly TreasuryMonth[],
  upTo: string,
): { measured: true; cents: number; monthsUsed: number } | { measured: false; reason: 'not_enough_months' } {
  const usable = months
    .filter(month => month.month <= upTo)
    .map(month => ({ month: month.month, burn: burnOf(month) }))
    .filter((row): row is { month: string; burn: number } => row.burn !== null)
    .sort((a, b) => (a.month < b.month ? 1 : -1))
    .slice(0, 3)

  // #1649 — « Le burn moyen exige AU MOINS 2 mois saisis. »
  if (usable.length < 2) return { measured: false, reason: 'not_enough_months' }

  const sum = usable.reduce((acc, row) => acc + row.burn, 0)
  return { measured: true, cents: Math.round(sum / usable.length), monthsUsed: usable.length }
}

/**
 * Le runway en mois : solde / burn moyen.
 *
 * ⚠️ Les trois raisons de refus sont écrites EN CLAIR dans la signature, pas
 * derrière un alias exporté : un nom de type qu'aucun appelant ne prononce se
 * met à diverger de ce qu'il désigne.
 *
 * Chacune a une phrase différente à l'écran :
 *  - moins de deux mois saisis → il faut deux mois ;
 *  - aucun solde relevé → il n'y a rien à diviser ;
 *  - un burn nul ou négatif → l'entreprise ne brûle pas ce trimestre-là. Rendre
 *    « ∞ » ou un très grand nombre ferait passer trois mois d'encaissements
 *    exceptionnels pour une santé durable.
 */
export function runwayMonths(
  months: readonly TreasuryMonth[],
  upTo: string,
):
  | { measured: true; months: number; averageBurnCents: number }
  | { measured: false; reason: 'not_enough_months' | 'no_balance' | 'not_burning' } {
  const balance = months.find(month => month.month === upTo)?.bankBalanceCents ?? null
  if (balance === null) return { measured: false, reason: 'no_balance' }

  const average = averageBurnCents(months, upTo)
  if (!average.measured) return { measured: false, reason: average.reason }
  if (average.cents <= 0) return { measured: false, reason: 'not_burning' }

  return {
    measured: true,
    months: Math.round((balance / average.cents) * 10) / 10,
    averageBurnCents: average.cents,
  }
}
