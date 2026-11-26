import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2836 — LE MANAGER CLIENT d'une mission (#2124.20 « Résumé affiche le manager
 * client »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le résumé des missions d'un compte demande « BM owner » ET « manager
 * client ». Le premier est `missions.owner_id` (notre chargé d'affaires) ; le
 * second — la personne, CHEZ LE CLIENT, qui encadre le consultant au
 * quotidien — n'avait NI colonne, NI formulaire, NI route. Le lire sans
 * l'écrire aurait fabriqué une colonne que personne ne remplit (cause racine
 * « correctif de lecture inerte ») : cette migration arrive AVEC son écrivain
 * (`PATCH /delivery/missions/:id/client-manager`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE COLONNE À PART, ET PAS `cra_contact_id` NI LE RÔLE D'ACHAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Qui VALIDE le relevé (`cra_contact_id`), qui DÉCIDE l'achat
 * (`orgDecisionRoleSchema`) et qui ENCADRE le consultant sont trois rôles qui
 * coïncident parfois, jamais par règle. Les confondre aurait affiché comme
 * manager quelqu'un qui n'a jamais eu ce rôle.
 *
 * Une référence vers `contacts` (et non un texte libre) pour la même raison
 * que `billing_contact_id` / `cra_contact_id` : une identité, un seul endroit.
 * `ON DELETE SET NULL` : supprimer le contact rend « non désigné », jamais une
 * mission cassée. Pas de CHECK : la seule valeur écrite est une clé étrangère
 * (GA-11/12 — la contrainte est la FK elle-même, posée avant tout écrivain).
 */
export class MissionClientManagerContact1796001525994 implements MigrationInterface {
  public name = 'MissionClientManagerContact1796001525994'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS client_manager_contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_missions_client_manager_contact_id ON missions (client_manager_contact_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_missions_client_manager_contact_id`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS client_manager_contact_id`)
  }
}
