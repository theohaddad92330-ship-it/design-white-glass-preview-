import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3989.7 — Décision Louis 15/10/2026 : une coordonnée PRO (e-mail, téléphone)
 * déjà trouvée dans un autre espace est RÉUTILISÉE dans un nouvel espace — la
 * donnée seule. Posée ICI avant le code qui l'écrit (GA-11 / GA-12).
 *
 *  · `shared_person_coordinates` — une ligne par fait NOMMÉ de la base commune
 *    (`fact_id` → `shared_company_people`, `ON DELETE CASCADE`) : l'effacement
 *    RGPD d'une personne (c67), qui supprime sa ligne commune, emporte ses
 *    coordonnées, et son empreinte empêche leur retour.
 *  · Aucune colonne de portée (jamais l'espace qui a trouvé), ni note, ni
 *    statut, ni coût, ni fournisseur — GA-43 relit cette table.
 *  · Au moins une des deux coordonnées ; un e-mail a la forme d'une adresse.
 *
 * Contraintes NOMMÉES (GA-177). RLS activée sans politique : seul le service lit.
 */
export class SharedPersonCoordinates1796546100000 implements MigrationInterface {
  public name = 'SharedPersonCoordinates1796546100000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS shared_person_coordinates (
        fact_id uuid PRIMARY KEY,
        email text NULL,
        phone text NULL,
        first_shared_at timestamptz NOT NULL DEFAULT now(),
        last_seen_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT shared_person_coordinates_fact_fk FOREIGN KEY (fact_id) REFERENCES shared_company_people (id) ON DELETE CASCADE,
        CONSTRAINT shared_person_coordinates_present_check CHECK (email IS NOT NULL OR phone IS NOT NULL),
        CONSTRAINT shared_person_coordinates_email_check CHECK (email IS NULL OR email ~ '^[^\\s@]+@[^\\s@]+\\.[a-z]{2,}$')
      )
    `)
    await queryRunner.query(`ALTER TABLE shared_person_coordinates ENABLE ROW LEVEL SECURITY`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS shared_person_coordinates`)
  }
}
