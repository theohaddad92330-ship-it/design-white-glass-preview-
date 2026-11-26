import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Correlated } from '../../correlation-id/background-correlation'
import { StockSnapshotService } from './stock-snapshot.service'
import { killSwitchCut } from '../../common/kill-switches'

/** Break-glass : `STOCK_SNAPSHOT_DISABLED=true` gèle la photo mensuelle.
 *  Même posture que les autres balayages du dépôt — ON par défaut, la variable
 *  ne fait qu'ÉTEINDRE. */
export function stockSnapshotDisabled(): boolean {
  return killSwitchCut('pilotage.stock_snapshot')
}

/**
 * Le balayage mensuel qui photographie les stocks (D2 · 26/08, D49 · 26/08).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE 1er À 03:00, ET LA LIGNE PORTE LA VEILLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le mois vient de se terminer : c'est le seul moment où l'état courant EST
 * l'état de fin de mois. Une heure plus tard, un commercial saisit une adresse
 * et la photo de février contient déjà du mars.
 *
 * 03:00 — avant la rétention RGPD (04:17) et la purge RAG (04:40, le 3), et
 * loin des rapports du matin. Un balayage qui LIT ne doit pas se glisser après
 * un balayage qui EFFACE.
 *
 * La ligne est datée du DERNIER jour du mois écoulé, jamais du 1er : c'est ce
 * qui rend « vs mois précédent » littéralement vrai pendant tout le mois qui
 * suit. Le calcul vit dans `previousMonthLastDay` (contrats), à un seul
 * endroit, et il est dérivé de `now()` — donc un rattrapage lancé le 5 écrit la
 * MÊME ligne que le passage du 1er, et l'index unique la refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCE — UNE SEULE COUCHE, ET C'EST LA BONNE
 * ─────────────────────────────────────────────────────────────────────────────
 * **SANS VERROU :** le tick part sur CHAQUE replica, et l'index unique
 * `(workspace_id, taken_on, metric_key)` avec son `ON CONFLICT DO NOTHING` rend
 * le second passage sans effet — l'écriture est idempotente par CONSTRUCTION, et
 * elle ne coûte rien d'autre qu'une lecture de base (aucun appel externe payant,
 * à la différence de la veille territoriale, qui elle prend un verrou pour cette
 * raison exacte). Un verrou ne protégerait donc de rien d'autre qu'une ligne de
 * journal en double, au prix d'une dépendance Redis et d'un import de service
 * entre modules — la seule dette d'architecture que le dépôt tient au plafond
 * (GA-07). Tenu par GA-76.
 *
 * ⚠️ Aucun `jobId` déterministe non plus, et c'est délibéré : le dépôt a déjà
 * payé ce piège (une clé `(accountId, jobId)` confondait deux exécutions du
 * même espace). Le balayage n'entre pas dans une file — il écrit directement,
 * sous une contrainte de base qui, elle, ne se trompe pas de mois.
 */
@Injectable()
export class StockSnapshotScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(StockSnapshotScheduler.name)

  constructor(private readonly snapshots: StockSnapshotService) {}

  @Cron('0 3 1 * *', { name: 'stock-snapshot', timeZone: 'Europe/Paris' })
  @Correlated('cron:stock-snapshot.runMonthlySnapshot')
  async runMonthlySnapshot(): Promise<void> {
    if (stockSnapshotDisabled()) {
      this.logger.log('Photo mensuelle des stocks désactivée (STOCK_SNAPSHOT_DISABLED=true) — rien ne sera écrit')
      return
    }
    try {
      const { workspaces, rows } = await this.snapshots.snapshotAllWorkspaces()
      // Journalisé même à zéro : un silence ne doit pas se lire comme une panne
      // du balayage.
      this.logger.log(`Photo mensuelle des stocks : ${rows} valeur(s) sur ${workspaces} espace(s)`)
    } catch (error) {
      // Aucune reprise à tenter : le mois écoulé ne reviendra pas, et une
      // relance manuelle écrira exactement la même ligne.
      this.logger.error('Photo mensuelle des stocks en échec', { error })
    }
  }

  /**
   * #3415 — le rattrapage : chaque jour du 2 au 5, 03:40, et à chaque démarrage (un
   * déploiement qui tombe sur le 1er à 03:00 est la cause constatée). Idempotent par clé,
   * sans verrou pour la même raison que le passage du 1er ; hors des 5 premiers jours,
   * le service ne lit rien (`catchUpLastMonth`).
   */
  @Cron('40 3 2-5 * *', { name: 'stock-snapshot-catch-up', timeZone: 'Europe/Paris' })
  @Correlated('cron:stock-snapshot.runCatchUp')
  async runCatchUp(): Promise<void> {
    if (stockSnapshotDisabled()) return
    try {
      const result = await this.snapshots.catchUpLastMonth()
      if (result) this.logger.log(`Rattrapage de la photo mensuelle : ${result.rows} valeur(s) ajoutée(s)`)
    } catch (error) {
      this.logger.error('Rattrapage de la photo mensuelle en échec', { error })
    }
  }

  /** Au démarrage : sans bloquer le boot (la lecture des stocks de chaque espace prend son temps). */
  onApplicationBootstrap(): void {
    void this.runCatchUp()
  }
}
