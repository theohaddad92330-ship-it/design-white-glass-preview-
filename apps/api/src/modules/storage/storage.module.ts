import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { SupabaseModule } from '../../supabase/supabase.module'
import { StorageObjectEntity } from '../../database/entities/storage-object.entity'
import { StorageClient } from './storage.client'
import { StorageRetentionScheduler } from './storage-retention.scheduler'
import { StorageService } from './storage.service'

/**
 * LE STOCKAGE DE FICHIERS — le module (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IL N'A PAS DE CONTRÔLEUR, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'y a pas de route `/storage/:id`. Un fichier s'ouvre TOUJOURS par la
 * porte de son objet parent — la note de frais, le document du besoin — parce
 * que c'est le parent qui porte le droit de lecture. Une porte générique aurait
 * eu deux effets, tous deux mauvais : elle aurait dupliqué la vérification de
 * droit (donc permis qu'elle diverge), et elle aurait rendu un identifiant
 * d'objet suffisant pour tenter sa chance — ce que le cloisonnement par chemin
 * est précisément fait pour empêcher.
 *
 * Conséquence pratique : les consommateurs importent CE module et injectent
 * `StorageService` **dans leur contrôleur**, qui a déjà tranché le droit.
 *
 * `StorageClient` est exporté à part, pour le seul semis de la salle de
 * démonstration : il écrit ses lignes en SQL comme il le fait pour toutes les
 * tables, et n'a besoin que de déposer les octets.
 *
 * Retirer ce module ne casse rien d'autre au sens de la craft rule n°7 : les
 * deux domaines qui l'utilisent retombent sur l'état d'avant ce lot — une pièce
 * RÉFÉRENCÉE sans octets, que l'écran sait déjà dire.
 */
@Module({
  /**
   * ⚠️ `SupabaseModule` est OBLIGATOIRE ici, et son absence n'a pas été vue par
   * la suite ciblée du lot : `StorageClient` injecte `SupabaseService`, qui
   * n'est PAS global. Le module compilait tant qu'on ne l'instanciait pas —
   * c'est `analysis.module.spec.ts`, qui monte le graphe complet, qui a dit
   * NON à l'intégration : « Nest can't resolve dependencies of the
   * StorageClient (?) ».
   *
   * La leçon vaut au-delà de ce fichier : un module neuf ne se prouve pas par
   * les tests de son propre dossier. Ce sont les gardes de graphe de modules
   * qui l'attrapent, et elles ne tournent qu'au balayage complet.
   */
  imports: [TypeOrmModule.forFeature([StorageObjectEntity]), SupabaseModule],
  providers: [StorageClient, StorageService, StorageRetentionScheduler],
  exports: [StorageService, StorageClient],
})
export class StorageModule {}
