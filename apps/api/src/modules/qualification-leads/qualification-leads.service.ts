import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { LEAD_DISMISSAL_SCOPE, type LeadDecisionInput, type LeadDismissReason } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { QualificationLeadDecisionEntity } from '../../database/entities/qualification-lead-decision.entity'

/** Ce que l'écran lit : la décision, sans les colonnes techniques. */
export type LeadDecisionRead = {
  lead_key: string
  decision: 'dismissed' | 'snoozed'
  reason: LeadDismissReason | null
  note: string | null
  decided_at: string
  snoozed_until: string | null
}

/**
 * #2172.42 → .49 / .54 — LES DÉCISIONS PRISES SUR LES PISTES D'UN DOSSIER.
 *
 * ⚠️ CE SERVICE N'A QU'UN SEUL DÉPÔT, et c'est la garde elle-même : il n'existe
 * aucun chemin d'écriture vers la mémoire marché, parce qu'il n'y a pas de code
 * pour. Un écartement AJUSTE l'espace de travail ; il ne réécrit jamais la
 * donnée marché globale (`COMMUNITY_FORBIDDEN_KINDS`, GA-43).
 *
 * ⚠️ LA PORTÉE N'EST PAS UN PARAMÈTRE. Le service la POSE (`workspace`) : même
 * un appelant qui l'enverrait dans son corps ne peut pas la changer, et la
 * contrainte SQL referme le chemin une seconde fois.
 */
@Injectable()
export class QualificationLeadsService {
  constructor(
    @InjectRepository(QualificationLeadDecisionEntity)
    private readonly decisionsRepo: Repository<QualificationLeadDecisionEntity>,
  ) {}

  async decisions(workspaceId: string, accountId: string): Promise<LeadDecisionRead[]> {
    const rows = await this.decisionsRepo.find({ where: { workspace_id: workspaceId, account_id: accountId } })
    return rows.map(toRead)
  }

  async decide(
    workspaceId: string,
    accountId: string,
    leadKey: string,
    userId: string,
    input: LeadDecisionInput,
    now: Date = new Date(),
  ): Promise<LeadDecisionRead> {
    const existing = await this.decisionsRepo.findOne({
      where: { workspace_id: workspaceId, lead_key: leadKey },
    })
    const saved = await this.decisionsRepo.save({
      ...(existing ? { id: existing.id } : {}),
      workspace_id: workspaceId,
      account_id: accountId,
      lead_key: leadKey,
      decision: input.decision,
      reason: input.decision === 'dismissed' ? (input.reason ?? null) : null,
      note: input.note ?? null,
      // Posée ici, jamais lue du corps : voir le docstring de la classe.
      scope: LEAD_DISMISSAL_SCOPE,
      decided_by: userId,
      decided_at: now,
      snoozed_until: input.decision === 'snoozed' ? (input.snoozed_until ?? null) : null,
    } as Partial<QualificationLeadDecisionEntity>)
    return toRead(saved as QualificationLeadDecisionEntity)
  }

  /**
   * Reprendre une piste écartée : la DÉCISION s'efface, la piste revient. Rien
   * d'autre n'est touché — le service ne connaît pas la table des lignes.
   */
  async reopen(workspaceId: string, leadKey: string): Promise<{ reopened: true }> {
    await this.decisionsRepo.delete({ workspace_id: workspaceId, lead_key: leadKey })
    return { reopened: true }
  }
}

function toRead(row: QualificationLeadDecisionEntity): LeadDecisionRead {
  return {
    lead_key: row.lead_key,
    decision: row.decision === 'snoozed' ? 'snoozed' : 'dismissed',
    reason: (row.reason as LeadDismissReason | null) ?? null,
    note: row.note ?? null,
    decided_at: asIso(row.decided_at),
    snoozed_until: row.snoozed_until ? asIso(row.snoozed_until) : null,
  }
}

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value)
}
