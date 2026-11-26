import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1918.1 — LA PORTÉE « MOI UNIQUEMENT » D'UN ÉLÉMENT DE MÉMOIRE.
 *
 * Constat du 12/09/2026 : tout élément épinglé était lu par TOUT l'espace —
 * `MemoryService.listFacts` ne filtrait que sur `workspace_id`, et cette
 * lecture nourrit à la fois l'écran de mémoire de chaque membre et le contexte
 * envoyé au modèle quand n'importe quel membre parle à Laura. Un objectif
 * personnel devenait donc, par construction, une règle de toute l'ESN
 * (#1918.6).
 *
 * Décision de Louis (12/09) : « nature + portée perso ». Une colonne :
 *
 * - `scope` — `user` (la personne qui l'a épinglé, et elle seule) |
 *             `workspace` (tout l'espace).
 *
 * ⚠️ Défaut `workspace`, et ce n'est pas un réglage produit : c'est ce que
 * CHAQUE ligne existante était. Un défaut `user` rendrait privées en silence les
 * règles qu'une équipe lit aujourd'hui — une visibilité changée sans que
 * personne l'ait décidé, dans l'autre sens. Le défaut « moi » de la décision est
 * celui que les ÉCRANS proposent à l'épinglage (`defaultMemoryScope`), pas celui
 * de la base.
 *
 * Le PROPRIÉTAIRE n'a pas de colonne neuve : c'est `user_id`, NOT NULL, clé
 * étrangère vers `auth.users`, estampillé depuis le jeton depuis la création de
 * la table (`1784900700000`). Deux colonnes pour dire « à qui est cette ligne »
 * divergeraient au premier chemin d'écriture qui n'en remplit qu'une.
 *
 * Additive + idempotente : `ADD COLUMN IF NOT EXISTS` avec une valeur par défaut
 * constante (aucune réécriture de table depuis Postgres 11), contrainte créée
 * sous garde `pg_constraint`. AUCUN backfill : l'existant garde exactement la
 * visibilité qu'il avait. La contrainte connaît les deux valeurs AVANT que le
 * code n'en écrive une (GA-11 / GA-12) — la migration passe en pré-déploiement.
 */
export class MemoryPinnedFactScope1792800070000 implements MigrationInterface {
  public name = 'MemoryPinnedFactScope1792800070000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE memory_pinned_facts ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'workspace'`,
    )

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'memory_pinned_facts_scope_check'
        ) THEN
          ALTER TABLE memory_pinned_facts
            ADD CONSTRAINT memory_pinned_facts_scope_check
            CHECK (scope IN ('user', 'workspace'));
        END IF;
      END $$;
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
