import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  commissionAmountCents,
  effectiveCommissionRateBps,
  missingAssignments,
  reconcileAssignment,
  redactFinance,
  summarizeFactoring,
  type CloseAssignmentInput,
  type CreateFactoringContractInput,
  type FactoringContract,
  type FactoringSettlement,
  type FactoringView,
  type MarkAssignedInput,
  type PrepareAssignmentInput,
  type ReceivableAssignment,
  type ReceivableAssignmentState,
  type RecordSettlementInput,
  type UpdateFactoringContractInput,
} from '@bellum/contracts'
import { FactoringContractEntity } from '../../database/entities/factoring-contract.entity'
import { FactoringSettlementEntity } from '../../database/entities/factoring-settlement.entity'
import { ReceivableAssignmentEntity } from '../../database/entities/receivable-assignment.entity'

/**
 * LA CESSION DE CRÉANCE — le service (31/08/2026).
 *
 * ⚠️ Le domaine était REFUSÉ (`c29_affacturage`) ; Louis a levé le refus le
 * 31/08/2026 et l'entrée du registre a été réécrite le même jour, avec sa
 * trace. Ce qui reste refusé et que ce service ne fait à AUCUN moment :
 *
 *  · **il n'émet aucune facture** — il lit `invoice_readiness`, où quelqu'un a
 *    consigné qu'une facture est partie depuis l'outil comptable ;
 *  · **il ne stocke aucune coordonnée bancaire** — voir l'entité du contrat :
 *    ce n'est pas une convention, c'est l'absence de colonne ;
 *  · **il n'envoie rien au factor.** « Préparer » prépare. Un humain transmet,
 *    et `markAssigned` consigne qu'il l'a fait. Il n'y a aucun client HTTP dans
 *    ce fichier, et c'est ce qui tient la règle.
 *
 * ⚠️ Il n'importe AUCUN service d'un autre module (GA-07 est au plafond exact :
 * 243 imports sur 243 autorisés). Le contexte d'espace est résolu par le
 * CONTRÔLEUR, qui est hors du périmètre de cette garde, et passé ici en
 * paramètre. Ce n'est pas une contorsion : un service qui reçoit son espace
 * plutôt que d'aller le chercher est aussi un service qu'un test peut appeler
 * sans monter la moitié de l'application.
 */
@Injectable()
export class FactoringService {
  constructor(
    @InjectRepository(FactoringContractEntity)
    private readonly contracts: Repository<FactoringContractEntity>,
    @InjectRepository(ReceivableAssignmentEntity)
    private readonly assignments: Repository<ReceivableAssignmentEntity>,
    @InjectRepository(FactoringSettlementEntity)
    private readonly settlements: Repository<FactoringSettlementEntity>,
  ) {}

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  LA LECTURE                                                              */
  /* ════════════════════════════════════════════════════════════════════════ */

  /**
   * Tout ce que l'écran affiche, en une lecture.
   *
   * ⚠️ Une SEULE route et non quatre : les quatre chiffres de l'entête se
   * calculent sur les mêmes lignes, et quatre requêtes indépendantes
   * finiraient par les rendre à des instants différents — « encours 340 k€ »
   * en haut, « 12 cessions » en bas, et deux totaux qui ne se recoupent pas.
   *
   * ⚠️ `canReadFinance` est OBLIGATOIRE, sans valeur par défaut : un appelant
   * qui l'oublie doit être refusé par le compilateur, pas silencieusement
   * servi en clair (même arbitrage que `OutgoingPaymentsService.list`).
   *
   * La vue « nombres seulement » (31/08/2026) : `assignedAmountCents`,
   * `commissionAmountCents` et le `settledCents`/`varianceCents`/
   * `expectedNetCents` de chaque réconciliation sortent RETIRÉS sans le droit
   * — jamais à `0`, D45. Le NOMBRE de cessions, leur mission, leur statut,
   * l'ÉTAT de réconciliation (« compte juste », « en attente »…) et les
   * quatre totaux AGRÉGÉS de l'entête restent lisibles : c'est ce que
   * `CollectionsPage` offre déjà sur les encaissements, et que cet écran
   * n'offrait pas — la route fermait sec sur `finance:read` (voir le
   * contrôleur).
   *
   * ⚠️ `expectedNetCents` a rejoint la liste APRÈS les trois autres : la
   * réconciliation le calcule sur le montant CÉDÉ réel avant toute rédaction
   * (`reconcileAssignment`, plus bas), et rien ne le retirait — un lecteur
   * sans `finance:read` aurait lu le montant cédé exact d'une cession
   * `awaiting` par une porte dérobée. `redactFinance` sur `reconciliation`
   * ci-dessous couvre les trois d'un coup, précisément pour qu'un quatrième
   * champ ajouté à `Reconciliation` ne rouvre pas le même trou en silence.
   */
  async view(workspaceId: string, options: { canReadFinance: boolean }): Promise<FactoringView> {
    const [contractRows, assignmentRows, settlementRows, receivableRows] = await Promise.all([
      this.contractRows(workspaceId),
      this.assignmentRows(workspaceId),
      this.settlementRows(workspaceId),
      this.invoicedReceivables(workspaceId),
    ])

    // Les règlements, groupés par cession. Ceux qui ne pointent aucune cession
    // sont la file de réconciliation, et sont rendus à part.
    const byAssignment = new Map<string, number[]>()
    const unreconciled: FactoringSettlement[] = []
    for (const settlement of settlementRows) {
      if (settlement.assignmentId === null) {
        unreconciled.push(settlement)
        continue
      }
      const list = byAssignment.get(settlement.assignmentId) ?? []
      list.push(settlement.amountCents)
      byAssignment.set(settlement.assignmentId, list)
    }

    const assignments = assignmentRows.map(row => {
      const settlementsCents = byAssignment.get(row.id) ?? []
      return {
        ...row.view,
        reconciliation: reconcileAssignment({
          status: row.view.status,
          assignedAmountCents: row.view.assignedAmountCents,
          commissionRateBps: row.view.commissionRateBps,
          settlementsCents,
        }),
      }
    })

    // ⚠️ Les libellés voyagent dans une carte LOCALE au tour d'appel, jamais
    // dans un champ du service : un service Nest est un singleton, et deux
    // lectures concurrentes de deux espaces différents écraseraient la carte
    // l'une de l'autre — un nom de compte d'un autre espace s'afficherait ici.
    const context = new Map(receivableRows.map(row => [`${row.missionId}#${row.periodMonth}`, row]))

    const missing = missingAssignments(
      receivableRows,
      assignmentRows.map(row => ({ missionId: row.view.missionId, periodMonth: row.view.periodMonth })),
    )

    const summary = summarizeFactoring(
      assignments.map(row => ({
        status: row.status,
        assignedAmountCents: row.assignedAmountCents,
        commissionRateBps: row.commissionRateBps,
        settlementsCents: byAssignment.get(row.id) ?? [],
      })),
      { unreconciledSettlementsCents: unreconciled.map(settlement => settlement.amountCents) },
    )

    return {
      contracts: contractRows,
      // `redactFinance` et lui seul (D45) : le champ reste PRÉSENT et vide,
      // jamais retiré et jamais à zéro. Le verdict de réconciliation est un
      // OBJET NICHÉ — `redactFinance` ne descend pas dans ses propriétés
      // toute seule, donc il se rédige à part, sur l'objet qui les porte.
      assignments: assignments.map(row => ({
        ...redactFinance(row, options.canReadFinance),
        reconciliation: redactFinance(row.reconciliation, options.canReadFinance),
      })),
      unreconciledSettlements: unreconciled,
      // ⚠️ `invoicedAmountCents` est déjà dans `REDACTED_FINANCE_FIELDS` —
      // c'est le MÊME nom que sur `/missions/encaissements` (D45, 29/08/2026).
      // Sans cette rédaction, une créance « manquante » aurait montré son
      // montant facturé RÉEL à qui n'a pas `finance:read`, alors que le même
      // montant se vide déjà sur l'écran des encaissements — un montant qui
      // sort d'un côté et pas de l'autre est exactement ce que D45 refuse.
      missing: missing.rows.map(row => {
        const extra = context.get(`${row.missionId}#${row.periodMonth}`)
        return redactFinance(
          {
            missionId: row.missionId,
            missionLabel: extra?.missionLabel ?? null,
            accountName: extra?.accountName ?? null,
            periodMonth: row.periodMonth,
            invoicedAmountCents: row.invoicedAmountCents,
            dueOn: extra?.dueOn ?? null,
          },
          options.canReadFinance,
        )
      }),
      // ⚠️ `varianceCents` est le SEUL champ de `summary` que la vue « nombres
      // seulement » vide : les quatre totaux AGRÉGÉS (`outstanding`,
      // `awaiting`, `missing`, `unreconciled`) portent le champ générique
      // `amountCents`, qui n'est PAS dans `REDACTED_FINANCE_FIELDS` — voir le
      // docblock de la méthode. Ils restent donc lisibles sans le droit.
      summary: redactFinance({ ...summary, missing: missing.bucket }, options.canReadFinance),
      canReadFinance: options.canReadFinance,
    }
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  LE CONTRAT FACTOR                                                       */
  /* ════════════════════════════════════════════════════════════════════════ */

  async createContract(workspaceId: string, input: CreateFactoringContractInput): Promise<FactoringContract> {
    const saved = await this.contracts.save(
      this.contracts.create({
        workspace_id: workspaceId,
        factor_name: input.factorName,
        contract_reference: input.contractReference ?? null,
        // ⚠️ `?? null` et non `?? 0` : un taux non saisi n'est pas un
        // affacturage gratuit, et un plafond non saisi n'est pas un plafond nul.
        commission_rate_bps: input.commissionRateBps ?? null,
        outstanding_limit_cents: input.outstandingLimitCents ?? null,
        status: 'active',
        started_on: input.startedOn ?? null,
        ended_on: null,
      }),
    )
    return toContractView(saved)
  }

  async updateContract(
    workspaceId: string,
    contractId: string,
    input: UpdateFactoringContractInput,
  ): Promise<FactoringContract> {
    const contract = await this.contracts.findOne({ where: { id: contractId, workspace_id: workspaceId } })
    if (!contract) throw new NotFoundException("Ce contrat d'affacturage est introuvable")

    // ⚠️ `in` et non `!== undefined` : c'est la PRÉSENCE de la clé qui décide.
    // Poser `contractReference: null` EFFACE la référence — ce qui est un geste
    // légitime — alors que l'omettre la laisse intacte. Les confondre ferait
    // effacer trois champs à chaque modification d'un quatrième.
    if ('factorName' in input && input.factorName !== undefined) contract.factor_name = input.factorName
    if ('contractReference' in input) contract.contract_reference = input.contractReference ?? null
    if ('commissionRateBps' in input) contract.commission_rate_bps = input.commissionRateBps ?? null
    if ('outstandingLimitCents' in input) contract.outstanding_limit_cents = input.outstandingLimitCents ?? null
    if ('status' in input && input.status !== undefined) contract.status = input.status
    if ('endedOn' in input) contract.ended_on = input.endedOn ?? null

    return toContractView(await this.contracts.save(contract))
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  LA CESSION                                                              */
  /* ════════════════════════════════════════════════════════════════════════ */

  /**
   * PRÉPARER une cession — le geste de la maquette.
   *
   * Il refuse deux choses, et chacune protégerait un chiffre faux :
   *  · une créance qui n'est PAS facturée. Une cession porte sur une créance ;
   *    céder un mois bloqué céderait un montant qui n'existe pas encore.
   *  · un contrat TERMINÉ. Céder à un factor dont le contrat est clos ferait
   *    entrer la ligne dans un encours que personne ne réglera.
   */
  async prepare(workspaceId: string, input: PrepareAssignmentInput): Promise<{ id: string }> {
    const contract = await this.contracts.findOne({ where: { id: input.contractId, workspace_id: workspaceId } })
    if (!contract) throw new NotFoundException("Ce contrat d'affacturage est introuvable")
    if (contract.status === 'ended') {
      throw new BadRequestException("Ce contrat d'affacturage est terminé : aucune créance ne peut plus lui être cédée")
    }

    const periodMonth = `${input.month}-01`
    // #2197.41 — `r.state = 'invoiced'` (PROUVÉ par le connecteur), jamais
    // `invoiced_at IS NOT NULL` seul : ce dernier reste vrai sur un mois
    // DÉCLARÉ, non confirmé. Céder au factor une créance qu'aucun connecteur
    // n'a prouvée ferait porter le risque d'une déclaration humaine à un tiers.
    const invoiced = await this.assignments.manager.query<{ mission_id: string }[]>(
      `SELECT r.mission_id
         FROM invoice_readiness r
        WHERE r.workspace_id = $1
          AND r.mission_id = $2
          AND r.period_month = $3
          AND r.state = 'invoiced'
          AND r.invoice_cancelled_at IS NULL`,
      [workspaceId, input.missionId, periodMonth],
    )
    if (invoiced.length === 0) {
      throw new BadRequestException(
        "Ce mois n'est pas facturé : une cession porte sur une créance, et il n'y en a pas encore",
      )
    }

    const saved = await this.assignments.save(
      this.assignments.create({
        workspace_id: workspaceId,
        contract_id: input.contractId,
        mission_id: input.missionId,
        period_month: periodMonth,
        status: 'prepared',
        assigned_amount_cents: input.assignedAmountCents ?? null,
        commission_rate_bps: input.commissionRateBps ?? null,
        assigned_on: null,
        settled_on: null,
        decision_reason: null,
      }),
    )
    return { id: saved.id }
  }

  /** Consigner que la créance a été TRANSMISE au factor. */
  async markAssigned(workspaceId: string, assignmentId: string, input: MarkAssignedInput): Promise<{ id: string }> {
    const assignment = await this.findAssignment(workspaceId, assignmentId)
    if (assignment.status !== 'prepared') {
      throw new BadRequestException('Seule une cession préparée peut être transmise au factor')
    }
    assignment.status = 'assigned'
    assignment.assigned_on = input.assignedOn ?? today()
    await this.assignments.save(assignment)
    return { id: assignment.id }
  }

  /**
   * Consigner un REFUS ou une REPRISE du factor.
   *
   * Le motif est obligatoire, ici comme dans le contrat zod et comme dans la
   * contrainte SQL — trois portes pour la même règle, parce que « le factor a
   * refusé » sans rien d'autre ne se relit pas six mois plus tard.
   *
   * ⚠️ On n'EFFACE pas la cession. Un refus est un fait, et le supprimer ferait
   * disparaître la raison pour laquelle cette créance est restée à la charge de
   * l'ESN. On archive, on ne supprime pas.
   */
  async close(workspaceId: string, assignmentId: string, input: CloseAssignmentInput): Promise<{ id: string }> {
    const assignment = await this.findAssignment(workspaceId, assignmentId)
    if (input.status === 'recalled' && assignment.status === 'prepared') {
      throw new BadRequestException("Une cession jamais transmise ne peut pas être reprise : c'est un refus")
    }
    assignment.status = input.status
    assignment.decision_reason = input.reason
    await this.assignments.save(assignment)
    return { id: assignment.id }
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  LES RÈGLEMENTS DU FACTOR                                                */
  /* ════════════════════════════════════════════════════════════════════════ */

  /**
   * Enregistrer un règlement reçu.
   *
   * `assignmentId` est FACULTATIF, et c'est la décision qui rend la
   * réconciliation possible : un avis de règlement global se saisit d'abord et
   * se rapproche ensuite. L'exiger obligerait à deviner un rattachement — ou à
   * ne pas saisir le règlement du tout, et l'argent reçu disparaîtrait de
   * l'écran.
   */
  async recordSettlement(workspaceId: string, userId: string, input: RecordSettlementInput): Promise<{ id: string }> {
    const contract = await this.contracts.findOne({ where: { id: input.contractId, workspace_id: workspaceId } })
    if (!contract) throw new NotFoundException("Ce contrat d'affacturage est introuvable")
    if (input.assignmentId) await this.findAssignment(workspaceId, input.assignmentId)

    const saved = await this.settlements.save(
      this.settlements.create({
        workspace_id: workspaceId,
        contract_id: input.contractId,
        assignment_id: input.assignmentId ?? null,
        received_on: input.receivedOn,
        amount_cents: input.amountCents,
        reference: input.reference ?? null,
        recorded_by: userId,
      }),
    )
    return { id: saved.id }
  }

  /**
   * RAPPROCHER un règlement d'une cession.
   *
   * ⚠️ Le rapprochement ne marque PAS la cession « réglée » tout seul. Le
   * verdict est DÉRIVÉ (`reconcileAssignment`) : un règlement partiel rapproché
   * doit se lire « il manque 15 000 € », pas « c'est réglé ». Poser le statut
   * ici ferait mentir la ligne au moment précis où l'écart apparaît.
   */
  async reconcileSettlement(workspaceId: string, settlementId: string, assignmentId: string): Promise<{ id: string }> {
    const settlement = await this.settlements.findOne({ where: { id: settlementId, workspace_id: workspaceId } })
    if (!settlement) throw new NotFoundException('Ce règlement est introuvable')
    const assignment = await this.findAssignment(workspaceId, assignmentId)
    if (assignment.contract_id !== settlement.contract_id) {
      throw new BadRequestException("Ce règlement vient d'un autre contrat d'affacturage que cette cession")
    }
    settlement.assignment_id = assignmentId
    await this.settlements.save(settlement)
    return { id: settlement.id }
  }

  /**
   * Marquer une cession RÉGLÉE.
   *
   * Un geste HUMAIN et non une déduction : le produit sait dire que le compte y
   * est (`matched`), il ne sait pas si l'ESN considère le dossier clos — un
   * écart de deux euros se solde, un écart de deux mille se discute.
   */
  async markSettled(workspaceId: string, assignmentId: string): Promise<{ id: string }> {
    const assignment = await this.findAssignment(workspaceId, assignmentId)
    if (assignment.status !== 'assigned') {
      throw new BadRequestException('Seule une cession transmise au factor peut être marquée réglée')
    }
    assignment.status = 'settled'
    assignment.settled_on = today()
    await this.assignments.save(assignment)
    return { id: assignment.id }
  }

  /* ════════════════════════════════════════════════════════════════════════ */
  /*  Les lectures brutes                                                     */
  /* ════════════════════════════════════════════════════════════════════════ */

  private async findAssignment(workspaceId: string, assignmentId: string): Promise<ReceivableAssignmentEntity> {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId, workspace_id: workspaceId } })
    if (!assignment) throw new NotFoundException('Cette cession est introuvable')
    return assignment
  }

  private async contractRows(workspaceId: string): Promise<FactoringContract[]> {
    const rows = await this.contracts.find({ where: { workspace_id: workspaceId }, order: { created_at: 'DESC' } })
    return rows.map(toContractView)
  }

  private async assignmentRows(
    workspaceId: string,
  ): Promise<{ id: string; view: Omit<ReceivableAssignment, 'reconciliation'> }[]> {
    const rows = await this.assignments.manager.query<AssignmentRow[]>(
      `SELECT ra.id, ra.contract_id, fc.factor_name, fc.commission_rate_bps AS contract_rate_bps,
              ra.mission_id, m.label AS mission_label, a.company_name AS account_name,
              ra.period_month, ra.status, ra.assigned_amount_cents,
              ra.commission_rate_bps AS own_rate_bps, ra.assigned_on, ra.settled_on, ra.decision_reason
         FROM receivable_assignments ra
         JOIN factoring_contracts fc ON fc.id = ra.contract_id
         LEFT JOIN missions m ON m.id = ra.mission_id
         LEFT JOIN accounts a ON a.id = m.account_id
        WHERE ra.workspace_id = $1
        ORDER BY ra.period_month DESC, ra.created_at DESC`,
      [workspaceId],
    )

    return rows.map(row => {
      // La dérivation du taux vit à UN seul endroit, dans le contrat. Ce
      // service la LIT, il ne la refait pas — deux chemins qui répondraient à
      // « quel taux s'applique ? » divergeraient au premier taux dérogatoire.
      const commissionRateBps = effectiveCommissionRateBps(
        { commissionRateBps: intOrNull(row.own_rate_bps) },
        { commissionRateBps: intOrNull(row.contract_rate_bps) },
      )
      const assignedAmountCents = intOrNull(row.assigned_amount_cents)
      return {
        id: row.id,
        view: {
          id: row.id,
          contractId: row.contract_id,
          factorName: row.factor_name ?? null,
          missionId: row.mission_id,
          missionLabel: row.mission_label ?? null,
          accountName: row.account_name ?? null,
          periodMonth: dayOf(row.period_month),
          status: row.status as ReceivableAssignmentState,
          assignedAmountCents,
          commissionRateBps,
          commissionAmountCents: commissionAmountCents(assignedAmountCents, commissionRateBps),
          assignedOn: row.assigned_on ? dayOf(row.assigned_on) : null,
          settledOn: row.settled_on ? dayOf(row.settled_on) : null,
          decisionReason: row.decision_reason ?? null,
        },
      }
    })
  }

  private async settlementRows(workspaceId: string): Promise<FactoringSettlement[]> {
    const rows = await this.settlements.find({
      where: { workspace_id: workspaceId },
      order: { received_on: 'DESC' },
    })
    return rows.map(row => ({
      id: row.id,
      contractId: row.contract_id,
      assignmentId: row.assignment_id,
      receivedOn: dayOf(row.received_on),
      // Jamais `null` : un règlement se consigne parce qu'on a vu un montant.
      amountCents: Number(row.amount_cents),
      reference: row.reference,
    }))
  }

  /**
   * Les créances FACTURÉES et IMPAYÉES de l'espace.
   *
   * ⚠️ `invoice_cancelled_at IS NULL` : une marque « facturé » ANNULÉE n'est
   * pas une créance. Sans cette clause, l'écran proposerait de céder un mois
   * dont quelqu'un vient d'annuler la facturation — et le factor recevrait une
   * créance qui n'existe pas.
   */
  private async invoicedReceivables(workspaceId: string): Promise<InvoicedReceivable[]> {
    const rows = await this.assignments.manager.query<ReceivableRow[]>(
      // #2419.4 — `paid_amount_cents` remonte aussi : sans lui, « déjà
      // encaissé » se conclut d'une date et le SOLDE d'une facture réglée à
      // moitié cesse d'être cessible.
      `SELECT r.mission_id, r.period_month, r.paid_at, r.paid_amount_cents,
              r.invoiced_amount_cents, r.due_on,
              m.label AS mission_label, a.company_name AS account_name
         FROM invoice_readiness r
         JOIN missions m ON m.id = r.mission_id
         LEFT JOIN accounts a ON a.id = m.account_id
        WHERE r.workspace_id = $1
          AND r.state = 'invoiced'
          AND r.invoice_cancelled_at IS NULL`,
      [workspaceId],
    )

    return rows.map(row => {
      const periodMonth = dayOf(row.period_month)
      return {
        missionId: row.mission_id,
        periodMonth,
        missionLabel: row.mission_label ?? null,
        accountName: row.account_name ?? null,
        dueOn: row.due_on ? dayOf(row.due_on) : null,
        // La clause `invoiced_at IS NOT NULL AND invoice_cancelled_at IS NULL`
        // ci-dessus EST la définition de `invoiced` (`assessInvoiceReadiness`
        // rend cet état dès qu'`invoicedAt` est posé). On ne relit pas la
        // colonne `state`, qui est un cache et peut dater de la veille.
        state: 'invoiced' as const,
        paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
        paidAmountCents: intOrNull(row.paid_amount_cents),
        invoicedAmountCents: intOrNull(row.invoiced_amount_cents),
      }
    })
  }
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Les formes brutes de `pg`                                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * Une créance facturée, avec ce qu'il faut pour l'AFFICHER.
 *
 * Les trois derniers champs ne servent pas au calcul — `missingAssignments` ne
 * les lit pas — mais la créance manquante n'a aucune autre ligne à elle : sans
 * eux, l'écran afficherait une file d'identifiants.
 */
type InvoicedReceivable = {
  missionId: string
  periodMonth: string
  state: 'invoiced'
  paidAt: string | null
  /** #2419.4 — le solde se lit sur les DEUX montants, jamais sur la date. */
  paidAmountCents: number | null
  invoicedAmountCents: number | null
  missionLabel: string | null
  accountName: string | null
  dueOn: string | null
}

type AssignmentRow = {
  id: string
  contract_id: string
  factor_name: string | null
  contract_rate_bps: number | string | null
  mission_id: string
  mission_label: string | null
  account_name: string | null
  period_month: string | Date
  status: string
  assigned_amount_cents: string | number | null
  own_rate_bps: number | string | null
  assigned_on: string | Date | null
  settled_on: string | Date | null
  decision_reason: string | null
}

type ReceivableRow = {
  mission_id: string
  period_month: string | Date
  paid_at: string | Date | null
  paid_amount_cents: string | number | null
  invoiced_amount_cents: string | number | null
  due_on: string | Date | null
  mission_label: string | null
  account_name: string | null
}

function toContractView(row: FactoringContractEntity): FactoringContract {
  return {
    id: row.id,
    factorName: row.factor_name,
    contractReference: row.contract_reference,
    commissionRateBps: intOrNull(row.commission_rate_bps),
    outstandingLimitCents: intOrNull(row.outstanding_limit_cents),
    status: row.status as FactoringContract['status'],
    startedOn: row.started_on ? dayOf(row.started_on) : null,
    endedOn: row.ended_on ? dayOf(row.ended_on) : null,
  }
}

/**
 * `bigint` sort de `pg` en CHAÎNE, et `null` doit rester `null`.
 *
 * ⚠️ `Number(null)` vaut `0`, et c'est exactement le défaut que tout ce domaine
 * refuse : un encours non saisi qui s'afficherait « 0 € ». La garde est ici, à
 * la frontière, et une seule fois.
 */
function intOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Une colonne `date` sort tantôt en chaîne, tantôt en `Date` selon le pilote.
 *  Les deux se ramènent au même `YYYY-MM-DD`. */
function dayOf(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10)
}

/** Aujourd'hui, en `YYYY-MM-DD`. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}
