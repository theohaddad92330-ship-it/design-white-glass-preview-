import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { ChatMessagesService } from './chat-messages.service'

/**
 * Combien de messages sont ARCHIVÉS par passage. Même raison que les autres
 * balayages du dépôt (`StorageService.purgeExpired`, `RagThreadOrphanPurgeScheduler`) :
 * un plafond met plusieurs nuits à rattraper un arriéré — ici le coût d'un
 * doublon est nul de toute façon, puisque rien n'est jamais effacé.
 */
const ARCHIVE_BATCH = 500

/**
 * L'interrupteur d'arrêt. **Seule** lecture autorisée de cette capacité
 * (GA-84) — la variable ne se lit que dans le registre.
 */
export function chatImageVisionArchiveDisabled(): boolean {
  return killSwitchCut('chat.image_vision_archive')
}

/**
 * #2876 (décision Louis 14/10) — LE BALAYAGE NOCTURNE QUI ARCHIVE LES ZONES
 * VISION EXPIRÉES.
 *
 * ⚠️ Ce n'est PAS une purge : rien n'est jamais effacé. `ChatMessagesService.archiveExpiredImageVision`
 * pose `image_vision_archived_at` sur la ligne, qui garde tout — « on
 * archive, on ne supprime pas » (agent_docs/doctrine.md). Coupé, les zones
 * restent lisibles au-delà de leur rétention ; ce n'est pas une panne, c'est
 * l'état d'avant ce lot.
 *
 * **SANS VERROU :** idempotent par construction — `image_vision_archived_at
 * IS NULL` exclut ce qu'un passage concurrent vient de poser, et l'archivage tient en
 * une seule instruction SQL, atomique.
 */
@Injectable()
export class ChatImageVisionArchiveScheduler {
  private readonly logger = new Logger(ChatImageVisionArchiveScheduler.name)

  constructor(private readonly messages: ChatMessagesService) {}

  /** 04:05 chaque nuit — à l'écart de 03:41 (fichiers échus) et 03:53 (pièces sans conversation). */
  @Cron('5 4 * * *', { name: 'chat-image-vision-archive', timeZone: 'Europe/Paris' })
  @Correlated('cron:chat-image-vision-archive.sweep')
  async sweep(): Promise<void> {
    if (chatImageVisionArchiveDisabled()) {
      this.logger.log('Archivage des zones vision de chat : capacité coupée, aucune zone n’est archivée.')
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    const { archived } = await this.messages.archiveExpiredImageVision(today, ARCHIVE_BATCH)
    // Zéro archivé est un RÉSULTAT, pas un silence.
    this.logger.log(`Archivage des zones vision de chat : ${archived} message(s) sur un plafond de ${ARCHIVE_BATCH}.`)
  }
}
