import { z } from 'zod'
import { isSettled, outstandingAmountCents, type InvoiceReadinessState } from './invoice-readiness.js'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CESSION DE CRÉANCE (AFFACTURAGE) — et le revirement qui l'autorise
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Ce domaine était REFUSÉ, et le refus est levé. Il vaut mieux le lire deux
 * fois qu'une, parce que le refus était écrit trois fois et le revirement une
 * seule.
 *
 * **Ce qui était refusé** (registre de doctrine, `c29_affacturage`, 28/08/2026) :
 * « Bellum ne touche jamais au FINANCEMENT d'une créance. Ni affacturage, ni
 * cession, ni escompte, ni avance de trésorerie : la frontière du produit est
 * "prêt à facturer", et un financement se situe deux pas APRÈS une facture que
 * Bellum n'émet pas. » L'annexe des écrans cibles allait plus loin et demandait
 * de JETER la colonne « Cession » des maquettes.
 *
 * **Le revirement, daté** : le 31/08/2026, Louis a relu ce refus et l'a levé
 * explicitement, en nommant ce qu'il veut — « objet cession, contrat factor,
 * taux de commission, encours cédé, réconciliation des règlements du factor ».
 * Le motif tient en une phrase : les maquettes du 26/08 font de la cession le
 * premier poste de la répartition des paiements, et une ESN qui affacture ne
 * pilote pas sa trésorerie sans savoir ce qui est cédé ni ce que le factor a
 * réglé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE REVIREMENT NE LÈVE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois refus voisins tiennent toujours, et ce fichier est écrit pour ne pas
 * les rouvrir par ricochet :
 *
 *  1. **Bellum n'émet aucune facture** (`c17`, `c30`). Une cession porte sur une
 *     créance déjà facturée AILLEURS — c'est `invoice_readiness.invoiced_at` qui
 *     en atteste, et rien ici ne numérote quoi que ce soit.
 *  2. **Bellum ne signe rien, ne paie rien et ne stocke AUCUN IBAN.** Le contrat
 *     factor porte un nom, une référence, un taux et des plafonds. Aucune
 *     coordonnée bancaire n'a de champ, et ce n'est pas une convention : c'est
 *     l'absence de colonne.
 *  3. **Rien ne part tout seul.** « Préparer la cession » prépare ; c'est un
 *     humain qui transmet au factor, et le produit consigne ce qu'il a fait.
 *     Aucune fonction de ce fichier n'envoie quoi que ce soit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES DU CALCUL
 * ─────────────────────────────────────────────────────────────────────────────
 *  · **Un taux inconnu n'est pas 0 %** et un encours non mesurable n'est pas
 *    « 0 € » — les deux annonceraient un affacturage gratuit ou un portefeuille
 *    vide, ce qui est faux dans le sens qui rassure.
 *  · **Un total partiel se compte** : chaque seau porte `withoutAmount`, sans
 *    quoi une somme incomplète se lit comme une somme.
 *  · **Une dérivation vit à un seul endroit** : « quel taux s'applique à cette
 *    cession ? » a une seule réponse, {@link effectiveCommissionRateBps}.
 */

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les taxonomies                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * L'état d'un CONTRAT d'affacturage.
 *
 * ⚠️ GA-08 : une valeur s'ajoute EN FIN de liste, jamais au milieu, et sa
 * contrainte SQL est élargie AVANT le code qui l'écrit.
 *
 * `suspended` n'est pas `ended` : un contrat suspendu se réactive, et les
 * cessions déjà transmises continuent de se réconcilier dessous. Les confondre
 * ferait disparaître un encours en cours de règlement.
 */
export const FACTORING_CONTRACT_STATES = ['active', 'suspended', 'ended'] as const
export const factoringContractStateSchema = z.enum(FACTORING_CONTRACT_STATES)
export type FactoringContractState = (typeof FACTORING_CONTRACT_STATES)[number]

/**
 * Le cycle de vie d'une CESSION, dans l'ordre.
 *
 * ⚠️ GA-08 : en FIN de liste, jamais au milieu.
 *
 *  · `prepared` — le dossier est prêt (« Préparer la cession » de la maquette).
 *    Rien n'est parti : c'est un humain qui transmet au factor.
 *  · `assigned` — la créance a été transmise. C'est l'ENCOURS cédé.
 *  · `settled`  — le factor a réglé. La réconciliation dit si le compte y est.
 *  · `rejected` — le factor a REFUSÉ de financer cette créance (encours client
 *    saturé, litige, entité inconnue). La créance revient à l'ESN, qui la
 *    recouvre elle-même.
 *  · `recalled` — le factor REPREND une créance qu'il avait acceptée, le plus
 *    souvent parce que le client n'a jamais payé. Distinct de `rejected` : de
 *    l'argent a circulé, et il repart.
 */
export const RECEIVABLE_ASSIGNMENT_STATES = ['prepared', 'assigned', 'settled', 'rejected', 'recalled'] as const
export const receivableAssignmentStateSchema = z.enum(RECEIVABLE_ASSIGNMENT_STATES)
export type ReceivableAssignmentState = (typeof RECEIVABLE_ASSIGNMENT_STATES)[number]

/**
 * Le verdict de la RÉCONCILIATION — ce que le factor a réglé, comparé à ce
 * qu'il devait.
 *
 * Six valeurs, et les trois premières existent pour la même raison : un écart
 * de `0` annoncerait « le compte y est » sur trois situations où la question ne
 * se pose même pas.
 *
 *  · `not_due`      — le factor ne doit rien (cession préparée, refusée, reprise).
 *  · `unmeasurable` — il doit quelque chose, et on ne sait pas combien : le
 *    montant cédé ou le taux manque. Ce n'est PAS « rien reçu ».
 *  · `awaiting`     — le net attendu est connu, rien n'est encore arrivé.
 *  · `matched`      — le compte y est, à l'arrondi près.
 *  · `short`        — le factor a réglé MOINS que le net attendu.
 *  · `over`         — il a réglé PLUS. Sur une cession qui ne devait rien, c'est
 *    une anomalie qu'on veut voir plutôt qu'un silence.
 */
export const RECONCILIATION_STATES = ['not_due', 'unmeasurable', 'awaiting', 'matched', 'short', 'over'] as const
export const reconciliationStateSchema = z.enum(RECONCILIATION_STATES)
export type ReconciliationState = (typeof RECONCILIATION_STATES)[number]

/**
 * La tolérance de rapprochement, en centimes.
 *
 * Elle est ARITHMÉTIQUE, pas commerciale : la commission passe par un
 * `Math.round`, qui peut décaler d'un centime. Un euro d'écart reste un écart —
 * une tolérance « raisonnable » de quelques euros ferait disparaître les
 * micro-retenues que le factor applique sans les annoncer, qui sont exactement
 * ce qu'on cherche à voir.
 */
export const RECONCILIATION_TOLERANCE_CENTS = 1

/**
 * Le factor DOIT-il quelque chose sur cette cession ?
 *
 * Une seule dérivation, parce que trois lectures en ont besoin — la
 * réconciliation, l'encours et l'entête — et que trois listes recopiées à la
 * main divergeraient le jour où un état s'ajoute.
 */
export function isFactorOwing(status: ReceivableAssignmentState): boolean {
  return status === 'assigned' || status === 'settled'
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Le taux, la commission, le net attendu                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Le taux qui s'applique à CETTE cession, en points de base (250 = 2,50 %).
 *
 * ⚠️ Les points de base et non un flottant : `0.025` recopié d'un écran à une
 * base finit en `0.024999999999999998`, et une commission arrondie deux fois ne
 * tombe plus juste. Un entier ne dérive pas.
 *
 * Deux sources possibles, et l'ordre est une décision : le taux NÉGOCIÉ sur la
 * cession l'emporte sur celui du contrat. Un factor accorde des taux
 * dérogatoires par créance ; recopier celui du contrat écraserait le fait.
 *
 * ⚠️ `0` est une valeur SAISIE et légitime (une cession sans commission
 * existe) ; `null` veut dire que personne n'a rien saisi. Les confondre est le
 * défaut `missing_cost` de la facturation, à l'identique.
 */
export function effectiveCommissionRateBps(
  assignment: { commissionRateBps: number | null },
  contract: { commissionRateBps: number | null } | null,
): number | null {
  if (assignment.commissionRateBps !== null) return assignment.commissionRateBps
  return contract?.commissionRateBps ?? null
}

/** La commission retenue par le factor, en centimes. `null` dès qu'un terme
 *  manque — jamais 0 : « zéro euro de commission » et « on ne sait pas » ne se
 *  corrigent pas de la même façon. */
export function commissionAmountCents(assignedAmountCents: number | null, rateBps: number | null): number | null {
  if (assignedAmountCents === null || rateBps === null) return null
  return Math.round((assignedAmountCents * rateBps) / 10_000)
}

/** Ce que le factor doit RÉELLEMENT verser : la créance cédée moins sa
 *  commission. `null` dès qu'un terme manque. */
export function expectedNetCents(assignedAmountCents: number | null, rateBps: number | null): number | null {
  const commission = commissionAmountCents(assignedAmountCents, rateBps)
  if (commission === null || assignedAmountCents === null) return null
  return assignedAmountCents - commission
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  La réconciliation                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Ce dont la réconciliation a besoin — jamais la ligne complète. */
type ReconciliationInput = {
  status: ReceivableAssignmentState
  assignedAmountCents: number | null
  /** Le taux DÉJÀ résolu par {@link effectiveCommissionRateBps} : cette
   *  fonction ne refait pas la dérivation, sinon elles finiraient par diverger. */
  commissionRateBps: number | null
  /** Les règlements du factor rapprochés de cette cession, en centimes. Un
   *  tableau VIDE dit « aucun règlement consigné » — ce qui est un fait mesuré,
   *  puisque l'appelant a la liste complète. */
  settlementsCents: readonly number[]
}

/** Le verdict d'une cession, et les trois nombres qui le fondent. */
export type Reconciliation = {
  state: ReconciliationState
  /** Ce qui est RÉELLEMENT arrivé du factor. `0` est vrai : la liste est
   *  complète, et « rien n'est arrivé » est une information. */
  settledCents: number
  expectedNetCents: number | null
  /** Reçu moins attendu. `null` tant que rien n'est arrivé : « −975 000 » est
   *  exact et se lirait « le factor nous doit tout », ce qui est le diagnostic
   *  d'un impayé alors que la cession vient de partir. */
  varianceCents: number | null
}

export function reconcileAssignment(input: ReconciliationInput): Reconciliation {
  const settledCents = input.settlementsCents.reduce((total, amount) => total + amount, 0)

  // Le factor ne doit rien : cession préparée, refusée ou reprise. Attendre un
  // règlement ferait apparaître un « manquant » que personne ne peut lever.
  if (!isFactorOwing(input.status)) {
    // ⚠️ Sauf si de l'argent est quand même arrivé. Un règlement sur une
    // créance refusée est une anomalie de rapprochement, et la taire la
    // laisserait dormir dans un compte d'attente pendant des mois.
    if (settledCents > 0) return { state: 'over', settledCents, expectedNetCents: null, varianceCents: null }
    return { state: 'not_due', settledCents, expectedNetCents: null, varianceCents: null }
  }

  const expected = expectedNetCents(input.assignedAmountCents, input.commissionRateBps)
  // Il doit quelque chose, et on ne sait pas combien. « 0 reçu sur 0 attendu »
  // se lirait « le compte y est ».
  if (expected === null) return { state: 'unmeasurable', settledCents, expectedNetCents: null, varianceCents: null }

  if (input.settlementsCents.length === 0) {
    return { state: 'awaiting', settledCents, expectedNetCents: expected, varianceCents: null }
  }

  const varianceCents = settledCents - expected
  const state: ReconciliationState =
    Math.abs(varianceCents) <= RECONCILIATION_TOLERANCE_CENTS ? 'matched' : varianceCents < 0 ? 'short' : 'over'
  return { state, settledCents, expectedNetCents: expected, varianceCents }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les seaux de l'entête                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un seau : combien de lignes, combien d'euros, et combien de lignes dont on
 * ignore le montant.
 *
 * La même forme que les seaux de l'écran des encaissements, et pour la même
 * raison : `amountCents` vaut `null` quand AUCUNE ligne du seau n'est chiffrée —
 * une somme qui rendrait `0` annoncerait « rien de cédé » à qui a simplement
 * des montants illisibles. Sur un seau VIDE, en revanche, `0` est VRAI.
 */
export type FactoringBucket = {
  count: number
  amountCents: number | null
  withoutAmount: number
}

function sealBucket(count: number, known: number, withoutAmount: number): FactoringBucket {
  return { count, amountCents: count > 0 && withoutAmount === count ? null : known, withoutAmount }
}

/**
 * L'ENCOURS CÉDÉ : ce qui est chez le factor et qu'il n'a pas encore réglé.
 *
 * Une cession `settled` en sort — elle est rentrée ; une cession `prepared` n'y
 * entre pas — elle n'est pas partie. C'est le chiffre qu'un directeur financier
 * compare au plafond de son contrat.
 */
export function assignedOutstandingCents(
  rows: readonly { status: ReceivableAssignmentState; assignedAmountCents: number | null }[],
): FactoringBucket {
  let count = 0
  let known = 0
  let withoutAmount = 0
  for (const row of rows) {
    if (row.status !== 'assigned') continue
    count += 1
    if (row.assignedAmountCents === null || !Number.isFinite(row.assignedAmountCents)) withoutAmount += 1
    else known += row.assignedAmountCents
  }
  return sealBucket(count, known, withoutAmount)
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  « Cession manquante »                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Une créance CESSIBLE : facturée ailleurs, pas encore encaissée.
 *
 * ⚠️ La forme est structurelle et non `InvoiceReadiness` en entier : ce calcul
 * n'a besoin que de quatre champs, et un contrat plus large obligerait chaque
 * appelant à en fabriquer un complet. `state` réutilise en revanche la
 * taxonomie NOMMÉE — une taxonomie recopiée est une taxonomie qui diverge.
 */
type AssignableReceivable = {
  missionId: string
  /** Le mois couvert, au premier du mois (`YYYY-MM-DD`). */
  periodMonth: string
  state: InvoiceReadinessState
  paidAt: string | null
  /** #2419.4 — sans le montant encaissé, « déjà payé » se conclut d'une date,
   *  et le solde d'une facture réglée à moitié cesse d'exister. */
  paidAmountCents: number | null
  invoicedAmountCents: number | null
}

/**
 * La clé d'une créance. Le MOIS en fait partie : deux mois d'une même mission
 * sont deux créances, et les rapprocher par la seule mission est la « jointure
 * par position » que ce dépôt a déjà payée.
 *
 * ⚠️ EXPORTÉE (31/08/2026) : la colonne « Cession » des paiements sortants
 * rapproche une ligne de paiement (mission × mois) d'une cession par cette
 * MÊME clé. Une seconde fonction recopiée à la main dans `features/payments`
 * diverge dès que ce fichier change de forme — c'est la jointure, elle vit à
 * un seul endroit.
 */
export function receivableKey(row: { missionId: string; periodMonth: string }): string {
  return `${row.missionId}#${row.periodMonth.slice(0, 10)}`
}

/**
 * Ce qui POURRAIT être cédé et ne l'est pas — la tuile « Cession manquante » de
 * la maquette, et son geste « Préparer la cession ».
 *
 * Deux refus fondent la population :
 *  · **pas encore facturé ⇒ pas cessible.** Une cession porte sur une créance,
 *    donc sur une facture émise. Réclamer une cession sur un mois bloqué
 *    produirait un manquant que personne ne peut lever — c'est ce qui fait
 *    cesser de lire une file.
 *  · **déjà SOLDÉ ⇒ plus rien à céder.** Le client a payé ; céder après coup
 *    n'a pas d'objet. ⚠️ #2419.4 — ce refus disait « déjà encaissé », et il se
 *    concluait d'une DATE : le solde d'une facture réglée à moitié cessait
 *    d'exister, alors qu'il reste parfaitement cessible. Et le montant retenu
 *    était le FACTURÉ, donc on aurait proposé de céder 10 000 € alors que
 *    5 000 € sont déjà rentrés — deux défauts, un seul geste. Une facture
 *    réglée d'un montant NON MESURÉ reste soldée : on ne propose pas de céder
 *    ce dont on ignore s'il reste dû.
 *
 * ⚠️ Elle ne dit PAS que ces créances DEVAIENT être cédées. Toutes les factures
 * d'une ESN ne passent pas par le factor — la tuile nomme un écart à regarder,
 * pas une faute. C'est pourquoi elle ne produit aucun bloqueur.
 */
export function missingAssignments(
  receivables: readonly AssignableReceivable[],
  assignments: readonly { missionId: string; periodMonth: string }[],
): { rows: AssignableReceivable[]; bucket: FactoringBucket } {
  const covered = new Set(assignments.map(receivableKey))
  const rows: AssignableReceivable[] = []
  let known = 0
  let withoutAmount = 0

  for (const receivable of receivables) {
    if (receivable.state !== 'invoiced') continue
    if (isSettled(receivable)) continue
    if (covered.has(receivableKey(receivable))) continue
    rows.push(receivable)
    // Ce qui est CESSIBLE est ce qui reste dû, pas ce qui a été facturé.
    const cedable = outstandingAmountCents(receivable)
    if (cedable === null || !Number.isFinite(cedable)) withoutAmount += 1
    else known += cedable
  }

  return { rows, bucket: sealBucket(rows.length, known, withoutAmount) }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  L'entête de l'écran                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/** Ce que l'entête de `/missions/cessions` annonce. */
export type FactoringSummary = {
  /** L'encours cédé : chez le factor, non réglé. */
  outstanding: FactoringBucket
  /** Les cessions dont le net attendu est connu et dont rien n'est arrivé. */
  awaiting: FactoringBucket
  /**
   * L'écart TOTAL entre ce que le factor a réglé et ce qu'il devait, sur les
   * seules lignes où les deux sont mesurés.
   *
   * `null` quand AUCUNE ligne n'est mesurable : « écart : 0 € » se lirait
   * « tout est juste », c'est-à-dire l'inverse de « on n'a rien pu vérifier ».
   */
  varianceCents: number | null
  /** Combien de cessions n'ont pas pu être réconciliées. Sans ce compteur, un
   *  écart partiel se lit comme l'écart. */
  unmeasurable: number
  /** Les règlements du factor que rien ne rapproche encore d'une cession —
   *  c'est le travail de réconciliation qui reste à faire. */
  unreconciled: FactoringBucket
}

export function summarizeFactoring(
  rows: readonly ReconciliationInput[],
  extra: { unreconciledSettlementsCents: readonly number[] },
): FactoringSummary {
  let awaitingCount = 0
  let awaitingKnown = 0
  let awaitingWithout = 0
  let varianceKnown = 0
  let measured = 0
  let unmeasurable = 0

  for (const row of rows) {
    const verdict = reconcileAssignment(row)
    if (verdict.state === 'unmeasurable') unmeasurable += 1
    if (verdict.state === 'awaiting') {
      awaitingCount += 1
      if (verdict.expectedNetCents === null) awaitingWithout += 1
      else awaitingKnown += verdict.expectedNetCents
    }
    if (verdict.varianceCents !== null) {
      varianceKnown += verdict.varianceCents
      measured += 1
    }
  }

  // ⚠️ Une cession `assigned` sans montant tombe en `unmeasurable`, donc pas
  // dans `awaiting` : elle attend bien un règlement, mais on ne sait pas
  // lequel. Elle est comptée par `unmeasurable`, jamais perdue.
  return {
    outstanding: assignedOutstandingCents(rows),
    awaiting: sealBucket(awaitingCount, awaitingKnown, awaitingWithout),
    varianceCents: measured > 0 ? varianceKnown : null,
    unmeasurable,
    unreconciled: sealBucket(
      extra.unreconciledSettlementsCents.length,
      extra.unreconciledSettlementsCents.reduce((total, amount) => total + amount, 0),
      0,
    ),
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les contrats d'API                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Un taux, en points de base. Borné à 100 % : au-delà, la commission
 * dépasserait la créance, ce qui n'est pas une remise mais une faute de saisie.
 */
const rateBpsSchema = z.number().int().min(0).max(10_000)

/**
 * LE CONTRAT FACTOR — le tiers qui rachète la créance.
 *
 * ⚠️ **Aucune coordonnée bancaire.** Le dépôt porte, écrite trois fois, la
 * décision « Bellum ne signe rien, ne paie rien et ne stocke aucun IBAN ». Un
 * contrat d'affacturage se pilote très bien sans : ce qu'on doit savoir est QUI
 * rachète, SOUS quelle référence, à QUEL taux et JUSQU'À quel plafond. Le
 * virement, lui, part de la banque de l'ESN, et n'a jamais transité par ici.
 *
 * ⚠️ Le nom du factor est SAISI par l'utilisateur, jamais choisi dans une liste
 * écrite en dur : nommer un éditeur côté application est refusé, et une liste
 * de sociétés d'affacturage en serait une.
 */
export const factoringContractSchema = z.object({
  id: z.string().guid(),
  /** Le nom du factor, tel que l'ESN l'écrit. */
  factorName: z.string(),
  /** La référence du contrat chez le factor. `null` = personne ne l'a saisie —
   *  et sans elle, un avis de règlement ne se rattache à rien. */
  contractReference: z.string().nullable(),
  /** Le taux de commission, en points de base. `null` = non saisi, JAMAIS 0. */
  commissionRateBps: z.number().int().nullable(),
  /** Le plafond d'encours accordé par le factor, en centimes. `null` = non
   *  saisi : un plafond inconnu n'est pas un plafond nul, et l'afficher à 0
   *  ferait croire que tout dépassement est un dépassement. */
  outstandingLimitCents: z.number().int().nullable(),
  status: factoringContractStateSchema,
  startedOn: z.string().nullable(),
  endedOn: z.string().nullable(),
})
export type FactoringContract = z.infer<typeof factoringContractSchema>

export const createFactoringContractSchema = z
  .object({
    factorName: z.string().trim().min(1).max(200),
    contractReference: z.string().trim().min(1).max(120).optional(),
    commissionRateBps: rateBpsSchema.optional(),
    outstandingLimitCents: z.number().int().nonnegative().optional(),
    startedOn: z.string().date().optional(),
  })
  .strict()
export type CreateFactoringContractInput = z.infer<typeof createFactoringContractSchema>

/**
 * Modifier un contrat. `status` peut passer à `ended` — ce qui n'EFFACE rien :
 * les cessions transmises dessous gardent leur ligne et continuent de se
 * réconcilier. On archive, on ne supprime pas.
 */
export const updateFactoringContractSchema = z
  .object({
    factorName: z.string().trim().min(1).max(200).optional(),
    contractReference: z.string().trim().min(1).max(120).nullable().optional(),
    commissionRateBps: rateBpsSchema.nullable().optional(),
    outstandingLimitCents: z.number().int().nonnegative().nullable().optional(),
    status: factoringContractStateSchema.optional(),
    endedOn: z.string().date().nullable().optional(),
  })
  .strict()
export type UpdateFactoringContractInput = z.infer<typeof updateFactoringContractSchema>

/** Un règlement reçu du factor, tel que l'écran le montre. */
export const factoringSettlementSchema = z.object({
  id: z.string().guid(),
  contractId: z.string().guid(),
  /** La cession que ce règlement solde. `null` = reçu et PAS ENCORE RAPPROCHÉ —
   *  c'est l'objet même de la réconciliation, et le taire ferait disparaître le
   *  travail qui reste. */
  assignmentId: z.string().guid().nullable(),
  receivedOn: z.string(),
  /** Ce qui est arrivé, en centimes. Jamais `null` : on consigne un règlement
   *  parce qu'on a vu un montant. */
  amountCents: z.number().int(),
  /** La référence de l'avis de règlement du factor. */
  reference: z.string().nullable(),
})
export type FactoringSettlement = z.infer<typeof factoringSettlementSchema>

/**
 * UNE CESSION, telle que l'écran la lit.
 *
 * Elle porte sa créance parente (mission + mois), son factor, son taux, son
 * montant — et le verdict de réconciliation, DÉRIVÉ et non stocké : un verdict
 * en base se périme au premier règlement enregistré.
 */
export const receivableAssignmentSchema = z.object({
  id: z.string().guid(),
  contractId: z.string().guid(),
  /** Le nom du factor, recopié pour l'affichage. */
  factorName: z.string().nullable(),
  missionId: z.string().guid(),
  missionLabel: z.string().nullable(),
  accountName: z.string().nullable(),
  /** Le mois de la créance cédée, au premier du mois. */
  periodMonth: z.string(),
  status: receivableAssignmentStateSchema,
  /** Le montant CÉDÉ, en centimes. `null` = non saisi. */
  assignedAmountCents: z.number().int().nullable(),
  /** Le taux EFFECTIF, déjà résolu (cession, puis contrat, puis `null`). */
  commissionRateBps: z.number().int().nullable(),
  /** Ce que le factor retient, dérivé. `null` dès qu'un terme manque. */
  commissionAmountCents: z.number().int().nullable(),
  assignedOn: z.string().nullable(),
  settledOn: z.string().nullable(),
  /** Pourquoi le factor a refusé ou repris la créance, dans les mots de celui
   *  qui l'a lu. Jamais un code deviné. */
  decisionReason: z.string().nullable(),
  reconciliation: z.object({
    state: reconciliationStateSchema,
    settledCents: z.number().int(),
    expectedNetCents: z.number().int().nullable(),
    varianceCents: z.number().int().nullable(),
  }),
})
export type ReceivableAssignment = z.infer<typeof receivableAssignmentSchema>

/**
 * PRÉPARER une cession — le geste de la maquette.
 *
 * Il ne transmet rien : il consigne qu'un dossier est prêt. C'est un humain qui
 * l'envoie au factor, et `POST .../assigned` consigne ensuite qu'il l'a fait.
 */
export const prepareAssignmentSchema = z
  .object({
    contractId: z.string().guid(),
    missionId: z.string().guid(),
    /** Le mois de la créance (`YYYY-MM`). */
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    /** Le montant cédé, en centimes. Absent = non saisi, et la ligne le DIRA
     *  plutôt que d'afficher 0 €. */
    assignedAmountCents: z.number().int().nonnegative().optional(),
    /** Un taux DÉROGATOIRE pour cette créance. Absent = celui du contrat. */
    commissionRateBps: rateBpsSchema.optional(),
  })
  .strict()
export type PrepareAssignmentInput = z.infer<typeof prepareAssignmentSchema>

/** Consigner que la créance a été TRANSMISE au factor. */
export const markAssignedSchema = z.object({ assignedOn: z.string().date().optional() }).strict()
export type MarkAssignedInput = z.infer<typeof markAssignedSchema>

/**
 * Consigner un REFUS ou une REPRISE du factor. Le motif est OBLIGATOIRE : « le
 * factor a refusé » sans rien d'autre ne se relit pas six mois plus tard, quand
 * on cherchera pourquoi cette créance est restée à la charge de l'ESN.
 */
export const closeAssignmentSchema = z
  .object({
    /** `rejected` (jamais accepté) ou `recalled` (accepté puis repris). */
    status: z.enum(['rejected', 'recalled']),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
export type CloseAssignmentInput = z.infer<typeof closeAssignmentSchema>

/**
 * Enregistrer un RÈGLEMENT reçu du factor.
 *
 * Bellum ne rapproche aucun compte bancaire : il consigne ce que quelqu'un
 * CONSTATE sur un avis de règlement. `assignmentId` est facultatif — un
 * règlement global se saisit d'abord, se rapproche ensuite, et c'est cet état
 * intermédiaire que l'écran doit pouvoir montrer.
 */
export const recordSettlementSchema = z
  .object({
    contractId: z.string().guid(),
    assignmentId: z.string().guid().optional(),
    receivedOn: z.string().date(),
    amountCents: z.number().int(),
    reference: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
export type RecordSettlementInput = z.infer<typeof recordSettlementSchema>

/** RAPPROCHER un règlement d'une cession — le geste de réconciliation. */
export const reconcileSettlementSchema = z.object({ assignmentId: z.string().guid() }).strict()
export type ReconcileSettlementInput = z.infer<typeof reconcileSettlementSchema>

/** Ce que rend `GET /factoring` : tout ce que l'écran affiche, en une lecture. */
export const factoringViewSchema = z.object({
  contracts: z.array(factoringContractSchema),
  assignments: z.array(receivableAssignmentSchema),
  /** Les règlements NON rapprochés, et eux seuls : ceux qui le sont vivent
   *  déjà dans la réconciliation de leur cession. */
  unreconciledSettlements: z.array(factoringSettlementSchema),
  /** Les créances facturées, impayées, sans cession — « Cession manquante ». */
  missing: z.array(
    z.object({
      missionId: z.string().guid(),
      missionLabel: z.string().nullable(),
      accountName: z.string().nullable(),
      periodMonth: z.string(),
      invoicedAmountCents: z.number().int().nullable(),
      dueOn: z.string().nullable(),
    }),
  ),
  summary: z.object({
    outstanding: z.object({
      count: z.number().int().nonnegative(),
      amountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    awaiting: z.object({
      count: z.number().int().nonnegative(),
      amountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    missing: z.object({
      count: z.number().int().nonnegative(),
      amountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
    varianceCents: z.number().int().nullable(),
    unmeasurable: z.number().int().nonnegative(),
    unreconciled: z.object({
      count: z.number().int().nonnegative(),
      amountCents: z.number().int().nullable(),
      withoutAmount: z.number().int().nonnegative(),
    }),
  }),
  /**
   * Le lecteur a-t-il le droit de voir les MONTANTS d'une cession ?
   *
   * `false` = `assignedAmountCents`, `commissionAmountCents` et le
   * `settledCents`/`varianceCents`/`expectedNetCents` de chaque réconciliation
   * sortent RETIRÉS (`null`, jamais `0` — D45, `redactFinance`). Le nombre de
   * cessions, leur mission, leur statut, l'ÉTAT de réconciliation (« compte
   * juste »…) et les quatre totaux de l'entête restent lisibles : c'est la vue
   * « nombres seulement » que `CollectionsPage` offre déjà sur les
   * encaissements (31/08/2026).
   *
   * ⚠️ Il ne se confond PAS avec l'absence de donnée : sans lui, un montant
   * `null` se lirait « personne n'a saisi le taux » aussi bien que « tu n'as
   * pas le droit de le voir » — deux pannes qui ne se réparent pas de la même
   * façon.
   */
  canReadFinance: z.boolean(),
})
export type FactoringView = z.infer<typeof factoringViewSchema>
