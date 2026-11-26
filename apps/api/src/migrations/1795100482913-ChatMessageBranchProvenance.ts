import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1953.11 / #1953.22 — LA PROVENANCE D'UNE BRANCHE, AVANT LE CODE QUI L'ÉCRIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION (16/09/2026, SHA servi 4897da487)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Modifier ma demande » étiquetait la réponse abandonnée (« Réponse remplacée
 * à 15:05 — conservée pour mémoire ») et rejouait la demande à la suite. Après
 * un RECHARGEMENT COMPLET de la page : zéro élément du DOM portant « remplac ».
 * Les deux échanges se retrouvaient côte à côte, sans rien qui dise que le
 * second est une réédition du premier. La provenance était un état de SESSION
 * (`Chat.tsx`, `useState`), pas une donnée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **`chat_messages.superseded_at timestamptz NULL`** — quand CETTE réponse
 *     a été remplacée par une branche. `NULL` = elle ne l'a pas été, l'état de
 *     tout l'existant ; ce n'est pas un trou. C'est ce qui fait survivre au
 *     rechargement l'étiquette « conservée pour mémoire » — « on archive, on ne
 *     supprime pas » : la réponse remplacée reste lisible, avec sa marque.
 *  2. **`chat_messages.branch_of_message_id uuid NULL`** — la réponse dont
 *     CELLE-CI repart. `REFERENCES chat_messages(id) ON DELETE SET NULL` :
 *     effacer un fil ne fait pas échouer la suppression de l'autre, et le lien
 *     perdu ne prend jamais le message avec lui.
 *  3. **`chat_messages.branch_kind text NULL`** — la nature de la branche
 *     (`retry` / `angle` / `edit`), contrainte par `chat_messages_branch_kind_check`,
 *     NOMMÉE (GA-177) et couvrant exactement `CHAT_BRANCH_KINDS`
 *     (`@bellum/contracts`, GA-12). La contrainte est posée AVANT le code qui
 *     écrit ces valeurs (GA-11).
 *  4. **un index PARTIEL sur `branch_of_message_id`.** Pas pour la lecture du
 *     fil (elle se fait par espace + conversation) : pour le `ON DELETE SET
 *     NULL`, qui fait chercher, à chaque message effacé, les lignes qui le
 *     référencent. Sans index, l'effacement d'un compte (RGPD art. 17) balaierait
 *     `chat_messages` en entier, une fois par ligne. Partiel parce que la quasi-
 *     totalité des messages ne sont la réédition de rien.
 *
 * ⚠️ Additive seulement : aucune ligne existante n'est réécrite, aucune valeur
 * n'est retirée d'une contrainte.
 */
export class ChatMessageBranchProvenance1795100482913 implements MigrationInterface {
  public name = 'ChatMessageBranchProvenance1795100482913'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS superseded_at timestamptz
    `)
    await queryRunner.query(`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS branch_of_message_id uuid REFERENCES chat_messages(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      ALTER TABLE chat_messages
        ADD COLUMN IF NOT EXISTS branch_kind text
    `)
    await queryRunner.query(`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_branch_kind_check`)
    await queryRunner.query(`
      ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_branch_kind_check
        CHECK (branch_kind IS NULL OR branch_kind IN ('retry', 'angle', 'edit'))
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_branch_of_idx
        ON chat_messages (branch_of_message_id) WHERE branch_of_message_id IS NOT NULL
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN chat_messages.superseded_at IS
        'Quand cette reponse a ete REMPLACEE par une branche (#1953.22). NULL = elle ne l''a pas ete. On archive, on ne supprime pas : la reponse reste lisible avec sa marque, y compris apres un rechargement de page.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN chat_messages.branch_of_message_id IS
        'La reponse dont CELLE-CI repart (#1953.11). NULL = ce message n''est la reedition de rien. ON DELETE SET NULL : le lien se perd, jamais le message.'
    `)
    await queryRunner.query(`
      COMMENT ON COLUMN chat_messages.branch_kind IS
        'La nature de la branche : retry / angle / edit (CHAT_BRANCH_KINDS, @bellum/contracts). NULL = aucune branche.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS chat_messages_branch_of_idx`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_branch_kind_check`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS branch_kind`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS branch_of_message_id`)
    await queryRunner.query(`ALTER TABLE chat_messages DROP COLUMN IF EXISTS superseded_at`)
  }
}
