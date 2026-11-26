import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2439.10 (décision Louis 21/09/2026, QCM) — « OUBLIER » UNE MÉMOIRE ARCHIVE,
 * ELLE NE SUPPRIME PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉROGATION QUE CETTE COLONNE FERME
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine du dépôt dit : « on archive, on ne supprime pas — un fait périmé
 * redevient inconnu, il ne disparaît pas ». Un côté la respectait déjà : depuis
 * #2430.9 (20/09/2026), « effacer une conversation » pose `chat_messages.
 * archived_at` au lieu de détruire les messages.
 *
 * L'autre côté y dérogeait, et sans se réclamer de l'exception RGPD (c67, #2297,
 * la seule qui autorise une destruction réelle) : `MemoryService.unpinFact` et
 * `forgetLedgerEntry` faisaient trois DELETE SQL — un fait épinglé, un résumé de
 * conversation, une trace d'intervention. Le code écrivait même « un effacement
 * est irréversible » comme si c'était la règle.
 *
 * Les trois tables reçoivent donc la MÊME estampille que `chat_messages` : le
 * nom `archived_at`, la même sémantique (`NULL` = ligne vivante), et la lecture
 * qui cesse. Un seul mécanisme d'archivage dans le dépôt, pas un quatrième
 * (GA-26).
 *
 * NULLABLE, sans défaut : `NULL` est l'état de TOUTE ligne existante — rien
 * n'est archivé par cette migration, aucune lecture ne change de résultat au
 * déploiement. La colonne existe AVANT le code qui l'écrit (GA-11 / GA-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ L'INDEX UNIQUE PARTIEL DE `conversation_summaries` — LE PIÈGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `conversation_summaries_owner_uidx` (migration `1790700047318`) est UNIQUE et
 * PARTIEL : `WHERE superseded_at IS NULL`. Une ligne archivée reste donc, pour
 * cet index, la ligne VIVANTE de sa clé `(user_id, workspace_id,
 * conversation_id)`. Sans élargir son prédicat, le premier message écrit après
 * un oubli — `appendConversationTurn` ne voit plus la ligne archivée et en crée
 * une neuve — violerait l'unicité et remonterait en 500.
 *
 * L'index est donc recréé avec les DEUX conditions. Il reste partiel, il reste
 * unique : une seule ligne vivante par personne et par fil, exactement la
 * garantie que #1790700047318 avait posée.
 *
 * `CONCURRENTLY` n'est pas utilisable ici (TypeORM exécute les migrations dans
 * une transaction) : la table porte une ligne par personne et par fil, sa
 * reconstruction d'index est de l'ordre de la milliseconde.
 */
export class MemoryForgetArchives1795997101839 implements MigrationInterface {
  public name = 'MemoryForgetArchives1795997101839'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE conversation_summaries ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE laura_interventions ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL`)
    // L'unicité PARTIELLE doit compter les lignes VIVANTES, et une ligne
    // archivée n'en est plus une — voir le docblock.
    await queryRunner.query(`DROP INDEX IF EXISTS conversation_summaries_owner_uidx`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_owner_uidx
         ON conversation_summaries (user_id, workspace_id, conversation_id)
         WHERE superseded_at IS NULL AND archived_at IS NULL`,
    )
  }

  /**
   * Réversible, et dans l'ordre inverse : l'index revient à son prédicat d'avant
   * AVANT que la colonne qu'il cite ne parte, sans quoi le `DROP COLUMN`
   * échouerait sur une dépendance.
   *
   * ⚠️ Redescendre PERD l'information « cette mémoire a été oubliée » : les
   * lignes archivées redeviennent vivantes et ressortent dans les lectures. Ce
   * n'est acceptable que comme retour arrière immédiat d'un déploiement raté.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS conversation_summaries_owner_uidx`)
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS conversation_summaries_owner_uidx
         ON conversation_summaries (user_id, workspace_id, conversation_id)
         WHERE superseded_at IS NULL`,
    )
    await queryRunner.query(`ALTER TABLE laura_interventions DROP COLUMN IF EXISTS archived_at`)
    await queryRunner.query(`ALTER TABLE conversation_summaries DROP COLUMN IF EXISTS archived_at`)
    await queryRunner.query(`ALTER TABLE memory_pinned_facts DROP COLUMN IF EXISTS archived_at`)
  }
}
