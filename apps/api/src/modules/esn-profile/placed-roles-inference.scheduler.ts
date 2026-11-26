import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { PLACED_ROLES_INFERENCE_BATCH, PlacedRolesInferenceService } from './placed-roles-inference.service'

/**
 * Métiers placés DÉDUITS — LE RATTRAPAGE (décision Louis 11/10/2026, doctrine
 * « un correctif de collecte rattrape l'existant »).
 *
 * - **ciblé** : profils d'entreprise sans métier déclaré, jamais déduits ou
 *   dont le vivier / les missions ont bougé (import de CV, mission gagnée) ;
 * - **par petit lot** : `PLACED_ROLES_INFERENCE_BATCH` profils par passage ;
 * - **sans collecte** : seule la déduction tourne (lecture de base), aucune
 *   source externe n'est rappelée, aucune analyse rejouée ;
 * - **sans geste au déploiement** : un cron, rien au démarrage.
 *
 * Toutes les heures à :23 — le recalcul suit donc un import de CV dans
 * l'heure ; l'écran « Mon profil » recalcule aussi à la lecture.
 *
 * **SANS VERROU :** idempotent — deux replicas sur le même profil écrivent la
 * même déduction.
 */
@Injectable()
export class PlacedRolesInferenceScheduler {
  private readonly logger = new Logger(PlacedRolesInferenceScheduler.name)

  constructor(private readonly inference: PlacedRolesInferenceService) {}

  @Cron('23 * * * *', { name: 'placed-roles-inference-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:placed-roles-inference.runSweep')
  async runSweep(): Promise<void> {
    try {
      const done = await this.inference.sweep(PLACED_ROLES_INFERENCE_BATCH)
      // Écrit même quand il n'y a rien à faire : un silence ne se lit pas comme une panne.
      this.logger.log(`Métiers placés déduits : ${done} profil(s) recalculé(s)`)
    } catch (error) {
      this.logger.error('Rattrapage des métiers placés déduits en échec — repris au passage suivant', { error })
    }
  }
}
