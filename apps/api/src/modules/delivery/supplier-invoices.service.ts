import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  applyFieldUpdates,
  fieldSourceRank,
  type CreateSupplierInvoiceInput,
  type EvidenceFieldSource,
  type FieldSource,
  type SupplierInvoice,
  type SupplierInvoiceStatus,
  type UpdateSupplierInvoiceInput,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { SupplierInvoiceEntity } from '../../database/entities/supplier-invoice.entity'

/**
 * Les factures ENTRANTES d'un sous-traitant (30/08/2026) — distinctes de la
 * facturation CLIENT (`InvoiceReadinessService`).
 *
 * Même arbitre que les frais de mission : chaque édition de VALEUR passe par
 * `applyFieldUpdates` (« une correction humaine gagne toujours »). Le
 * STATUT, lui, est un cycle de vie et non une valeur concurrente — il change
 * par `setStatus`, sans arbitrage de provenance : contester puis re-valider un
 * paiement est un cas réel, et ce n'est pas la même question que « qui a
 * raison sur le montant ».
 */
@Injectable()
export class SupplierInvoicesService {
  constructor(
    @InjectRepository(SupplierInvoiceEntity) private readonly invoices: Repository<SupplierInvoiceEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async list(workspaceId: string, missionId: string): Promise<SupplierInvoice[]> {
    await this.assertMission(missionId, workspaceId)
    const rows = await this.invoices.find({
      where: { mission_id: missionId, workspace_id: workspaceId },
      order: { invoice_date: 'DESC', created_at: 'DESC' },
    })
    return rows.map(toApi)
  }

  /**
   * La somme de TOUTES les factures d'une mission, en centimes — statut
   * `disputed` compris. Une facture contestée n'est pas une facture annulée
   * (« on archive, on ne supprime pas ») : son montant reste la meilleure
   * estimation connue du coût tant que le litige n'est pas résolu, et
   * l'exclure sous-évaluerait silencieusement le coût réel de la mission.
   */
  async totalCents(workspaceId: string, missionId: string): Promise<number> {
    const rows = await this.invoices.manager.query<{ total: string | null }[]>(
      `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total FROM supplier_invoices
        WHERE mission_id = $1 AND workspace_id = $2`,
      [missionId, workspaceId],
    )
    return Number(rows[0]?.total ?? 0)
  }

  /** Toujours `source: 'human'` et `status: 'pending'` — la route par laquelle
   *  une PERSONNE enregistre une facture reçue. */
  async create(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: CreateSupplierInvoiceInput,
  ): Promise<SupplierInvoice> {
    await this.assertMission(missionId, workspaceId)
    const saved = await this.invoices.save(
      this.invoices.create({
        mission_id: missionId,
        workspace_id: workspaceId,
        reference: input.reference,
        amount_cents: input.amountCents,
        invoice_date: input.invoiceDate,
        entered_by: userId,
        source: 'human',
        status: 'pending',
      }),
    )
    return toApi(saved)
  }

  /** Édite les CHAMPS de valeur — arbitrés champ par champ, comme les frais. */
  async update(
    workspaceId: string,
    missionId: string,
    invoiceId: string,
    input: UpdateSupplierInvoiceInput,
    incomingSource: EvidenceFieldSource = 'human',
  ): Promise<SupplierInvoice> {
    const existing = await this.findScoped(workspaceId, missionId, invoiceId)
    const currentSource = (existing.source as FieldSource) ?? 'human'
    const { accepted } = applyFieldUpdates({
      incoming: {
        reference: input.reference,
        amountCents: input.amountCents,
        invoiceDate: input.invoiceDate,
      },
      incomingSource,
      current: {
        reference: existing.reference,
        amountCents: Number(existing.amount_cents),
        invoiceDate: existing.invoice_date,
      },
      currentSources: { reference: currentSource, amountCents: currentSource, invoiceDate: currentSource },
    })

    if (Object.keys(accepted).length === 0) return toApi(existing)

    const patch: Partial<Pick<SupplierInvoiceEntity, 'reference' | 'amount_cents' | 'invoice_date' | 'source'>> = {}
    if ('reference' in accepted) patch.reference = accepted.reference as string
    if ('amountCents' in accepted) patch.amount_cents = accepted.amountCents as number
    if ('invoiceDate' in accepted) patch.invoice_date = accepted.invoiceDate as string
    if (fieldSourceRank(incomingSource) > fieldSourceRank(currentSource)) patch.source = incomingSource

    await this.invoices.update({ id: invoiceId }, patch)
    return toApi(await this.findScoped(workspaceId, missionId, invoiceId))
  }

  /** Fait avancer le cycle de vie. Direct — aucun arbitrage de provenance :
   *  un statut n'est pas une valeur qu'une source concurrente propose. */
  async setStatus(
    workspaceId: string,
    missionId: string,
    invoiceId: string,
    status: SupplierInvoiceStatus,
  ): Promise<SupplierInvoice> {
    await this.findScoped(workspaceId, missionId, invoiceId)
    await this.invoices.update({ id: invoiceId }, { status })
    return toApi(await this.findScoped(workspaceId, missionId, invoiceId))
  }

  private async findScoped(workspaceId: string, missionId: string, invoiceId: string): Promise<SupplierInvoiceEntity> {
    const existing = await this.invoices.findOne({
      where: { id: invoiceId, mission_id: missionId, workspace_id: workspaceId },
    })
    if (!existing) throw new NotFoundException('Facture fournisseur introuvable dans cette mission.')
    return existing
  }

  private async assertMission(missionId: string, workspaceId: string): Promise<void> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable')
  }
}

function toApi(row: SupplierInvoiceEntity): SupplierInvoice {
  return {
    id: row.id,
    missionId: row.mission_id,
    reference: row.reference,
    amountCents: Number(row.amount_cents),
    invoiceDate: typeof row.invoice_date === 'string' ? row.invoice_date.slice(0, 10) : row.invoice_date,
    status: row.status as SupplierInvoiceStatus,
    enteredByUserId: row.entered_by,
    source: (row.source as EvidenceFieldSource) ?? 'human',
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
