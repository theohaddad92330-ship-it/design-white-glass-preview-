import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * L'assistant de création d'un besoin en quatre étapes (04-kanban-besoins.png,
 * 08-creer-un-besoin.png) démêle deux axes que `NEED_SOURCES` mélangeait déjà
 * (`project.ts`, voir le commentaire de `NEED_ORIGINS`) : l'ORIGINE (entrant,
 * sortant, appel d'offres, apport d'affaires) et le CANAL (direct, partenaire,
 * portage). Deux colonnes ADDITIVES, jamais dérivées de `source` — ni l'inverse.
 *
 * `required_certifications` répond à un troisième manque nommé par la source :
 * les certifications obligatoires existent côté PARSING de CV (`CV_DETECTIONS`,
 * `cv-parsing.ts`), jamais comme EXIGENCE d'un besoin.
 *
 * Les trois colonnes sont NULLABLE / à défaut vide : un besoin déjà en base
 * n'a ni origine, ni canal, ni certification connus, et « non renseigné » est
 * une réponse honnête — jamais un défaut deviné.
 */
export class NeedOriginChannelCertifications1790975000001 implements MigrationInterface {
  name = 'NeedOriginChannelCertifications1790975000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE project_needs
        ADD COLUMN IF NOT EXISTS origin text,
        ADD COLUMN IF NOT EXISTS channel text,
        ADD COLUMN IF NOT EXISTS required_certifications jsonb NOT NULL DEFAULT '[]'::jsonb
    `)

    // Additif dès la première version : rien à élargir plus tard pour ces
    // quatre/trois valeurs tant qu'aucune n'est retirée (GA-08, GA-11/GA-12).
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_origin_check CHECK (
        origin IS NULL OR origin IN ('entrant','sortant','appel_offres','apport_affaires')
      )
    `)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_channel_check CHECK (
        channel IS NULL OR channel IN ('direct','partenaire','portage')
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_origin_check`)
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_channel_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs
        DROP COLUMN IF EXISTS origin,
        DROP COLUMN IF EXISTS channel,
        DROP COLUMN IF EXISTS required_certifications
    `)
  }
}
