import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2424.4 — LA RÉFÉRENCE EXTERNE, les trois éléments qui manquaient sur les
 * huit demandés. Cinq tenaient déjà : autorisation (`citation_allowed`),
 * périmètre (`scope`), formulation (`claim`/`detail`), anonymisation
 * (`anonymised`), chiffres (`result`/`strength`).
 *
 * `allowed_channels` — tranché sans Louis (doctrine §3c, voir le commentaire
 * de `PROOF_CHANNELS` côté contrat) faute de la liste exacte du document
 * source : email, oral, support commercial, site web, étude de cas publiée,
 * réseaux sociaux.
 *
 * `valid_until` et `validity_duration_months` restent deux colonnes
 * distinctes : la durée est ce que le client a ACCORDÉ, l'échéance est la
 * date qui en découle — une correction humaine peut changer l'une sans
 * l'autre.
 *
 * Additive uniquement (GA-11 / GA-12) : `proofs_allowed_channels_check` naît
 * AVEC sa colonne.
 */
export class ProofExternalReferenceFields1796000497241 implements MigrationInterface {
  name = 'ProofExternalReferenceFields1796000497241'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS allowed_channels text[] NOT NULL DEFAULT '{}'`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS validity_duration_months integer`)
    await queryRunner.query(`ALTER TABLE proofs ADD COLUMN IF NOT EXISTS valid_until timestamptz`)
    await queryRunner.query(`
      ALTER TABLE proofs ADD CONSTRAINT proofs_allowed_channels_check CHECK (
        allowed_channels <@ ARRAY['email','oral','support_commercial','site_web','etude_de_cas','reseaux_sociaux']::text[]
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE proofs DROP CONSTRAINT IF EXISTS proofs_allowed_channels_check`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS valid_until`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS validity_duration_months`)
    await queryRunner.query(`ALTER TABLE proofs DROP COLUMN IF EXISTS allowed_channels`)
  }
}
