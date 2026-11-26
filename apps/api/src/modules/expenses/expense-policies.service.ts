import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  ExpenseCategory,
  ExpensePolicyBoard,
  ExpensePolicyView,
  ExpenseReimbursementBasis,
  SaveExpensePolicyInput,
} from '@bellum/contracts'
import { ExpenseReportEntity } from '../../database/entities/expense-report.entity'

/** La borne de la liste de clients. Elle est DITE à l'écran, jamais silencieuse. */
const ACCOUNTS_LIMIT = 200

/**
 * LE BARÈME DE FRAIS — le réglage, et sa PORTE UNIQUE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 31/08 a livré la politique de frais — plafond par catégorie, droit à
 * déduction de TVA, base de remboursement — et aucun moyen de l'écrire. Elle
 * n'existait que par le semis de démonstration. Un client réel n'avait donc
 * AUCUN barème, ce qui rendait toutes ses notes « non vérifiées » : le verdict
 * était juste, et parfaitement inutile, puisque rien ne permettait d'y répondre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN RÉGLAGE VIT À UN SEUL ENDROIT (loi 1 du tome 7, GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le barème par défaut de l'espace ET les barèmes négociés par client vivent
 * derrière la MÊME porte — `PUT expenses/policies`, un écran, un module d'API.
 * La tentation était de mettre le barème d'un client sur sa fiche : deux écrans
 * pour un réglage, donc deux vérités, et le premier symptôme est « j'ai changé
 * le plafond et ça n'a rien fait » parce qu'on l'avait changé de l'autre côté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ENREGISTREMENT N'EFFACE PAS L'HISTOIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une révision est un jeu de plafonds à UNE date. Le service ne remplace que
 * les entrées portant CETTE date : les révisions antérieures restent, et les
 * notes déjà jugées continuent de l'être sous le barème qui était en vigueur
 * quand la dépense a eu lieu. C'est le point de tout le chantier — sans lui,
 * relever un plafond en septembre rendrait rétroactivement conformes des notes
 * de mars.
 */
@Injectable()
export class ExpensePoliciesService {
  constructor(@InjectRepository(ExpenseReportEntity) private readonly reports: Repository<ExpenseReportEntity>) {}

  /** Les barèmes de l'espace, toutes révisions comprises, et les clients. */
  async board(workspaceId: string): Promise<ExpensePolicyBoard> {
    const policyRows = await this.reports.manager.query<PolicyRow[]>(
      `SELECT p.id, p.account_id, p.label, p.reimbursement_basis, a.company_name AS account_name
         FROM expense_policies p
         LEFT JOIN accounts a ON a.id = p.account_id
        WHERE p.workspace_id = $1
        ORDER BY (p.account_id IS NOT NULL), a.company_name NULLS FIRST`,
      [workspaceId],
    )

    const capRows = await this.reports.manager.query<CapRow[]>(
      `SELECT policy_id, category, cap_cents, vat_recoverable, effective_from
         FROM expense_policy_caps
        WHERE workspace_id = $1
        ORDER BY effective_from NULLS FIRST, category`,
      [workspaceId],
    )
    const rateRows = await this.reports.manager.query<RateRow[]>(
      `SELECT policy_id, fiscal_horsepower, cents_per_km, effective_from
         FROM expense_mileage_rates
        WHERE workspace_id = $1
        ORDER BY effective_from, fiscal_horsepower`,
      [workspaceId],
    )

    const policies: ExpensePolicyView[] = policyRows.map(row => ({
      id: row.id,
      accountId: row.account_id ?? null,
      accountName: row.account_name ?? null,
      label: row.label,
      reimbursementBasis: row.reimbursement_basis as ExpenseReimbursementBasis,
      caps: capRows
        .filter(cap => cap.policy_id === row.id)
        .map(cap => ({
          category: cap.category as ExpenseCategory,
          // `null` reste `null` : « non plafonnée » n'est pas « plafonnée à 0 ».
          capCents: cap.cap_cents === null ? null : Number(cap.cap_cents),
          vatRecoverable: cap.vat_recoverable,
          effectiveFrom: cap.effective_from === null ? null : dateOnly(cap.effective_from),
        })),
      mileageRates: rateRows
        .filter(rate => rate.policy_id === row.id)
        .map(rate => ({
          fiscalHorsepower: Number(rate.fiscal_horsepower),
          centsPerKm: Number(rate.cents_per_km),
          effectiveFrom: dateOnly(rate.effective_from),
        })),
    }))

    // ⚠️ On demande UN de plus que la borne : c'est ce qui permet de DIRE que la
    // liste est tronquée plutôt que de la couper en silence. Une liste coupée
    // sans le dire fait conclure qu'un client n'existe pas.
    const accountRows = await this.reports.manager.query<AccountRow[]>(
      `SELECT id, company_name FROM accounts
        WHERE workspace_id = $1 AND company_name IS NOT NULL
        ORDER BY company_name
        LIMIT $2`,
      [workspaceId, ACCOUNTS_LIMIT + 1],
    )

    return {
      policies,
      accounts: accountRows.slice(0, ACCOUNTS_LIMIT).map(row => ({ id: row.id, name: row.company_name })),
      accountsTruncated: accountRows.length > ACCOUNTS_LIMIT,
    }
  }

  /**
   * ENREGISTRE une révision du barème.
   *
   * Trois gestes dans une seule transaction, et l'ordre compte :
   *  1. la politique elle-même est trouvée ou créée — `account_id IS NOT
   *     DISTINCT FROM` et non `=`, parce que `NULL = NULL` est faux en SQL et
   *     que la politique par DÉFAUT porte précisément `account_id NULL` ;
   *  2. les entrées de CETTE date d'effet sont retirées — ré-enregistrer la
   *     même date CORRIGE la révision au lieu d'en créer une seconde, que les
   *     index uniques refuseraient de toute façon ;
   *  3. les entrées envoyées sont écrites à cette date.
   *
   * Ce qui n'est PAS touché : toute entrée d'une AUTRE date. C'est ce qui rend
   * l'historique inviolable, et c'est délibéré — un verdict déjà rendu ne se
   * réécrit pas parce qu'une règle a changé depuis.
   */
  async save(workspaceId: string, input: SaveExpensePolicyInput): Promise<{ id: string }> {
    return this.reports.manager.transaction(async manager => {
      const [existing] = await manager.query<{ id: string }[]>(
        `SELECT id FROM expense_policies
          WHERE workspace_id = $1 AND account_id IS NOT DISTINCT FROM $2::uuid`,
        [workspaceId, input.accountId],
      )

      let policyId = existing?.id ?? null
      if (policyId === null) {
        const [created] = await manager.query<{ id: string }[]>(
          `INSERT INTO expense_policies (workspace_id, account_id, label, reimbursement_basis)
           VALUES ($1, $2::uuid, $3, $4)
           RETURNING id`,
          [workspaceId, input.accountId, input.label.trim(), input.reimbursementBasis],
        )
        policyId = created?.id ?? null
      } else {
        await manager.query(
          `UPDATE expense_policies SET label = $3, reimbursement_basis = $4, updated_at = now()
            WHERE id = $1 AND workspace_id = $2`,
          [policyId, workspaceId, input.label.trim(), input.reimbursementBasis],
        )
      }
      if (policyId === null) throw new Error('La politique de frais n’a pas pu être écrite.')

      await manager.query(
        `DELETE FROM expense_policy_caps
          WHERE policy_id = $1 AND workspace_id = $2 AND effective_from = $3::date`,
        [policyId, workspaceId, input.effectiveFrom],
      )
      for (const cap of input.caps) {
        await manager.query(
          `INSERT INTO expense_policy_caps
             (policy_id, workspace_id, category, cap_cents, vat_recoverable, effective_from)
           VALUES ($1, $2, $3, $4::bigint, $5, $6::date)`,
          [
            policyId,
            workspaceId,
            cap.category,
            // ⚠️ `null` traverse tel quel : c'est « cette catégorie n'est pas
            // plafonnée », donc NON VÉRIFIÉE — jamais « plafond zéro ».
            cap.capCents,
            cap.vatRecoverable,
            input.effectiveFrom,
          ],
        )
      }

      await manager.query(
        `DELETE FROM expense_mileage_rates
          WHERE policy_id = $1 AND workspace_id = $2 AND effective_from = $3::date`,
        [policyId, workspaceId, input.effectiveFrom],
      )
      for (const rate of input.mileageRates) {
        await manager.query(
          `INSERT INTO expense_mileage_rates
             (policy_id, workspace_id, fiscal_horsepower, cents_per_km, effective_from)
           VALUES ($1, $2, $3::int, $4::bigint, $5::date)`,
          [policyId, workspaceId, rate.fiscalHorsepower, rate.centsPerKm, input.effectiveFrom],
        )
      }

      return { id: policyId }
    })
  }
}

type PolicyRow = {
  id: string
  account_id: string | null
  label: string
  reimbursement_basis: string
  account_name: string | null
}
type CapRow = {
  policy_id: string
  category: string
  cap_cents: string | null
  vat_recoverable: boolean
  effective_from: string | Date | null
}
type RateRow = {
  policy_id: string
  fiscal_horsepower: number | string
  cents_per_km: number | string
  effective_from: string | Date
}
type AccountRow = { id: string; company_name: string }

/** `YYYY-MM-DD` — une colonne `date` peut revenir en `Date` selon le pilote. */
function dateOnly(value: string | Date): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}
