import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { DEFAULT_PARK_REASONS, canTransitionGate, gateRequiresReason, type PriorityGate } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountParkReasonEntity } from '../../database/entities/account-park-reason.entity'

export type GateDecisionResult = {
  id: string
  priority_gate: PriorityGate
  gate_reason: string | null
  gate_decided_at: string | null
  /** Qui a franchi la porte — #3262 (BEL-SC-233). `null` = compte antérieur
   *  à la colonne, jamais deviné. */
  gate_decided_by: string | null
  /**
   * Renseigné UNIQUEMENT à la réouverture d'un compte écarté — le seul moment
   * où le motif du refus qu'on referme est encore lisible, juste avant que
   * l'écriture ne l'efface.
   *
   * On efface le motif à dessein (le traîner afficherait « hors cible » à côté
   * d'un compte qu'on travaille), mais l'effacer SANS LE DIRE fait revenir un
   * compte sans que personne sache pourquoi il était parti — donc quelqu'un
   * refait le travail, ou rouvre ce qu'un collègue avait fermé à raison.
   * « On archive, on ne supprime pas » : le fait périmé redevient inconnu AVEC
   * sa date.
   */
  reopening?: { previousReason: string | null; previousDecidedAt: string | null }
}

/**
 * La porte G1 — ce compte entre dans le portefeuille, ou il en sort
 * (PDF 2 §4.4 B2, ticket BEL-CRM-102).
 *
 * C'est le PREMIER appelant réel de la porte `account_priority`, déclarée au
 * catalogue des huit portes depuis le 19/08 et jamais franchie : une porte
 * nommée dans un enum et jamais appelée est une case à cocher, pas une
 * gouvernance.
 */
@Injectable()
export class AccountGateService {
  private readonly logger = new Logger(AccountGateService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AccountParkReasonEntity)
    private readonly parkReasons: Repository<AccountParkReasonEntity>,
  ) {}

  async decide(
    workspaceId: string,
    accountId: string,
    gate: PriorityGate,
    reason: string | null,
    /** L'auteur du geste — #3262 (BEL-SC-233). `null` = non transmis (jamais
     *  deviné). */
    decidedBy: string | null = null,
  ): Promise<GateDecisionResult> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace.')

    const verdict = canTransitionGate(account.priority_gate, gate, {
      reason: account.gate_reason ?? null,
      decidedAt: account.gate_decided_at ? account.gate_decided_at.toISOString() : null,
    })
    if (!verdict.allowed) throw new BadRequestException(verdict.reason ?? 'Transition impossible.')

    const trimmed = (reason ?? '').trim()
    if (gateRequiresReason(gate) && trimmed.length === 0) {
      throw new BadRequestException('Un motif est obligatoire pour écarter un compte.')
    }

    account.priority_gate = gate
    // Le motif ne survit qu'à l'écartement. Le traîner sur un compte repriorisé
    // afficherait « hors cible » à côté d'un compte qu'on travaille.
    account.gate_reason = gateRequiresReason(gate) ? trimmed : null
    account.gate_decided_at = new Date()
    account.gate_decided_by = decidedBy
    const saved = await this.accounts.save(account)

    // Le franchissement est journalisé par le CONTRÔLEUR, pas ici. La règle §3.2
    // veut qu'un service n'aille pas chercher le service d'un autre module ; le
    // contrôleur est la couche où un geste utilisateur traverse légitimement
    // deux domaines. La garde GA-07 mesure exactement ça.

    // Le motif entre au catalogue de l'espace s'il n'y est pas : c'est ainsi
    // qu'une ESN se constitue SA liste, au lieu d'en recevoir une inventée.
    if (gate === 'parked' && trimmed) await this.rememberReason(workspaceId, trimmed)

    return {
      id: saved.id,
      priority_gate: saved.priority_gate as PriorityGate,
      gate_reason: saved.gate_reason ?? null,
      gate_decided_at: saved.gate_decided_at ? saved.gate_decided_at.toISOString() : null,
      gate_decided_by: saved.gate_decided_by ?? null,
      ...(verdict.reopening ? { reopening: verdict.reopening } : {}),
    }
  }

  /**
   * Les motifs de l'espace, ceux qu'il a déjà utilisés d'abord.
   *
   * Les sept par défaut sont PROPOSÉS et non insérés en base : une liste
   * pré-remplie donne l'illusion d'un catalogue tenu alors que personne ne l'a
   * relu, et le compteur d'usages afficherait sept zéros.
   */
  async listReasons(workspaceId: string, locale: 'fr' | 'en'): Promise<{ items: { label: string; used: boolean }[] }> {
    const rows = await this.parkReasons.find({
      where: { workspace_id: workspaceId, archived: false },
      order: { created_at: 'ASC' },
    })
    const used = rows.map(row => ({ label: row.label, used: true }))
    const known = new Set(used.map(item => item.label.toLowerCase()))
    const defaults = DEFAULT_PARK_REASONS.map(reason => ({ label: reason[locale], used: false })).filter(
      item => !known.has(item.label.toLowerCase()),
    )
    return { items: [...used, ...defaults] }
  }

  private async rememberReason(workspaceId: string, label: string): Promise<void> {
    try {
      await this.parkReasons
        .createQueryBuilder()
        .insert()
        .values({ workspace_id: workspaceId, label, archived: false })
        .orIgnore()
        .execute()
    } catch (cause) {
      this.logger.warn('motif d’écartement non mémorisé', { error: cause, workspaceId })
    }
  }
}
