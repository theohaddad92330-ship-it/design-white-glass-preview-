import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  IntroductionAuthorizationChannel,
  IntroductionAuthorizationItem,
  LinkKind,
  RelationalWarmth,
} from '@bellum/contracts'
import { IntroductionAuthorizationEntity } from '../../database/entities/introduction-authorization.entity'

/**
 * #2373.9 — LA PREUVE D'AUTORISATION D'UNE INTRODUCTION, DANS LE TEMPS.
 *
 * Un `granted: false` (un refus) est enregistré au même titre qu'un accord —
 * c'est une preuve, pas moins. Aucune méthode de correction/suppression :
 * ligne d'audit, même doctrine que `AccountFeedbackService` / la table
 * `submission_feedback`.
 */
@Injectable()
export class IntroductionAuthorizationService {
  private readonly logger = new Logger(IntroductionAuthorizationService.name)

  constructor(
    @InjectRepository(IntroductionAuthorizationEntity)
    private readonly authorizations: Repository<IntroductionAuthorizationEntity>,
  ) {}

  async record(args: {
    workspaceId: string
    targetContactId: string
    referrerContactId?: string | null
    referrerLabel?: string | null
    granted: boolean
    channel: IntroductionAuthorizationChannel
    text?: string | null
    scope?: string | null
    restrictions?: string | null
    authorizedAt: string
    recordedBy: string
    linkKind?: LinkKind | null
    verified?: boolean
    warmth?: RelationalWarmth | null
  }): Promise<IntroductionAuthorizationItem> {
    const rowItem = this.authorizations.create({
      workspace_id: args.workspaceId,
      target_contact_id: args.targetContactId,
      referrer_contact_id: args.referrerContactId?.trim() || null,
      referrer_label: args.referrerLabel?.trim() || null,
      granted: args.granted,
      channel: args.channel,
      text: args.text?.trim() || null,
      scope: args.scope?.trim() || null,
      restrictions: args.restrictions?.trim() || null,
      authorized_at: new Date(args.authorizedAt),
      recorded_by: args.recordedBy,
      link_kind: args.linkKind ?? null,
      verified: args.verified ?? false,
      warmth: args.warmth ?? null,
    })
    const saved = await this.authorizations.save(rowItem)

    this.logger.log('Introduction authorization recorded', {
      workspaceId: args.workspaceId,
      targetContactId: args.targetContactId,
      granted: args.granted,
      channel: args.channel,
    })

    return this.toItem(saved)
  }

  async listFor(targetContactId: string, workspaceId: string): Promise<IntroductionAuthorizationItem[]> {
    const rows = await this.authorizations.find({
      where: { target_contact_id: targetContactId, workspace_id: workspaceId },
      order: { authorized_at: 'DESC' },
    })
    return rows.map(r => this.toItem(r))
  }

  private toItem(r: IntroductionAuthorizationEntity): IntroductionAuthorizationItem {
    return {
      id: r.id,
      targetContactId: r.target_contact_id,
      referrerContactId: r.referrer_contact_id,
      referrerLabel: r.referrer_label,
      granted: r.granted,
      channel: r.channel as IntroductionAuthorizationChannel,
      text: r.text,
      scope: r.scope,
      restrictions: r.restrictions,
      authorizedAt: r.authorized_at.toISOString(),
      createdAt: r.created_at.toISOString(),
      linkKind: (r.link_kind as LinkKind | null) ?? null,
      verified: r.verified,
      warmth: (r.warmth as RelationalWarmth | null) ?? null,
    }
  }
}
