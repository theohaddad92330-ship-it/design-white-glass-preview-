import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { WorkspaceTeamService } from './workspace-team.service'

/**
 * #4158.3 — range la table des invitations : celles dont l'échéance est passée
 * passent `expired`. Les lectures ne dépendent PAS de ce balayage (elles filtrent
 * sur `expires_at`) ; il évite seulement que des lignes `pending` périmées
 * traînent. Idempotent ; le verrou évite que N réplicas se disputent le tick.
 */
@Injectable()
export class WorkspaceInvitationExpirySweeper {
  private readonly logger = new Logger(WorkspaceInvitationExpirySweeper.name)

  constructor(
    private readonly team: WorkspaceTeamService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  @Cron('23 * * * *', { name: 'workspace-invitation-expiry' })
  @Correlated('cron:workspace-invitation-expiry.sweep')
  async sweep(): Promise<number> {
    let marked = 0
    try {
      await withSingletonLock(this.locks, 'workspace-invitation-expiry', async () => {
        marked = await this.team.markExpiredInvitations()
      })
    } catch (error) {
      this.logger.error('Invitation expiry sweep failed', { error })
    }
    return marked
  }
}
