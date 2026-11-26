import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Rejeter un relevé d'activité, avec un motif — et le motif est OBLIGATOIRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Un relevé pouvait être validé, contesté, attendu, manquant — jamais REJETÉ.
 * Le geste ordinaire du 5 du mois (« ces jours ne correspondent pas, redépose »)
 * n'avait aucun état : on remettait la ligne en `draft` à la main, sans trace,
 * et personne ne savait trois mois plus tard pourquoi ce mois avait fait un
 * aller-retour. C'est le même trou que « annuler un facturé » avait avant son
 * motif obligatoire — « sans lui personne ne saura dans six mois pourquoi ce
 * mois n'a jamais été encaissé ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE : LA CONTRAINTE D'ABORD, LE CODE ENSUITE
 * ─────────────────────────────────────────────────────────────────────────────
 * La leçon `account_vocabulary.kind` s'applique mot pour mot (GA-11 / GA-12) :
 * la valeur `rejected` entre dans la contrainte AVANT que le service ne
 * l'écrive. Sans ça, l'`UPDATE` violerait le `CHECK`, l'exception serait avalée
 * quelque part, et l'utilisateur lirait un message générique.
 *
 * La liste repart de la DERNIÈRE déclaration (`1789691847302-TimesheetDepth`,
 * sept valeurs) et n'en perd aucune — GA-11 refuse tout rétrécissement, et un
 * `ADD CONSTRAINT` qui échoue ABANDONNE le déploiement Railway en silence.
 * `rejected` est ajouté EN FIN, comme GA-08 l'exige côté TypeScript.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MOTIF EST TENU PAR LA BASE, PAS SEULEMENT PAR L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_timesheets_rejection_reason_check` reprend la forme exacte déjà
 * posée sur `invoice_readiness.invoice_cancelled_reason` : dès qu'une date de
 * rejet existe, le motif est non vide. Une garantie qui ne vit que dans le JSX
 * n'en est pas une — un appel direct à l'API la contournerait, et c'est
 * précisément le cas qu'on veut rendre impossible.
 *
 * On ARCHIVE, on ne supprime pas : le rejet ne fait pas disparaître le relevé,
 * il le marque. Les jours déclarés restent, et le consultant peut redéposer —
 * `submitTimesheet` ne refuse que les relevés `validated`, donc un relevé rejeté
 * repasse en `submitted` sans qu'aucune porte ne s'y oppose. Un rejet dont on ne
 * peut pas sortir serait une impasse.
 */
export class TimesheetRejection1790290000001 implements MigrationInterface {
  public name = 'TimesheetRejection1790290000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
        ADD COLUMN IF NOT EXISTS rejection_reason text,
        ADD COLUMN IF NOT EXISTS rejected_by uuid
    `)

    // La liste des SEPT valeurs de `1789691847302`, plus `rejected`. Recopier
    // une liste plus ANCIENNE est exactement le défaut du 21/08 que GA-11 garde.
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_status_check
        CHECK (status IN ('draft', 'submitted', 'validated', 'disputed', 'expected', 'missing', 'not_required', 'rejected'))
    `)

    // Le motif, tenu par la base. `NOT VALID` serait une porte de sortie : il
    // n'y a aucune ligne rejetée à ce stade, la contrainte se valide donc sur
    // une table où elle est vraie partout.
    await queryRunner.query(`
      ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_rejection_reason_check
    `)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_rejection_reason_check
        CHECK (rejected_at IS NULL OR length(coalesce(rejection_reason, '')) > 0)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_rejection_reason_check
    `)
    // Les lignes rejetées repassent en `draft` AVANT que la contrainte ne se
    // resserre : sans ça, le `ADD CONSTRAINT` échouerait sur elles et le retour
    // arrière resterait bloqué à mi-chemin.
    await queryRunner.query(`UPDATE mission_timesheets SET status = 'draft' WHERE status = 'rejected'`)
    await queryRunner.query(`ALTER TABLE mission_timesheets DROP CONSTRAINT IF EXISTS mission_timesheets_status_check`)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets ADD CONSTRAINT mission_timesheets_status_check
        CHECK (status IN ('draft', 'submitted', 'validated', 'disputed', 'expected', 'missing', 'not_required'))
    `)
    await queryRunner.query(`
      ALTER TABLE mission_timesheets
        DROP COLUMN IF EXISTS rejected_at,
        DROP COLUMN IF EXISTS rejection_reason,
        DROP COLUMN IF EXISTS rejected_by
    `)
  }
}
