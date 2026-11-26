import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { killSwitchCut } from '../../common/kill-switches'
import { StorageService } from './storage.service'

/**
 * Combien de fichiers échus partent PAR PASSAGE.
 *
 * Le plafond n'est pas là pour ménager la base — il est là pour qu'aucune
 * instruction de ce dépôt ne soit une suppression de masse. Un balayage
 * quotidien borné met plusieurs jours à rattraper un arriéré, et c'est
 * exactement ce qu'on veut d'un geste irréversible : une fenêtre pendant
 * laquelle on peut encore l'arrêter.
 */
const PURGE_BATCH = 500

/**
 * L'interrupteur d'arrêt de la purge. **Seule** lecture autorisée de cette
 * capacité (GA-84) — la variable elle-même ne se lit que dans le registre.
 */
export function storageRetentionPurgeDisabled(): boolean {
  return killSwitchCut('storage.retention_purge')
}

/**
 * LA PURGE DES FICHIERS ÉCHUS — la contrepartie de la conservation datée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une échéance de conservation qui n'est jamais appliquée n'est pas une
 * échéance, c'est une phrase. Chaque objet porte la sienne, calculée UNE fois
 * au dépôt avec la règle en vigueur ce jour-là ; ce balayage est ce qui la rend
 * vraie. Sans lui, le produit conserverait indéfiniment des pièces
 * comptables et des documents commerciaux dont la finalité a expiré — ce que
 * l'art. 5-1-e du RGPD ne laisse pas faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * **SANS VERROU :** le tick part sur CHAQUE replica, et c'est sans conséquence
 * parce que le geste est idempotent par CONSTRUCTION. Deux passages concurrents
 * lisent la même fenêtre échue, effacent les mêmes octets (effacer un objet
 * déjà absent est un no-op côté magasin, et ce client ne lève pas dessus) puis
 * effacent les mêmes lignes par `DELETE … WHERE id = ANY(…)`, qui ne rend rien
 * la seconde fois. Le seul coût d'un doublon est une ligne de journal en trop.
 * Un verrou aurait, lui, un coût réel : il ferait dépendre l'application d'une
 * échéance légale de la disponibilité de Redis, et une purge qui ne tourne pas
 * ne se remarque pas — c'est précisément le défaut que le registre des
 * interrupteurs a été écrit pour rendre visible.
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class StorageRetentionScheduler {
  private readonly logger = new Logger(StorageRetentionScheduler.name)

  constructor(private readonly storage: StorageService) {}

  /**
   * 03:41, tous les jours — décalé du balayage RGPD de 04:17 exprès : deux
   * purges qui partent à la même minute rendent illisible celle des deux qui a
   * ralenti la base.
   */
  @Cron('41 3 * * *')
  @Correlated('cron:storage-retention.sweep')
  async sweep(): Promise<void> {
    if (storageRetentionPurgeDisabled()) {
      // ⚠️ Un interrupteur éteint n'est PAS une panne : il a été éteint exprès.
      // On le DIT, on ne le compte pas comme une erreur.
      this.logger.log('Purge de rétention des fichiers : capacité coupée, aucun fichier n’est effacé.')
      return
    }
    // `today` est calculé ICI et passé en paramètre : la dérivation d'échéance
    // reste une fonction pure, donc rejouable à l'identique dans un test.
    const today = new Date().toISOString().slice(0, 10)
    const { removed } = await this.storage.purgeExpired(today, PURGE_BATCH)
    // ⚠️ Zéro fichier effacé est un RÉSULTAT, pas un silence : il dit que rien
    // n'était échu ce jour-là. Ne rien journaliser rendrait indistinguables
    // « rien à faire » et « le balayage n'a pas tourné ».
    this.logger.log(`Purge de rétention des fichiers : ${removed} effacé(s) sur un plafond de ${PURGE_BATCH}.`)
    // #3803 (3803.1) — l'original d'un document vit autant que lui : ceux
    // qu'aucun document ne porte plus partent ici, sous le MÊME interrupteur.
    const orphans = await this.storage.purgeOrphanRagDocumentSources(PURGE_BATCH)
    this.logger.log(`Originaux de documents sans document : ${orphans.removed} effacé(s).`)
  }
}
