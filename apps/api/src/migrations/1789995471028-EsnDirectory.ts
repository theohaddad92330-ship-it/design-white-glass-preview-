import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Le référentiel ESN — une table PARTAGÉE entre espaces (tome 4, D62).
 *
 * Deuxième table du dépôt sans `workspace_id`, après `skill_alias_library`, et
 * pour la même raison : enrichir 477 entités coûterait le même travail à chaque
 * espace, pour un résultat identique — c'est du registre public. Ce qui reste
 * privé vit ailleurs (`partner_relations`) : la relation, son étape, les
 * besoins reçus, les marges. **Aucune donnée commerciale n'entre ici.**
 *
 * Trois choix de schéma qui portent une décision produit :
 *
 * 1. **La clé n'est pas le SIREN** mais le nom normalisé. Une entrée non
 *    résolue doit vivre — le tome l'exige (« une entrée non résolue est
 *    conservée avec sa raison, jamais supprimée ») — et elle n'a pas de SIREN.
 * 2. **`open_to_subcontracting` vaut `inconnu` par défaut**, jamais `non` : un
 *    refus se déclare, il ne se déduit pas d'une absence de réponse.
 * 3. **`risk_flag` vaut `aucun` par défaut**, mais `risk_checked_at` reste NULL
 *    tant que personne n'a regardé — « aucun risque connu » et « on n'a pas
 *    vérifié » ne se lisent pas pareil, et seule la date les distingue.
 */
export class EsnDirectory1789995471028 implements MigrationInterface {
  name = 'EsnDirectory1789995471028'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS esn_directory (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        input_name text NOT NULL,
        normalized_name text NOT NULL UNIQUE,
        seed_source text,
        siren text UNIQUE,
        resolution_status text NOT NULL DEFAULT 'pending'
          CONSTRAINT esn_directory_resolution_status_check CHECK (resolution_status IN ('pending', 'resolving', 'resolved', 'ambiguous', 'foreign', 'unresolved')),
        resolution_reason text,
        legal_name text,
        naf_code text,
        created_on date,
        size_class text,
        headcount_range text,
        headcount_tranche text,
        headquarters_city text,
        headquarters_department text,
        establishment_count integer,
        establishments jsonb NOT NULL DEFAULT '[]'::jsonb,
        parent_siren text,
        parent_name text,
        relation_to_parent text
          CONSTRAINT esn_directory_relation_to_parent_check CHECK (relation_to_parent IS NULL OR relation_to_parent IN ('groupe', 'filiale', 'agence', 'marque', 'international')),
        hierarchy_confidence text
          CONSTRAINT esn_directory_hierarchy_confidence_check CHECK (hierarchy_confidence IS NULL OR hierarchy_confidence IN ('confirmed', 'inferred')),
        hierarchy_evidence text,
        domain text,
        domain_status text
          CONSTRAINT esn_directory_domain_status_check CHECK (domain_status IS NULL OR domain_status IN ('verified', 'unverified', 'invalid')),
        risk_flag text NOT NULL DEFAULT 'aucun'
          CONSTRAINT esn_directory_risk_flag_check CHECK (risk_flag IN ('aucun', 'vigilance', 'alerte')),
        risk_evidence text,
        risk_checked_at timestamptz,
        open_to_subcontracting text NOT NULL DEFAULT 'inconnu'
          CONSTRAINT esn_directory_open_to_subcontracting_check CHECK (open_to_subcontracting IN ('oui', 'non', 'inconnu')),
        subcontracting_confidence text
          CONSTRAINT esn_directory_subcontracting_confidence_check CHECK (subcontracting_confidence IS NULL OR subcontracting_confidence IN ('certain', 'probable', 'suppose')),
        subcontracting_evidence text,
        subcontracting_declared_at date,
        subcontracting_sources_count integer NOT NULL DEFAULT 0,
        hiring_90d jsonb,
        hiring_baseline jsonb,
        hiring_refreshed_at timestamptz,
        public_awards jsonb NOT NULL DEFAULT '[]'::jsonb,
        public_exposure text
          CONSTRAINT esn_directory_public_exposure_check CHECK (public_exposure IS NULL OR public_exposure IN ('forte', 'moyenne', 'nulle')),
        awards_refreshed_at timestamptz,
        resolved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    // La résolution par lots prend « les plus anciennes d'abord » : sans index,
    // ce balayage relit 477 lignes toutes les quinze minutes pour rien.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_esn_directory_pending
         ON esn_directory (resolution_status, created_at)`,
    )
    // L'écran Territoire lit « les ESN de ce département » : c'est la requête
    // la plus fréquente du tome, et elle porte sur le siège.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_esn_directory_department
         ON esn_directory (headquarters_department)`,
    )
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_esn_directory_parent ON esn_directory (parent_siren)`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS esn_directory`)
  }
}
