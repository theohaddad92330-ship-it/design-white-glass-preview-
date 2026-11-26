import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #1791.2 — la trace de ce que Laura lit chez un connecteur, sur le journal
 * d'un compte : `crm_lookup`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, ET IL N'EST PAS NÉGOCIABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `crm_lookup` est une valeur qui voyage du code vers la base : la contrainte
 * `CHECK` s'élargit AVANT le code qui l'écrit (GA-11, GA-12). Sans cette
 * migration, `ActivitiesService.recordCrmLookup` lèverait une violation de
 * contrainte au moment d'écrire — un best-effort qui échoue en silence, donc
 * une trace qui n'existe jamais, exactement le défaut que Louis a demandé de
 * corriger.
 *
 * ⚠️ La liste repart de la DERNIÈRE déclaration (`DecisionGates`, qui a ajouté
 * `gate_decision`) et n'en retire AUCUNE valeur — une contrainte CHECK ne
 * rétrécit jamais. Côté TypeScript, `crm_lookup` est ajoutée EN FIN de
 * `ACTIVITY_KINDS` (GA-08).
 */
export class CrmLookupActivity1792503431568 implements MigrationInterface {
  name = 'CrmLookupActivity1792503431568'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (
        kind IN (
          'email', 'call', 'meeting', 'note', 'task', 'stage_change',
          'crm_export', 'linkedin', 'analysis', 'workflow', 'gate_decision', 'crm_lookup'
        )
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On retire les lignes qu'on s'apprête à interdire : la contrainte
    // refuserait de se poser sur une table qui en porte encore — même patron
    // que `CrmReadPermission`. Une trace de lecture perdue au retour arrière
    // n'est pas un historique qu'on doit préserver au prix de bloquer la
    // migration.
    await queryRunner.query(`DELETE FROM activities WHERE kind = 'crm_lookup'`)
    await queryRunner.query(`ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_kind_check`)
    await queryRunner.query(`
      ALTER TABLE activities ADD CONSTRAINT activities_kind_check CHECK (
        kind IN (
          'email', 'call', 'meeting', 'note', 'task', 'stage_change',
          'crm_export', 'linkedin', 'analysis', 'workflow', 'gate_decision'
        )
      )
    `)
  }
}
