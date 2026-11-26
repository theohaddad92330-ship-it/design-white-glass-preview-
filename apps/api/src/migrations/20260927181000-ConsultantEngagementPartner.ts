import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2948 (#2329.28) — `partenaire` rejoint `engagement_kind`, contrainte SQL
 * ÉLARGIE avant tout code qui l'écrit (GA-11/GA-12).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE `partenaire` DÉSIGNE, ET CE QU'IL NE DÉSIGNE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `sous_traitance` + `partner_account_id` couvrait déjà « le partenaire qui
 * PORTE un sous-traitant » — un tiers responsable devant le client pour QUELQU'UN
 * D'AUTRE. `partenaire` est différent : la personne EST elle-même l'entité
 * partenaire (un principal d'une société partenaire qui exécute directement),
 * sans qu'un `partner_account_id` distinct ait de sens — on ne se porte pas
 * soi-même. C'est pourquoi `engagementNeedsPartner` (`consultant.ts`) n'est PAS
 * étendu à `partenaire` : cette valeur reste `false` pour cette nature.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE LOT LA POSE (tranché sans Louis, revient sur le report du lot 32)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le lot du 26/09 avait reporté l'ajout par crainte de coupler l'énum au calcul
 * financier. Vérifié ce lot : `trueDailyCostCents`/`intermediationCost`
 * (`packages/contracts/src/schemas/staffing.ts`) lisent `MissionChannel`
 * ('direct'/'partner'/'subcontracting'/'portage'), jamais `engagement_kind` —
 * ce sont deux taxonomies distinctes (l'une sur la PERSONNE, l'autre sur la
 * MISSION). Le seul embranchement réel sur `engagement_kind` pour le TJM
 * d'achat (`talent.service.ts:871`) est un `=== 'salarie' ? coût : achat` — un
 * ELSE, pas une liste fermée : `partenaire` y tombe déjà côté achat, sans
 * modification. Rien à sécuriser côté calcul.
 */
export class ConsultantEngagementPartner20260927181000 implements MigrationInterface {
  name = 'ConsultantEngagementPartner20260927181000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_engagement_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_engagement_check
        CHECK (engagement_kind IN ('salarie', 'freelance', 'portage', 'sous_traitance', 'partenaire', 'inconnu'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP CONSTRAINT IF EXISTS consultants_engagement_check`)
    await queryRunner.query(`
      ALTER TABLE consultants ADD CONSTRAINT consultants_engagement_check
        CHECK (engagement_kind IN ('salarie', 'freelance', 'portage', 'sous_traitance', 'inconnu'))
    `)
  }
}
