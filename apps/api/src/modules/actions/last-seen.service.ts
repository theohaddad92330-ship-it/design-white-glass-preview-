import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { SinceLastSeen } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { UserLastSeenEntity } from '../../database/entities/user-last-seen.entity'

/**
 * Deux présences séparées par plus que cet écart = deux sessions distinctes, donc
 * une nouvelle fenêtre « depuis votre dernière connexion ». En-dessous (un
 * rechargement, un refresh de token, une navigation), on rafraîchit la présence
 * SANS bouger le repère — c'est ce qui empêche la fenêtre d'être toujours vide.
 * 30 minutes = la sessionisation analytique usuelle.
 */
export const SESSION_GAP_MS = 30 * 60 * 1000

/**
 * Pose et lit le repère « depuis ma dernière connexion » du Journal (§8).
 *
 * Décision produit : `previous_seen_at` est un SNAPSHOT de la visite PRÉCÉDENTE,
 * pas un heartbeat. `markSeen` est appelé à l'ouverture de l'app (pas à chaque
 * requête) et n'avance le repère QUE lorsqu'une vraie absence sépare deux
 * présences — un rechargement ou un refresh de token garde la même fenêtre.
 */
@Injectable()
export class LastSeenService {
  private readonly logger = new Logger(LastSeenService.name)

  constructor(
    @InjectRepository(UserLastSeenEntity)
    private readonly lastSeen: Repository<UserLastSeenEntity>,
  ) {}

  /**
   * Enregistre la présence de l'utilisateur MAINTENANT et renvoie le repère
   * « depuis quand » à afficher (l'instant de sa visite précédente), stable pour
   * toute la session courante. Best-effort : un accroc renvoie `{ since: null }`
   * (état d'accueil) plutôt que de faire échouer le boot de l'app.
   */
  async markSeen(userId: string, now: Date = new Date()): Promise<SinceLastSeen> {
    try {
      const row = await this.lastSeen.findOne({ where: { user_id: userId } })
      if (!row) {
        // Première visite jamais enregistrée : il n'existe pas de « dernière
        // connexion » — on amorce le repère sans prétendre à une fenêtre.
        await this.lastSeen.insert({ user_id: userId, last_seen_at: now, previous_seen_at: null })
        return { since: null }
      }

      const gapMs = now.getTime() - new Date(row.last_seen_at).getTime()
      if (gapMs > SESSION_GAP_MS) {
        // Retour après une vraie absence : le début de la session précédente
        // (l'ancien `last_seen_at`) devient le repère de la nouvelle fenêtre.
        row.previous_seen_at = row.last_seen_at
      }
      // Toujours rafraîchir la présence pour garder la session en cours « vivante »
      // — sans ça, un long usage franchirait le seuil et se scinderait à tort.
      row.last_seen_at = now
      await this.lastSeen.save(row)

      return { since: row.previous_seen_at ? new Date(row.previous_seen_at).toISOString() : null }
    } catch (error) {
      this.logger.warn('Failed to mark last-seen — reporting no window rather than failing boot', { error })
      return { since: null }
    }
  }
}
