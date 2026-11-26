import {
  isDisputeOpen,
  isInvoicedState,
  isSettled,
  MAX_REMINDERS,
  outstandingAmountCents,
  overdueDaysFromDueOn,
  REMINDER_SCHEDULE_DAYS,
  reminderDue,
  type InvoiceReadiness,
} from '@bellum/contracts'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DÉRIVATIONS DE L'ÉCRAN « ENCAISSEMENTS »
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles vivent ICI et nulle part ailleurs : l'écran ne recalcule rien. Deux
 * chemins qui referaient le même retard divergeraient, et « 12 jours » sur une
 * colonne contre « 11 » sur un compteur suffit à ce que personne ne croie plus
 * ni l'un ni l'autre.
 *
 * ⚠️ Ce fichier ne DÉCIDE rien de neuf : la cadence de relance, le refus de
 * relancer une facture contestée et le pivot « échéance de règlement » vivent
 * dans `@bellum/contracts` et sont importés. Ce qui est ajouté ici est ce que
 * l'API ne rend pas encore — le RETARD hors des seuils de relance, le STATUT
 * d'encaissement d'une ligne et les quatre AGRÉGATS de la fenêtre.
 */

/**
 * Combien de mois l'écran interroge, et pourquoi douze.
 *
 * ⚠️ `GET /delivery/invoice-readiness` est MENSUEL — un mois par requête, le
 * précédent par défaut. Or l'encaissement ne tient pas dans un mois : une
 * facture émise pour juin part le 5 juillet, échoit fin août et se relance en
 * septembre. Un écran de trésorerie qui n'afficherait que le mois précédent ne
 * montrerait QUE des factures qui viennent de partir : jamais un retard, jamais
 * un encaissement. C'est-à-dire rien de ce pour quoi on l'ouvre.
 *
 * L'écran compose donc la route existante sur une fenêtre GLISSANTE d'un an, et
 * il le DIT en entête : une facture plus vieille que douze mois n'y est pas, et
 * un chiffre dont on ignore la borne est un chiffre faux.
 *
 * Ce que ça coûte : douze requêtes en parallèle, chacune mise en cache par mois
 * et partagée avec l'écran de facturation. Ce que ça évite : une route de plus,
 * un second agrégat serveur et deux totaux qui finiraient par diverger.
 */
export const COLLECTIONS_WINDOW_MONTHS = 12

/** Les mois de la fenêtre, du plus récent au plus ancien, au format `YYYY-MM`. */
export function collectionMonths(now: Date, count: number = COLLECTIONS_WINDOW_MONTHS): string[] {
  const months: string[] = []
  for (let back = 0; back < count; back += 1) {
    // Le premier du mois en UTC, reculé de `back` mois : `setUTCMonth` gère le
    // passage d'année, et partir du 1er évite le piège du 31 janvier moins un
    // mois — qui rendrait le 3 mars.
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    date.setUTCMonth(date.getUTCMonth() - back)
    months.push(date.toISOString().slice(0, 7))
  }
  return months
}

/**
 * Ce qui entre dans l'écran : les mois FACTURÉS, et eux seuls.
 *
 * L'encaissement commence à la facture. Ce qui n'est pas encore facturé se
 * répare sur `/missions/facturation`, avec ses bloqueurs et ses portes — le
 * remontrer ici ferait deux écrans qui disent la même chose, et une file
 * d'impayés qu'on ne lit plus parce qu'elle est pleine de mois qui ne sont même
 * pas dus.
 */
export function isCollectible(item: InvoiceReadiness): boolean {
  // #2197.41 — un mois DÉCLARÉ facturé attend toujours son règlement : le
  // suivi d'encaissement ne dépend pas de la preuve de connecteur.
  return isInvoicedState(item.state)
}

/**
 * Le retard, en jours pleins, à l'instant `now`.
 *
 * ⚠️ GA-26 — `overdueDaysFromDueOn` (`@bellum/contracts`) EST la formule,
 * celle de `reminderDue` ET celle de la lecture du brief
 * (`briefing.service.ts`) : recette prod 08/10, une carte annonçait 67 jours
 * et son détail 31 parce que cette formule vivait recopiée à deux endroits.
 * La différence d'USAGE reste : `reminderDue` n'expose son compteur que
 * lorsqu'une relance est due (au-delà de 5, 12 ou 20 jours), alors qu'une
 * colonne « Retard » doit savoir dire « 2 jours ».
 *
 * `null` sans échéance lisible : « on ne sait pas » et « zéro jour de retard »
 * ne se corrigent pas de la même façon — la première se répare en saisissant
 * une date, la seconde ne se répare pas du tout.
 */
export function overdueDaysAt(dueOn: string | null, now: Date): number | null {
  return overdueDaysFromDueOn(dueOn, now)
}

/**
 * La gravité d'un retard — trois bandes, aux seuils de la CADENCE.
 *
 * ⚠️ Elle suit les JOURS et non le rang de relance. Le rang dépend de combien
 * de relances ont été consignées : deux factures également en retard
 * s'affichaient de deux couleurs différentes selon qu'on avait pensé à noter un
 * appel. Les seuils, eux, ne sont pas réinventés — `REMINDER_SCHEDULE_DAYS` est
 * le réglage, il vit à un seul endroit, et une bande de plus s'y ajouterait
 * toute seule.
 */
export type OverdueSeverity = 'fresh' | 'late' | 'critical'

export function overdueSeverity(days: number): OverdueSeverity {
  if (days < REMINDER_SCHEDULE_DAYS[0]) return 'fresh'
  if (days < REMINDER_SCHEDULE_DAYS[REMINDER_SCHEDULE_DAYS.length - 1]) return 'late'
  return 'critical'
}

/**
 * Le statut d'encaissement d'une ligne facturée.
 *
 * ⚠️ Le LITIGE passe avant tout le reste, paiement partiel compris : un client
 * qui règle ce qu'il ne conteste pas laisse une ligne à la fois payée et
 * contestée, et c'est le litige qui appelle un geste. Un litige LEVÉ, lui, ne
 * masque plus rien — lever ne réécrit pas le passé, mais il rend la ligne à sa
 * file normale.
 *
 * ⚠️ Sans échéance, la ligne reste EN ATTENTE. « En retard » n'a pas de sens
 * sans pivot, et « à jour » serait un verdict conclu d'un silence : c'est
 * `withoutDueDate`, compté à part, qui porte la vérité.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2419.4 — UN PAIEMENT PARTIEL NE SORT PAS DE LA FILE, ET IL N'A PAS DE STATUT
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce statut se concluait de la seule DATE (`if (item.paidAt) return 'paid'`).
 * Un client qui règle 5 000 € sur 10 000 € faisait poser `paidAt` : la ligne
 * passait « payée », quittait la file de relance, tombait en bas du tri, et les
 * 5 000 € restants n'étaient plus réclamés par rien.
 *
 * L'ARBITRAGE — la ligne reste dans sa file existante (`overdue` / `pending`),
 * avec son reste dû NOMMÉ ; aucun cinquième statut n'est ajouté à l'union.
 * Raison : un statut « partiellement réglée » la sortirait des seaux « en
 * retard » et « en attente », c'est-à-dire referait le même défaut en plus doux
 * — une file de plus que personne ne regarde. Le geste à faire sur une facture
 * réglée à moitié est EXACTEMENT celui d'une facture impayée : relancer. Ce qui
 * change n'est pas la file, c'est le MONTANT qu'on y réclame, et c'est
 * `outstandingAmountCents` qui le nomme, sur la ligne comme dans le total.
 *
 * Le litige garde sa priorité, inchangée : il passait déjà avant le paiement,
 * partiel compris, et cette fonction ne fait que suivre l'intention écrite ici.
 */
export type CollectionStatus = 'paid' | 'disputed' | 'overdue' | 'pending'

export function collectionStatus(item: InvoiceReadiness, now: Date): CollectionStatus {
  if (isDisputeOpen(item)) return 'disputed'
  // #2419.4 — un paiement partiel ne sort pas de la file : « payé » se conclut
  // d'un SOLDE, jamais d'une date. `isSettled` refuse de dire « partiel » d'un
  // montant inconnu — accuser un client sur la foi d'une absence serait pire
  // que le défaut qu'on répare.
  if (isSettled(item)) return 'paid'
  const days = overdueDaysAt(item.dueOn, now)
  return days !== null && days > 0 ? 'overdue' : 'pending'
}

/**
 * Ce qu'il reste à FAIRE sur une ligne — et c'est un geste HUMAIN.
 *
 * ⚠️ Aucune de ces actions n'envoie quoi que ce soit, et il n'y a pas non plus
 * de brouillon : la doctrine `c31_relance_encaissement` refuse les deux tant
 * qu'aucune capacité de messagerie n'atteint cet écran. « Relancer » nomme ce
 * qu'un humain va faire, et le produit se contente de consigner ce qui est
 * parti.
 *
 * `null` = rien à faire (le mois est réglé).
 */
export type CollectionAction =
  | { kind: 'resolve_dispute' }
  | { kind: 'set_due_date' }
  | { kind: 'remind'; index: number }
  | { kind: 'escalate_to_human' }
  | { kind: 'wait' }

export function nextCollectionAction(item: InvoiceReadiness, now: Date): CollectionAction | null {
  // Le litige passe avant l'échéance manquante, qui peut être vraie en même
  // temps : des deux, une seule est actionnable. Tant que le litige court,
  // saisir une échéance ne démarrerait aucune cadence.
  if (isDisputeOpen(item)) return { kind: 'resolve_dispute' }
  // #2419.4 — un paiement partiel ne sort pas de la file : rendre `null` ici
  // vidait la colonne « Prochaine action », et une cellule vide se lit « rien à
  // faire » sur une ligne où 5 000 € restent dus.
  if (isSettled(item)) return null
  // Réparable en une saisie, et le dire vaut mieux qu'un silence : sans
  // échéance, aucune relance ne peut devenir due.
  if (!item.dueOn) return { kind: 'set_due_date' }
  // Le silence après trois relances est un sujet de management, pas de cadence.
  if (item.remindersSent >= MAX_REMINDERS) return { kind: 'escalate_to_human' }

  const due = reminderDue(
    {
      state: item.state,
      dueOn: item.dueOn,
      paidAt: item.paidAt,
      // Les deux montants du solde : la cadence refuse de relancer un mois
      // SOLDÉ, pas un mois qui porte une date (#2419.4).
      paidAmountCents: item.paidAmountCents,
      invoicedAmountCents: item.invoicedAmountCents,
      remindersSent: item.remindersSent,
      disputedAt: item.disputedAt,
      disputeResolvedAt: item.disputeResolvedAt,
    },
    now,
  )
  return due ? { kind: 'remind', index: due.index } : { kind: 'wait' }
}

/**
 * #2198.7 — la DERNIÈRE action consignée sur la ligne, tous types confondus.
 *
 * Quatre dates vivent déjà sur `InvoiceReadiness` — la dernière relance, le
 * règlement, l'ouverture et la levée d'un litige — et aucune colonne ne les
 * rapprochait : « Relances » ne comptait qu'un nombre, jamais QUAND. Ce bloc ne
 * calcule rien de neuf, il retient la plus RÉCENTE des quatre et la NOMME —
 * même règle que `collectionStatus` et `overdueDaysAt` juste au-dessus : la
 * dérivation vit ICI, l'écran ne la refait pas.
 *
 * `null` = aucune des quatre n'a eu lieu — une ligne fraîchement facturée n'a
 * encore appelé aucun geste, ce qui est vrai et se distingue d'un « non
 * mesuré » : il n'y a rien à mesurer, pas encore de fait à rater.
 */
type LastCollectionActionKind = 'reminder' | 'paid' | 'disputed' | 'dispute_resolved'
export type LastCollectionAction = { kind: LastCollectionActionKind; at: string }

export function lastCollectionAction(item: InvoiceReadiness): LastCollectionAction | null {
  const candidates: ReadonlyArray<{ kind: LastCollectionActionKind; at: string | null }> = [
    { kind: 'reminder', at: item.lastReminderAt },
    { kind: 'paid', at: item.paidAt },
    { kind: 'disputed', at: item.disputedAt },
    { kind: 'dispute_resolved', at: item.disputeResolvedAt },
  ]
  let best: LastCollectionAction | null = null
  for (const candidate of candidates) {
    if (candidate.at === null) continue
    // Comparaison sur l'instant réel, pas sur la chaîne : les quatre dates ne
    // partagent pas forcément la même précision, et `Date.parse` les remet au
    // même repère avant de les comparer.
    if (best === null || Date.parse(candidate.at) > Date.parse(best.at)) {
      best = { kind: candidate.kind, at: candidate.at }
    }
  }
  return best
}

/**
 * Un seau de l'entête : combien de lignes, combien d'euros, et combien de
 * lignes dont on ne connaît PAS le montant.
 *
 * ⚠️ `amountCents` vaut `null` quand aucune ligne du seau n'a de montant
 * lisible — sans droit financier, le serveur les vide TOUTES, et une somme qui
 * rendrait alors `0` annoncerait « encaissé : 0 € » à quelqu'un qui n'a
 * simplement pas le droit de voir. C'est le défaut « COALESCE d'une somme
 * transforme une absence en zéro », et il a déjà été payé ici.
 *
 * Sur un seau VIDE, en revanche, `0` est VRAI : la fenêtre est complète, et
 * « rien n'est rentré » est une information.
 */
export type CollectionsBucket = {
  count: number
  amountCents: number | null
  withoutAmount: number
}

/** Non exporté : seul `summarizeCollections` le rend, et l'écran le lit par
 *  inférence. Un type exporté que personne n'importe est une promesse d'API que
 *  rien ne tient (`pnpm lint:exports:types`). */
type CollectionsSummary = {
  paid: CollectionsBucket
  pending: CollectionsBucket
  overdue: CollectionsBucket
  disputed: CollectionsBucket
  /**
   * #2419.9 — le FACTURÉ : la somme de ce qui est parti, toutes lignes
   * confondues. Un AGRÉGAT, jamais un cinquième statut de ligne (c72) — et sa
   * SOURCE se nomme (c80) : `declared` compte les lignes DÉCLARÉES facturées
   * sans preuve de l'outil branché.
   */
  invoiced: CollectionsBucket & { declared: number }
  /** Les impayés dont personne n'a saisi l'échéance : ni « à venir », ni « en
   *  retard ». Les ranger en attente sans le dire ferait croire qu'ils sont
   *  sous contrôle. */
  withoutDueDate: number
}

/**
 * Le montant qui compte pour un seau : ce qui est RENTRÉ sur un mois soldé, ce
 * qui RESTE DÛ partout ailleurs. Les confondre ferait compter deux fois un
 * paiement partiel.
 *
 * ⚠️ #2419.4 — « ce qui est dû » n'est PAS le facturé : sur une ligne réglée à
 * moitié, le facturé réclamerait une seconde fois les 5 000 € déjà encaissés.
 * C'est exactement le doublon que cette fonction refusait déjà, à un cas près —
 * celui qu'elle ne pouvait pas voir tant que le statut se concluait d'une date.
 * `outstandingAmountCents` rend `null` quand un des deux montants manque, et le
 * seau le compte alors « non chiffré » : jamais 0, jamais deviné.
 */
function bucketAmountCents(item: InvoiceReadiness, status: CollectionStatus): number | null {
  return status === 'paid' ? item.paidAmountCents : outstandingAmountCents(item)
}

/**
 * #2419.9 — LE SEAU « NON RAPPROCHÉ », séparé des quatre statuts d'encaissement.
 *
 * Sa source n'est PAS `invoice_readiness` (`summarizeCollections` ci-dessus) :
 * ce sont les paiements CONSTATÉS (#2419.1, `GET /delivery/payments`,
 * `unmatched`) qu'aucun humain n'a encore rattachés à une facture. Un
 * AGRÉGAT de PAIEMENTS, jamais un cinquième statut de LIGNE facturée (c72) —
 * c'est le paiement qui est « non rapproché », jamais la facture.
 *
 * Chaque paiement constaté porte un montant positif obligatoire (le schéma de
 * `POST /delivery/payments` le refuse sinon) : un seau non vide a toujours une
 * somme lisible, jamais `null`. Un seau VIDE (aucun paiement en attente) vaut
 * `0` — un fait vrai, pas une absence de mesure.
 */
export function unmatchedPaymentsBucket(payments: readonly { amountCents: number }[]): CollectionsBucket {
  return {
    count: payments.length,
    amountCents: payments.reduce((total, payment) => total + payment.amountCents, 0),
    withoutAmount: 0,
  }
}

export function summarizeCollections(items: readonly InvoiceReadiness[], now: Date): CollectionsSummary {
  const buckets: Record<CollectionStatus, { count: number; known: number; withoutAmount: number }> = {
    paid: { count: 0, known: 0, withoutAmount: 0 },
    pending: { count: 0, known: 0, withoutAmount: 0 },
    overdue: { count: 0, known: 0, withoutAmount: 0 },
    disputed: { count: 0, known: 0, withoutAmount: 0 },
  }
  let withoutDueDate = 0
  // #2419.9 — le facturé se somme sur le montant FACTURÉ, jamais sur le reste dû.
  const invoiced = { count: 0, known: 0, withoutAmount: 0, declared: 0 }

  for (const item of items) {
    if (!isCollectible(item)) continue
    invoiced.count += 1
    if (item.state === 'invoiced_declared') invoiced.declared += 1
    if (item.invoicedAmountCents === null || !Number.isFinite(item.invoicedAmountCents)) invoiced.withoutAmount += 1
    else invoiced.known += item.invoicedAmountCents
    const status = collectionStatus(item, now)
    const bucket = buckets[status]
    bucket.count += 1
    if (status === 'pending' && !item.dueOn) withoutDueDate += 1
    const amount = bucketAmountCents(item, status)
    if (amount === null || !Number.isFinite(amount)) bucket.withoutAmount += 1
    else bucket.known += amount
  }

  const seal = (bucket: { count: number; known: number; withoutAmount: number }): CollectionsBucket => ({
    count: bucket.count,
    // Aucun montant lisible sur un seau NON VIDE ⇒ on ne sait pas, jamais 0.
    amountCents: bucket.count > 0 && bucket.withoutAmount === bucket.count ? null : bucket.known,
    withoutAmount: bucket.withoutAmount,
  })

  return {
    paid: seal(buckets.paid),
    pending: seal(buckets.pending),
    overdue: seal(buckets.overdue),
    disputed: seal(buckets.disputed),
    invoiced: { ...seal(invoiced), declared: invoiced.declared },
    withoutDueDate,
  }
}
