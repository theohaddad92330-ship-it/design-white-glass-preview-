import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2942, #2152.9 / #2152.10 — DEUX ÉTATS DE BESOIN DE PLUS : « Entretien » et
 * « Négociation », entre « en validation client » (`client_review`) et
 * « gagné » (`won`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le Pipe des besoins ne savait dire que « le client a le profil »
 * (`client_review`) — jamais « il fait passer un entretien » ni « il négocie
 * les conditions ». Le `negotiation` déjà présent ailleurs dans le dépôt est le
 * STADE d'une OPPORTUNITÉ (`opportunities.stage`, `PIPELINE_STAGES`) — une
 * maille différente, celle de l'affaire entière, pas celle d'UN besoin qu'on
 * staffe. Confondre les deux aurait posé un mot qui désigne deux choses (loi 4
 * du tome 7) sans même partager la colonne.
 *
 * Additif, comme la reprise du 27/08/2026 (`NeedWorkStatuses1789534912778`) :
 * la contrainte est élargie AVANT que le code n'écrive ces deux valeurs
 * (GA-11 / GA-12).
 *
 * ⚠️ INTÉGRATION 26/09/2026 — cette migration a été écrite en parallèle de
 * `NeedDetectedStatusAndContradictionFields1796321364217` (#2323.1, branche
 * différente) sans la connaître : sa liste d'origine repartait d'AVANT
 * `detected`, ce qui aurait RÉTRÉCI la contrainte (GA-11) une fois les deux
 * branches intégrées. `detected` est donc repris ici, à sa place dans
 * {@link PROJECT_NEED_STATUSES}, pour que cette migration reste un
 * SUR-ENSEMBLE de celle qui la précède.
 */
export class NeedInterviewNegotiationStatuses1796321398100 implements MigrationInterface {
  name = 'NeedInterviewNegotiationStatuses1796321398100'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN (
          'open','staffed','lost','cancelled','detected',
          'to_qualify','qualified','to_match','matching','shortlist_ready',
          'submitted','client_review','won','on_hold','to_reactivate',
          'interview','negotiation'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE project_needs SET status = 'client_review' WHERE status IN ('interview', 'negotiation')`,
    )
    await queryRunner.query(`ALTER TABLE project_needs DROP CONSTRAINT IF EXISTS project_needs_status_check`)
    await queryRunner.query(`
      ALTER TABLE project_needs ADD CONSTRAINT project_needs_status_check CHECK (
        status IN (
          'open','staffed','lost','cancelled','detected',
          'to_qualify','qualified','to_match','matching','shortlist_ready',
          'submitted','client_review','won','on_hold','to_reactivate'
        )
      )
    `)
  }
}
