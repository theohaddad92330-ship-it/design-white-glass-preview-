/**
 * La DÉCOMPOSITION du MRR d'un mois — pure, sans base, sans horloge (#1645).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN INSTANTANÉ, ET PAS UN CALCUL À LA VOLÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un client qui change d'offre le 15 modifie RÉTROACTIVEMENT le MRR de tous les
 * mois passés si on recalcule. L'instantané fige ce qui était vrai ce mois-là.
 * C'est la seule façon d'avoir une série cohérente — et c'est aussi pourquoi ce
 * fichier ne lit rien : il reçoit deux photographies et rend leur différence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL REFUSE DE DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **Le premier mois n'a pas de `mrrStart`.** Il vaut `null`, jamais `0` :
 *    « nous n'avions rien mesuré avant » n'est pas « nous avions zéro euro ».
 *    Les cinq mouvements sont `null` avec lui — une différence sans terme de
 *    comparaison n'existe pas. Seul `mrrEnd` est mesuré.
 *  - **Le MRR n'inclut QUE le récurrent.** Un client sur facture n'entre jamais
 *    dans `mrrNew` : son engagement annuel facturé en une fois n'est pas du MRR.
 *    C'est {@link contractedMonthlyCents} qui le compte, à CÔTÉ, et les deux ne
 *    s'additionnent jamais sans une ligne qui le dit.
 *  - **Une chute à zéro est un départ, pas une contraction.** Une ligne dont le
 *    MRR tombe à zéro n'est plus un client payant : elle sort du corpus en
 *    amont, si bien qu'elle apparaît en `churned`. C'est ce qui garde
 *    `customersEnd` égal au nombre de gens qui paient vraiment.
 */

/** Le MRR d'UN abonné à l'instant de la photographie. Toujours > 0 : une ligne
 *  à zéro n'est pas un client payant, elle n'entre pas dans le corpus. */
export interface SnapshotLine {
  /** Identifiant STABLE du sujet facturé — l'`user_id` de sa ligne d'abonnement. */
  subjectId: string
  mrrCents: number
}

/**
 * La décomposition d'un mois.
 *
 * `null` partout où le mois précédent manque : la série commence quelque part,
 * et son premier point n'a pas de delta. Voir le docblock du fichier.
 */
export interface MrrMovements {
  mrrStartCents: number | null
  mrrNewCents: number | null
  mrrExpansionCents: number | null
  mrrContractionCents: number | null
  mrrChurnedCents: number | null
  mrrEndCents: number
  customersStart: number | null
  customersNew: number | null
  customersChurned: number | null
  customersEnd: number
}

function total(lines: readonly SnapshotLine[]): number {
  return lines.reduce((sum, line) => sum + line.mrrCents, 0)
}

/** Les quatre natures d'un mouvement PAR CLIENT — mêmes mots que la tuile
 *  cockpit (`cockpit-business.logic.ts`, #1646.4/#1646.6). */
export type LineMovementNature = 'nouveau' | 'expansion' | 'contraction' | 'attrition'

/**
 * Une ligne du tableau des mouvements du mois (#1646.6) — un client, une
 * nature, un montant. Le nom du client et la date se posent AU-DESSUS
 * (`BusinessMetricsService.monthlyClientMovements`) : ce fichier ne lit rien,
 * il compare deux photographies.
 *
 * NON exporté : seul `lineMovements` ci-dessous le nomme, et son type de
 * retour s'infère sans qu'aucun appelant ait besoin de l'importer par son nom
 * (knip refuse un type exporté qui n'a de lecteur que dans son propre fichier).
 */
interface LineMovement {
  subjectId: string
  nature: LineMovementNature
  montantCents: number
}

/**
 * Compare deux photographies AU NIVEAU LIGNE et classe chaque euro qui bouge
 * dans une et une seule nature (#1646.6).
 *
 * ⚠️ SOURCE UNIQUE de cette classification — `computeMovements` ci-dessous
 * l'agrège au lieu de la refaire (GA-26). Un client qui ne bouge pas n'a
 * AUCUNE ligne : « rien à dire sur lui ce mois-ci » plutôt qu'une ligne à 0,
 * qui grossirait le tableau sans rien y ajouter.
 *
 * `previous === null` (aucun mois précédent) rend un tableau VIDE — comme
 * pour l'agrégat, une différence sans terme de comparaison n'existe pas.
 */
export function lineMovements(
  previous: readonly SnapshotLine[] | null,
  current: readonly SnapshotLine[],
): LineMovement[] {
  if (previous === null) return []

  const before = new Map(previous.map(line => [line.subjectId, line.mrrCents]))
  const after = new Map(current.map(line => [line.subjectId, line.mrrCents]))
  const rows: LineMovement[] = []

  for (const [subjectId, cents] of after) {
    const was = before.get(subjectId)
    if (was === undefined) {
      rows.push({ subjectId, nature: 'nouveau', montantCents: cents })
    } else if (cents > was) {
      rows.push({ subjectId, nature: 'expansion', montantCents: cents - was })
    } else if (cents < was) {
      rows.push({ subjectId, nature: 'contraction', montantCents: was - cents })
    }
  }

  for (const [subjectId, cents] of before) {
    if (after.has(subjectId)) continue
    rows.push({ subjectId, nature: 'attrition', montantCents: cents })
  }

  return rows
}

/**
 * Compare deux photographies et rend les cinq mouvements AGRÉGÉS.
 *
 * L'invariant que le test T2 de #1645 exige tient PAR CONSTRUCTION :
 * `mrrEnd = mrrStart + new + expansion − contraction − churned`, exactement.
 * Chaque euro de `current` est classé dans un et un seul seau, et chaque euro
 * de `previous` qui n'est plus là est retiré dans un et un seul seau — c'est
 * {@link lineMovements} qui fait ce classement, une seule fois (GA-26) ; cette
 * fonction ne fait plus que le sommer.
 *
 * @param previous la photographie du mois précédent, ou `null` s'il n'y en a
 *   pas — ce qui n'est PAS la même chose qu'un tableau vide (« zéro client
 *   payant, mesuré »).
 */
export function computeMovements(
  previous: readonly SnapshotLine[] | null,
  current: readonly SnapshotLine[],
): MrrMovements {
  const mrrEndCents = total(current)
  const customersEnd = current.length

  if (previous === null) {
    return {
      mrrStartCents: null,
      mrrNewCents: null,
      mrrExpansionCents: null,
      mrrContractionCents: null,
      mrrChurnedCents: null,
      mrrEndCents,
      customersStart: null,
      customersNew: null,
      customersChurned: null,
      customersEnd,
    }
  }

  const rows = lineMovements(previous, current)
  let mrrNewCents = 0
  let mrrExpansionCents = 0
  let mrrContractionCents = 0
  let mrrChurnedCents = 0
  let customersNew = 0
  let customersChurned = 0

  for (const row of rows) {
    switch (row.nature) {
      case 'nouveau':
        mrrNewCents += row.montantCents
        customersNew += 1
        break
      case 'expansion':
        mrrExpansionCents += row.montantCents
        break
      case 'contraction':
        mrrContractionCents += row.montantCents
        break
      case 'attrition':
        mrrChurnedCents += row.montantCents
        customersChurned += 1
        break
    }
  }

  return {
    mrrStartCents: total(previous),
    mrrNewCents,
    mrrExpansionCents,
    mrrContractionCents,
    mrrChurnedCents,
    mrrEndCents,
    customersStart: previous.length,
    customersNew,
    customersChurned,
    customersEnd,
  }
}

/** Une ligne d'abonnement, réduite à ce dont le MRR a besoin. */
export interface SubscriptionRow {
  userId: string
  plan: string
  extraSeats: number
  /** `manual` = client sur facture. Il ne fait JAMAIS de MRR — voir le fichier. */
  billingMode: 'stripe' | 'manual'
}

/**
 * Les lignes RÉCURRENTES d'une photographie : un abonnement Stripe payant.
 *
 * Le prix vient des deux grilles vivantes du catalogue (une modification de
 * tarif par l'opérateur s'y reflète), jamais d'une constante recopiée. Une clé
 * de plan inconnue vaut zéro et sort donc du corpus — on ne devine pas un prix.
 */
export function recurringLines(
  rows: readonly SubscriptionRow[],
  priceGridCents: Record<string, number>,
  seatPriceGridCents: Record<string, number>,
): SnapshotLine[] {
  const lines: SnapshotLine[] = []
  for (const row of rows) {
    // #1645 — « Le MRR n'inclut QUE les abonnements récurrents. »
    if (row.billingMode !== 'stripe') continue
    const planCents = priceGridCents[row.plan] ?? 0
    const seatCents = Math.max(0, row.extraSeats) * (seatPriceGridCents[row.plan] ?? 0)
    const mrrCents = planCents + seatCents
    if (mrrCents <= 0) continue
    lines.push({ subjectId: row.userId, mrrCents })
  }
  return lines
}

/** La périodicité d'un contrat sur facture, telle que la contrainte SQL
 *  `manual_billing_terms_period_check` l'autorise. */
export type ManualBillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_off'

/** Un contrat sur facture, réduit à ce dont le revenu contracté a besoin. */
export interface ManualTermRow {
  workspaceId: string
  amountCents: number
  period: ManualBillingPeriod
}

/**
 * Le revenu CONTRACTÉ mensuel des clients sur facture, et ce qui n'en est pas.
 *
 * ⚠️ `one_off` n'est PAS divisé par douze. Un montant facturé une fois n'a pas
 * d'équivalent mensuel, et lui en fabriquer un ferait apparaître un revenu
 * récurrent qui n'existe pas — la faute exacte que #1645 interdit pour le MRR.
 * Il est donc compté à part, sous son vrai nom.
 */
export function contractedMonthlyCents(rows: readonly ManualTermRow[]): {
  recurringCents: number
  recurringCustomers: number
  oneOffCents: number
  oneOffCustomers: number
} {
  let recurringCents = 0
  let recurringCustomers = 0
  let oneOffCents = 0
  let oneOffCustomers = 0

  for (const row of rows) {
    if (row.amountCents <= 0) continue
    if (row.period === 'one_off') {
      oneOffCents += row.amountCents
      oneOffCustomers += 1
      continue
    }
    const divisor = row.period === 'monthly' ? 1 : row.period === 'quarterly' ? 3 : 12
    recurringCents += Math.round(row.amountCents / divisor)
    recurringCustomers += 1
  }

  return { recurringCents, recurringCustomers, oneOffCents, oneOffCustomers }
}

/** `YYYY-MM` du mois précédent. Pur : la date d'entrée est une chaîne. */
export function previousMonth(month: string): string {
  const [yearRaw = '', monthRaw = ''] = month.split('-')
  const year = Number(yearRaw)
  const index = Number(monthRaw)
  if (!Number.isInteger(year) || !Number.isInteger(index) || index < 1 || index > 12) {
    throw new Error(`Mois illisible : ${month}`)
  }
  return index === 1 ? `${year - 1}-12` : `${year}-${String(index - 1).padStart(2, '0')}`
}

/** `YYYY-MM` d'une date. Pur : l'horloge est un paramètre, jamais `new Date()`. */
export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
