import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Vivier de consultants — le substrat manquant du « push profil » (annexe méthodo
 * p22 « Sourcing, push profil et soutenance »).
 *
 * Le produit détectait un besoin (`opportunities`) sans savoir qui pouvait y
 * répondre : « pousser 1-2 profils » restait un libellé d'action inexécutable.
 * Cette table porte le vivier avec EXACTEMENT les champs que la p22 liste — dispo,
 * TJM, zone, CDI/freelance, stack, secteur, références, envie.
 *
 * Aucun backfill : un vivier ne se déduit d'aucune donnée existante (les
 * consultants d'une ESN ne sont écrits nulle part dans les analyses de comptes).
 * La table naît vide et se remplit à la main — c'est la seule vérité possible.
 *
 * RLS = défense en profondeur (l'API tourne en service role qui bypass) : une
 * ligne est visible aux membres de son workspace, avec repli sur `user_id` tant
 * que `workspace_id` peut être transitoirement NULL — même schéma que les autres
 * tables métier.
 */
export class Consultants1788013450112 implements MigrationInterface {
  public name = 'Consultants1788013450112'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS consultants (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   uuid,
        user_id        uuid NOT NULL,
        full_name      text NOT NULL,
        title          text,
        seniority      text NOT NULL DEFAULT 'inconnu'
          CHECK (seniority IN ('junior', 'confirme', 'senior', 'expert', 'inconnu')),
        availability   text NOT NULL DEFAULT 'inconnu'
          CHECK (availability IN ('immediate', 'sous_1_mois', 'sous_3_mois', 'indisponible', 'inconnu')),
        available_from date,
        contract_type  text NOT NULL DEFAULT 'inconnu'
          CHECK (contract_type IN ('cdi', 'freelance', 'portage', 'inconnu')),
        tjm            integer CHECK (tjm IS NULL OR tjm > 0),
        stack          text[] NOT NULL DEFAULT '{}',
        sectors        text[] NOT NULL DEFAULT '{}',
        zones          text[] NOT NULL DEFAULT '{}',
        "references"   text[] NOT NULL DEFAULT '{}',
        wants          text,
        notes          text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    `)

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_workspace_idx ON consultants (workspace_id)
    `)
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_user_idx ON consultants (user_id)
    `)
    // Disponibilité = le filtre le plus fréquent (« qui est libre maintenant ? »).
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS consultants_availability_idx ON consultants (workspace_id, availability)
    `)

    await queryRunner.query(`ALTER TABLE consultants ENABLE ROW LEVEL SECURITY`)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'consultants'
            AND policyname = 'Members can read their workspace consultants'
        ) THEN
          CREATE POLICY "Members can read their workspace consultants"
            ON consultants
            FOR SELECT
            USING (
              user_id = auth.uid()
              OR workspace_id IN (
                SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
              )
            );
        END IF;
      END $$;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS consultants`)
  }
}
