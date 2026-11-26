import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { OwnerInvitationEntity } from '../../database/entities/owner-invitation.entity'
import { AdminUsersService } from './admin-users.service'
import { OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS } from './owner-activation-followup'
import { daysBetween } from './manual-billing-schedule'

/** J+5 — le dernier rang de la cadence (#2643.3) : au-delà, il n'y a plus de
 *  relance à attendre, seulement une inactivité à signaler. */
const ALERT_AFTER_DAYS = OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS[OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS.length - 1]

interface OwnerActivationSweepReport {
  /** Sièges envoyés, jamais encore alertés, examinés ce passage. */
  examined: number
  /** Combien se sont révélés inactifs — et ont donc été alertés. */
  alerted: number
}

/**
 * LE BALAYAGE QUI ALERTE L'ÉQUIPE INTERNE D'UN SIÈGE TOUJOURS INACTIF —
 * #2643.3, troisième et dernier point de l'issue.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE PASSAGE, ET POURQUOI IL N'ENVOIE RIEN
 * ─────────────────────────────────────────────────────────────────────────────
 * La relance vers le CLIENT se prépare et attend un clic opérateur (même
 * décision qu'en #2643.1) — voir `OwnerActivationService.send` et la cadence
 * `dueFollowUp`. L'ALERTE, elle, va à l'ÉQUIPE INTERNE : personne d'extérieur
 * ne la reçoit, donc rien n'exige de geste humain pour la déclencher. Même
 * mécanisme que `ManualBillingSweepService` : un `logger.warn` structuré, qui
 * part vers Sentry — pas un second journal.
 *
 * ⚠️ « INACTIF » SE LIT DANS SUPABASE AUTH, JAMAIS DEVINÉ. Un propriétaire
 * ABSENT de `AdminUsersService.listAuthStates()` est INCONNU, pas « jamais
 * connecté » (le magasin peut être en panne, ou plafonné à 5000 comptes) — ce
 * balayage ne l'alerte donc PAS. Seul un propriétaire PRÉSENT avec
 * `lastSignInAt: null` est un fait établi d'inactivité.
 *
 * `alerted_at` garde l'alerte à UN SEUL passage par siège : sans lui, le même
 * siège inactif réveillerait l'équipe chaque jour indéfiniment.
 */
@Injectable()
export class OwnerActivationSweepService {
  private readonly logger = new Logger(OwnerActivationSweepService.name)

  constructor(
    @InjectRepository(OwnerInvitationEntity)
    private readonly invitations: Repository<OwnerInvitationEntity>,
    private readonly adminUsers: AdminUsersService,
    @Optional() private readonly locks?: SingletonLockService,
  ) {}

  /** 07:20 Europe/Paris — juste après le balayage de facturation (07:10),
   *  dans la même fenêtre de bureau. */
  @Cron('20 7 * * *', { name: 'owner-activation-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:owner_activation.sweep')
  async runDailySweep(): Promise<void> {
    await withSingletonLock(this.locks, 'owner-activation-sweep', async () => {
      await this.sweep()
    })
  }

  async sweep(today: string = new Date().toISOString()): Promise<OwnerActivationSweepReport> {
    const pending = await this.invitations.find({
      where: { sent_at: Not(IsNull()), alerted_at: IsNull() },
    })
    if (pending.length === 0) return { examined: 0, alerted: 0 }

    const auth = await this.adminUsers.listAuthStates()
    const byUserId = new Map(auth.states.map(state => [state.userId, state]))

    let alerted = 0
    for (const row of pending) {
      const elapsed = daysBetween(row.sent_at!.toISOString().slice(0, 10), today.slice(0, 10))
      if (elapsed < ALERT_AFTER_DAYS) continue

      // Absent du magasin = INCONNU, jamais « jamais connecté ». On ne devine pas.
      const state = byUserId.get(row.user_id)
      if (!state || state.lastSignInAt !== null) continue

      this.logger.warn(
        `Siège provisionné toujours inactif — ${row.esn_name} (J+${elapsed}, envoyé le ` +
          `${row.sent_at!.toISOString().slice(0, 10)})`,
        {
          tags: { 'admin.op': 'owner_activation.alert' },
          contexts: { ownerActivation: { workspaceId: row.workspace_id, daysSinceSent: elapsed } },
        },
      )
      row.alerted_at = new Date()
      await this.invitations.save(row)
      alerted += 1
    }

    return { examined: pending.length, alerted }
  }
}
