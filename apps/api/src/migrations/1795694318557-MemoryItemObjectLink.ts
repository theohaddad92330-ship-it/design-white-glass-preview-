import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2260.7 — L'OBJET VISÉ PAR UN ÉLÉMENT DE MÉMOIRE : contact, besoin,
 * consultant, mission.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE MIGRATION AJOUTE, ET CE QU'ELLE N'AJOUTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesure du 17/09/2026 : `memory_pinned_facts` ne portait que `account_id`
 * comme lien d'objet (migration `1784900700000-LongMemory`) — le DOSSIER
 * auquel l'élément est ATTACHÉ. Rien ne désignait un OBJET précis à
 * l'intérieur : un contact, un besoin (`project_needs`), un consultant du
 * vivier, une mission. Le lot précédent (#2260, LAU-FINAL-005) s'est arrêté
 * là par manque de budget.
 *
 * Quatre colonnes `uuid` NULLABLES, une par type — PAS un couple
 * `(object_type text, object_id uuid)`. Une colonne texte contrainte par un
 * `CHECK … IN (…)` aurait exigé d'enregistrer cette contrainte dans
 * `check-constraints-cover-enums.spec.ts` (GA-12) alors que la vraie règle
 * n'est pas « quelles valeurs », c'est « combien à la fois » — la forme
 * `conversation_id` / `business_unit_id` de `1795204871293` fait déjà ce choix
 * pour la même raison, et ce lot le reprend.
 *
 * ⚠️ AUCUNE clé étrangère : ni `account_id`, ni `business_unit_id` n'en
 * portent dans cette table (convention du dépôt — l'intégrité vit côté
 * application, `MemoryService` résout et filtre par `workspace_id`). En
 * ajouter une ici romprait cette convention sans qu'aucune autre colonne de la
 * table ne la tienne.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, QUI EST LA SEULE CHOSE QUI NE SE RATTRAPE PAS (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * La contrainte « au plus un objet à la fois » est posée AVANT que
 * `MemoryService.pinFact` (prochain commit) n'écrive dans ces colonnes.
 * `migration:run:prod` est le `preDeployCommand` de Railway — un
 * `ADD CONSTRAINT` qui échoue abandonne le déploiement sans qu'aucune requête
 * applicative n'ait pu insérer une ligne qui la viole.
 *
 * `DROP CONSTRAINT IF EXISTS` puis `ADD` : une contrainte ne se remplace pas
 * en place. Additive et idempotente : `ADD COLUMN IF NOT EXISTS` sans défaut
 * ni `NOT NULL` — aucune ligne existante n'est réécrite, aucun backfill,
 * aucun lien changé en silence. `down` non supporté (convention du dépôt).
 */
export class MemoryItemObjectLink1795694318557 implements MigrationInterface {
  public name = 'MemoryItemObjectLink1795694318557'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD COLUMN IF NOT EXISTS contact_id uuid,
        ADD COLUMN IF NOT EXISTS need_id uuid,
        ADD COLUMN IF NOT EXISTS consultant_id uuid,
        ADD COLUMN IF NOT EXISTS mission_id uuid
    `)

    // Un élément vise AU PLUS UN objet, jamais deux colonnes renseignées à la
    // fois : la somme des colonnes non nulles ne dépasse pas 1. Une valeur
    // ABSENTE des quatre reste parfaitement valide — « aucun objet visé »,
    // le comportement historique.
    await queryRunner.query(
      `ALTER TABLE memory_pinned_facts DROP CONSTRAINT IF EXISTS memory_pinned_facts_object_single_check`,
    )
    await queryRunner.query(`
      ALTER TABLE memory_pinned_facts
        ADD CONSTRAINT memory_pinned_facts_object_single_check
        CHECK (
          (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN need_id IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN consultant_id IS NOT NULL THEN 1 ELSE 0 END
         + CASE WHEN mission_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
        )
    `)

    // Quatre index PARTIELS, légers : seules les lignes qui visent CE type en
    // portent une entrée — la même forme que les index de portée d'équipe et
    // de fil posés par `1795204871293`.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_contact_idx
        ON memory_pinned_facts (workspace_id, contact_id)
        WHERE contact_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_need_idx
        ON memory_pinned_facts (workspace_id, need_id)
        WHERE need_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_consultant_idx
        ON memory_pinned_facts (workspace_id, consultant_id)
        WHERE consultant_id IS NOT NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS memory_pinned_facts_mission_idx
        ON memory_pinned_facts (workspace_id, mission_id)
        WHERE mission_id IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
