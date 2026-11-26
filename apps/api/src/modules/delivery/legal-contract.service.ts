import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  legalContractChainNoGo,
  legalContractLifecycle,
  nextLegalContractDocumentVersion,
  visibleLegalContractDocuments,
  type AddLegalContractDocumentInput,
  type CreateLegalContractInput,
  type LegalContract,
  type LegalContractLifecycle,
  type LegalContractNoGoReason,
  type MissionChannel,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { ownerDisplayName } from './delivery.service'

interface LegalContractRow {
  id: string
  workspace_id: string
  account_id: string
  type: string
  label: string
  counterparty_name: string
  legal_entity_id: string | null
  legal_entity_name: string | null
  owner_id: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  owner_email: string | null
  starts_on: string | null
  ends_on: string | null
  scope: string | null
  tariff_note: string | null
  volume_note: string | null
  cap_amount_cents: string | number | null
  payment_terms_days: number | null
  payment_terms_basis: string | null
  notice_days: number | null
  auto_renew: boolean
  documents: unknown
  source: string
  status: string
  confidential: boolean
  created_at: string | Date
  updated_at: string | Date
}

const SELECT_COLUMNS = `
  c.id, c.workspace_id, c.account_id, c.type, c.label, c.counterparty_name,
  c.legal_entity_id, le.name AS legal_entity_name,
  c.owner_id, p.first_name AS owner_first_name, p.last_name AS owner_last_name, p.email AS owner_email,
  c.starts_on, c.ends_on, c.scope, c.tariff_note, c.volume_note, c.cap_amount_cents,
  c.payment_terms_days, c.payment_terms_basis, c.notice_days, c.auto_renew,
  c.documents, c.source, c.status, c.confidential, c.created_at, c.updated_at
`

function toView(row: LegalContractRow): LegalContract {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    accountId: row.account_id,
    type: row.type as LegalContract['type'],
    label: row.label,
    counterpartyName: row.counterparty_name,
    legalEntityId: row.legal_entity_id,
    legalEntityName: row.legal_entity_name,
    ownerId: row.owner_id,
    ownerName: ownerDisplayName(row.owner_first_name, row.owner_last_name, row.owner_email),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    scope: row.scope,
    tariffNote: row.tariff_note,
    volumeNote: row.volume_note,
    capAmountCents: row.cap_amount_cents === null ? null : Number(row.cap_amount_cents),
    paymentTermsDays: row.payment_terms_days,
    paymentTermsBasis: row.payment_terms_basis as LegalContract['paymentTermsBasis'],
    noticeDays: row.notice_days,
    autoRenew: row.auto_renew,
    documents: Array.isArray(row.documents) ? (row.documents as LegalContract['documents']) : [],
    source: row.source as LegalContract['source'],
    status: row.status as LegalContract['status'],
    confidential: row.confidential,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/** Qui lit : son id (pour reconnaître le propriétaire) et son droit finance.
 *  Obligatoire partout où un contrat est rendu — #2422.10 : une pièce que le
 *  lecteur ne peut pas voir ne sort jamais, quelle que soit la route. */
export interface LegalContractViewer {
  userId: string
  canReadFinance: boolean
}

/**
 * La vue d'un contrat POUR ce lecteur — #2422.6 et #2422.10. Les tarifs
 * (`tariffNote`, `capAmountCents`) ne sortent que pour qui a `finance:read` ou
 * porte le contrat (le rôle CONTRACTUEL « propriétaire ») : sinon ils valent
 * `null`, PRÉSENTS et vides (D45) — jamais retirés, jamais 0. Les pièces
 * refusées ne font aucune ligne.
 */
function viewFor(view: LegalContract, viewer: LegalContractViewer): LegalContract {
  const isOwner = view.ownerId !== null && view.ownerId === viewer.userId
  const seesTariffs = viewer.canReadFinance || isOwner
  return {
    ...view,
    tariffNote: seesTariffs ? view.tariffNote : null,
    capAmountCents: seesTariffs ? view.capAmountCents : null,
    documents: visibleLegalContractDocuments(view.documents, { canReadFinance: viewer.canReadFinance, isOwner }),
  }
}

/**
 * #2422.4 (épopée #2869) — L'appelant du contrat typé. Le seul écrivain de
 * `legal_contracts`.
 *
 * ⚠️ Comme `MissionAmendmentService`, ce service n'a pas d'entité TypeORM
 * dédiée : il emprunte le repository de `InvoiceReadinessEntity` pour son
 * seul accès à `manager.query` (même patron, `mission-amendment.service.ts`)
 * — `legal_contracts` n'est manipulée qu'en SQL, jamais via ce repository.
 */
@Injectable()
export class LegalContractService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
  ) {}

  private async assertAccountInWorkspace(workspaceId: string, accountId: string): Promise<void> {
    const [row] = returnedRows<{ id: string }>(
      await this.repo.manager.query(`SELECT id FROM accounts WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        accountId,
        workspaceId,
      ]),
    )
    if (!row) throw new NotFoundException('Compte introuvable')
  }

  async list(
    workspaceId: string,
    accountId: string,
    viewer: LegalContractViewer,
  ): Promise<
    (LegalContract & {
      lifecycle: LegalContractLifecycle
      noGo: { missionId: string; missionLabel: string | null; reason: LegalContractNoGoReason }[]
    })[]
  > {
    await this.assertAccountInWorkspace(workspaceId, accountId)
    const rows = returnedRows<LegalContractRow>(
      await this.repo.manager.query(
        `SELECT ${SELECT_COLUMNS}
           FROM legal_contracts c
           LEFT JOIN legal_entities le ON le.id = c.legal_entity_id
           LEFT JOIN profiles p ON p.user_id = c.owner_id
          WHERE c.account_id = $1 AND c.workspace_id = $2
          ORDER BY c.created_at DESC`,
        [accountId, workspaceId],
      ),
    )
    // #2422.11 — le NO-GO (`legalContractChainNoGo`, calcul pur testé seul
    // depuis cinq nuits, jamais appelé) : croisé ici avec les missions du MÊME
    // compte — le seul rapprochement qui n'invente rien, `legal_contracts`
    // n'ayant aucune colonne qui nomme LA mission qu'il couvre. Un compte sans
    // mission, ou une mission dont `legal_entity_id`/`channel` sont tous deux
    // inconnus, ne produit aucune ligne — on ne bloque jamais sur une
    // comparaison qu'on ne peut pas faire honnêtement (même refus que
    // `po_period_mismatch`, `invoice-readiness.ts`).
    const missions =
      rows.length === 0
        ? []
        : returnedRows<{ id: string; label: string | null; legal_entity_id: string | null; channel: string | null }>(
            await this.repo.manager.query(
              `SELECT m.id, m.label, m.legal_entity_id, mct.channel
                 FROM missions m
                 LEFT JOIN mission_commercial_terms mct ON mct.mission_id = m.id
                WHERE m.account_id = $1 AND m.workspace_id = $2`,
              [accountId, workspaceId],
            ),
          )
    const now = new Date()
    return rows.map(row => {
      const view = toView(row)
      const noGo = missions.flatMap(mission => {
        const reason = legalContractChainNoGo({
          contract: { legalEntityId: view.legalEntityId, source: view.source },
          mission: {
            legalEntityId: mission.legal_entity_id,
            channel: (mission.channel ?? 'unknown') as MissionChannel,
          },
        })
        return reason ? [{ missionId: mission.id, missionLabel: mission.label, reason }] : []
      })
      return { ...viewFor(view, viewer), lifecycle: legalContractLifecycle(view, now), noGo }
    })
  }

  async create(
    workspaceId: string,
    userId: string,
    accountId: string,
    input: CreateLegalContractInput,
  ): Promise<LegalContract & { lifecycle: LegalContractLifecycle }> {
    await this.assertAccountInWorkspace(workspaceId, accountId)
    const [inserted] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `INSERT INTO legal_contracts
           (workspace_id, account_id, type, label, counterparty_name, legal_entity_id, owner_id,
            starts_on, ends_on, scope, tariff_note, volume_note, cap_amount_cents,
            payment_terms_days, payment_terms_basis, notice_days, auto_renew, source, status,
            confidential, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING id`,
        [
          workspaceId,
          accountId,
          input.type,
          input.label,
          input.counterpartyName,
          input.legalEntityId,
          input.ownerId,
          input.startsOn,
          input.endsOn,
          input.scope,
          input.tariffNote,
          input.volumeNote,
          input.capAmountCents,
          input.paymentTermsDays,
          input.paymentTermsBasis,
          input.noticeDays,
          input.autoRenew,
          input.source,
          input.status,
          input.confidential,
          userId,
        ],
      ),
    )
    const [row] = returnedRows<LegalContractRow>(
      await this.repo.manager.query(
        `SELECT ${SELECT_COLUMNS}
           FROM legal_contracts c
           LEFT JOIN legal_entities le ON le.id = c.legal_entity_id
           LEFT JOIN profiles p ON p.user_id = c.owner_id
          WHERE c.id = $1`,
        [inserted.id],
      ),
    )
    const view = toView(row)
    return { ...view, lifecycle: legalContractLifecycle(view, new Date()) }
  }

  /**
   * #2422.5 (chaîne contractuelle rang 2) — réattribuer le PROPRIÉTAIRE du
   * contrat. Même garde que `StaffingService.setCraContact`/`setClientManager`
   * (`staffing.service.ts`) : le nouveau titulaire DOIT appartenir à
   * l'ESPACE — accepter n'importe quel UUID romprait la chaîne que l'écran
   * suppose déjà (« qui possède ce contrat » ne doit jamais nommer quelqu'un
   * hors de l'espace). `ownerId: null` retire le propriétaire, jamais un état
   * à part.
   */
  async reassignOwner(
    workspaceId: string,
    accountId: string,
    contractId: string,
    ownerId: string | null,
    viewer: LegalContractViewer,
  ): Promise<LegalContract & { lifecycle: LegalContractLifecycle }> {
    await this.assertAccountInWorkspace(workspaceId, accountId)
    if (ownerId) {
      const [member] = returnedRows<{ user_id: string }>(
        await this.repo.manager.query(
          `SELECT user_id FROM workspace_members WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
          [ownerId, workspaceId],
        ),
      )
      if (!member) throw new BadRequestException('Ce propriétaire n’appartient pas à cet espace')
    }
    const [updated] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `UPDATE legal_contracts SET owner_id = $1, updated_at = now()
          WHERE id = $2 AND account_id = $3 AND workspace_id = $4
        RETURNING id`,
        [ownerId, contractId, accountId, workspaceId],
      ),
    )
    if (!updated) throw new NotFoundException('Contrat introuvable dans cet espace')
    const [row] = returnedRows<LegalContractRow>(
      await this.repo.manager.query(
        `SELECT ${SELECT_COLUMNS}
           FROM legal_contracts c
           LEFT JOIN legal_entities le ON le.id = c.legal_entity_id
           LEFT JOIN profiles p ON p.user_id = c.owner_id
          WHERE c.id = $1`,
        [contractId],
      ),
    )
    const view = toView(row)
    return { ...viewFor(view, viewer), lifecycle: legalContractLifecycle(view, new Date()) }
  }

  /**
   * #2422.10 (lot X54) — déposer une pièce. Le numéro de version se DÉDUIT du
   * libellé (`nextLegalContractDocumentVersion`) : un second dépôt « Contrat
   * cadre » est la version 2, jamais un écrasement — l'historique reste dans la
   * colonne (on archive, on ne supprime pas). La réponse est filtrée pour
   * CELUI qui dépose : déposer une pièce « finance » sans ce droit ne la lui
   * rend pas en retour.
   */
  async addDocument(
    workspaceId: string,
    accountId: string,
    contractId: string,
    input: AddLegalContractDocumentInput,
    viewer: LegalContractViewer,
  ): Promise<LegalContract & { lifecycle: LegalContractLifecycle }> {
    await this.assertAccountInWorkspace(workspaceId, accountId)
    const [current] = returnedRows<{ documents: unknown }>(
      await this.repo.manager.query(
        `SELECT documents FROM legal_contracts WHERE id = $1 AND account_id = $2 AND workspace_id = $3 LIMIT 1`,
        [contractId, accountId, workspaceId],
      ),
    )
    if (!current) throw new NotFoundException('Contrat introuvable dans cet espace')
    const existing = Array.isArray(current.documents) ? (current.documents as LegalContract['documents']) : []
    const next: LegalContract['documents'] = [
      ...existing,
      {
        label: input.label,
        url: input.url,
        version: nextLegalContractDocumentVersion(existing, input.label),
        signedAt: input.signedAt,
        expiresOn: input.expiresOn,
        visibility: input.visibility,
      },
    ]
    await this.repo.manager.query(
      `UPDATE legal_contracts SET documents = $1::jsonb, updated_at = now()
        WHERE id = $2 AND account_id = $3 AND workspace_id = $4`,
      [JSON.stringify(next), contractId, accountId, workspaceId],
    )
    const [row] = returnedRows<LegalContractRow>(
      await this.repo.manager.query(
        `SELECT ${SELECT_COLUMNS}
           FROM legal_contracts c
           LEFT JOIN legal_entities le ON le.id = c.legal_entity_id
           LEFT JOIN profiles p ON p.user_id = c.owner_id
          WHERE c.id = $1`,
        [contractId],
      ),
    )
    const view = toView(row)
    return { ...viewFor(view, viewer), lifecycle: legalContractLifecycle(view, new Date()) }
  }
}
