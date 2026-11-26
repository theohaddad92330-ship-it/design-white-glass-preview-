import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { MoreThanOrEqual, Repository } from 'typeorm'
import { NotificationEntity } from '../../database/entities/notification.entity'
import { maxSignalAlertsPerDay } from './watchlist-refresh.queue'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * #3920.a — le compteur du plafond d'alertes « nouveau signal ». LE réglage est
 * `maxSignalAlertsPerDay()` (GA-26, lu nulle part ailleurs) ; ici on ne fait
 * que compter ce qu'un destinataire a déjà reçu sur 24 heures glissantes —
 * toutes origines confondues : une alerte de fin d'analyse sonne aussi.
 */
@Injectable()
export class SignalAlertCap {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
  ) {}

  async allows(userId: string, now: Date = new Date()): Promise<boolean> {
    const cap = maxSignalAlertsPerDay()
    if (cap <= 0) return false
    const sent = await this.notifications.count({
      where: { user_id: userId, type: 'buy_signal', created_at: MoreThanOrEqual(new Date(now.getTime() - DAY_MS)) },
    })
    return sent < cap
  }
}
