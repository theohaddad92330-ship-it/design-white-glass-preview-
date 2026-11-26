import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Ce qu'une ESN détectée par l'analyse doit porter pour être AFFICHABLE.
 *
 * Le tome 1 §21.3 pose la règle : « aucune ESN n'est affichée sans sa certitude
 * ET sa date », et §21.5 en fait un interdit — « afficher une ESN sans date de
 * détection ». La table portait le nom, le rang et la relation ; rien qui dise
 * d'où l'information vient ni de quand elle date.
 *
 * `dismissed_at` est le pendant du bouton « Ce n'est pas exact ». Supprimer la
 * ligne ne suffirait pas : la prochaine analyse la recréerait, et la correction
 * de l'utilisateur se perdrait à chaque run — exactement ce que le §21.5
 * interdit (« écraser une correction humaine »). Une pierre tombale, elle,
 * survit au run suivant.
 *
 * Colonnes toutes NULLABLES : les lignes déclarées à la main avant aujourd'hui
 * n'ont ni certitude ni date, et leur en inventer une serait la seule chose
 * pire que de ne pas en avoir.
 */
export class EsnPresencePartners1789991284637 implements MigrationInterface {
  name = 'EsnPresencePartners1789991284637'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners
        ADD COLUMN IF NOT EXISTS certainty TEXT,
        ADD COLUMN IF NOT EXISTS scope TEXT,
        ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS dismissed_reason TEXT
    `)

    // La contrainte accepte NULL : « on ne sait pas » est un état légitime pour
    // une ligne saisie à la main, et le forcer à « faible » affirmerait qu'on a
    // douté d'une information que personne n'a évaluée.
    await queryRunner.query(`
      ALTER TABLE account_partners
        DROP CONSTRAINT IF EXISTS account_partners_certainty_check
    `)
    await queryRunner.query(`
      ALTER TABLE account_partners
        ADD CONSTRAINT account_partners_certainty_check
        CHECK (certainty IS NULL OR certainty IN ('forte','moyenne','faible'))
    `)

    // L'index unique existant porte sur (account_id, lower(name)) : c'est lui
    // qui rend l'écriture du pipeline idempotente d'un run à l'autre. Rien à
    // ajouter — on note seulement que la lecture courante doit filtrer les
    // lignes écartées, sinon une correction se lirait comme sans effet.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS account_partners_live_idx
        ON account_partners (account_id)
        WHERE dismissed_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS account_partners_live_idx`)
    await queryRunner.query(`ALTER TABLE account_partners DROP CONSTRAINT IF EXISTS account_partners_certainty_check`)
    await queryRunner.query(`
      ALTER TABLE account_partners
        DROP COLUMN IF EXISTS dismissed_reason,
        DROP COLUMN IF EXISTS dismissed_at,
        DROP COLUMN IF EXISTS detected_at,
        DROP COLUMN IF EXISTS scope,
        DROP COLUMN IF EXISTS certainty
    `)
  }
}
