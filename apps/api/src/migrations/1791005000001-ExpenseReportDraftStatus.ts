import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `expense_reports` gagne l'état `draft` — le BROUILLON (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL N'EXISTAIT PAS, ET POURQUOI IL EXISTE MAINTENANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `1790970000001-ExpenseReports` s'en explique en toutes lettres : « un `draft`
 * que rien n'écrirait serait du code que personne n'appelle ; GA-08 permettra
 * de l'AJOUTER en fin de liste le jour où un chemin de brouillon existe ».
 * Ce lot-ci EST ce chemin — le dépôt d'une note, sa saisie ligne à ligne, sa
 * soumission. La condition posée par la migration précédente est donc remplie,
 * et la valeur s'ajoute EN FIN de l'énumération TypeScript (GA-08), la
 * contrainte élargie AVANT le code qui l'écrit (GA-11 / GA-12).
 *
 * ⚠️ Le `CHECK` est RE-DÉCLARÉ EN ENTIER, à partir de la DERNIÈRE liste en
 * vigueur et jamais d'une plus ancienne : une contrainte ne rétrécit pas
 * (GA-11), et repartir d'une déclaration périmée est la façon la plus discrète
 * de perdre une valeur écrite depuis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `submitted_at` DEVIENT NULLABLE — et c'est la vraie décision de ce fichier
 * ─────────────────────────────────────────────────────────────────────────────
 * Un brouillon n'a PAS été soumis. Laisser `submitted_at NOT NULL DEFAULT now()`
 * aurait rempli la colonne à la création, et l'écran aurait affiché une date de
 * dépôt sur une note que personne n'a déposée — une donnée fictive, au sens
 * strict : un fait faux, présenté comme mesuré, et opposable.
 *
 * `expense_reports_submitted_at_check` tient l'autre moitié : dès qu'une note
 * QUITTE le brouillon, elle porte sa date de dépôt. Sans cette contrainte, la
 * colonne serait simplement « parfois nulle », et l'écran devrait deviner si
 * l'absence veut dire « brouillon » ou « on a oublié de l'écrire ».
 *
 * ⚠️ La contrainte est posée en DEUX temps : le `UPDATE` d'abord, sur les
 * lignes déjà en base qui n'ont pas de date (il n'y en a aucune aujourd'hui —
 * la colonne était NOT NULL — mais une migration qui suppose l'état de la base
 * est une migration qui échoue le jour où elle a tort).
 */
export class ExpenseReportDraftStatus1791005000001 implements MigrationInterface {
  public name = 'ExpenseReportDraftStatus1791005000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_status_check`)
    await queryRunner.query(`
      ALTER TABLE expense_reports
        ADD CONSTRAINT expense_reports_status_check
        CHECK (status IN ('pending', 'validated', 'rejected', 'draft'))
    `)

    await queryRunner.query(`ALTER TABLE expense_reports ALTER COLUMN submitted_at DROP NOT NULL`)
    await queryRunner.query(`ALTER TABLE expense_reports ALTER COLUMN submitted_at DROP DEFAULT`)
    await queryRunner.query(`UPDATE expense_reports SET submitted_at = created_at WHERE submitted_at IS NULL`)
    await queryRunner.query(`
      ALTER TABLE expense_reports
        ADD CONSTRAINT expense_reports_submitted_at_check
        CHECK (status = 'draft' OR submitted_at IS NOT NULL)
    `)

    // La file du valideur lit « ce qui attend une décision » ; le déposant lit
    // « mes brouillons ». Sans cet index, le second filtre balaie la table.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS expense_reports_workspace_status_idx
        ON expense_reports (workspace_id, status)
    `)

    await queryRunner.query(`
      COMMENT ON COLUMN expense_reports.submitted_at IS
        'Date de DEPOT. NULL uniquement sur un brouillon (status = draft) : une note jamais soumise n''a pas de date de depot, et en inventer une serait une donnee fictive opposable. expense_reports_submitted_at_check tient l''autre moitie de la regle.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE expense_reports DROP CONSTRAINT IF EXISTS expense_reports_submitted_at_check`)
    await queryRunner.query(`DROP INDEX IF EXISTS expense_reports_workspace_status_idx`)
    // ⚠️ Le `CHECK` n'est PAS remis à trois valeurs : des brouillons peuvent
    // exister, et une contrainte qui rétrécit les rendrait illisibles. Un
    // `down` restaure ce qu'il peut, jamais ce qui casserait des lignes.
  }
}
