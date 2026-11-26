import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `mission_expenses` — la ligne de frais que la marge ignorait (triage du
 * 30/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE MESURÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `expense` / `expenseLine` : zéro occurrence dans `apps/api/src/modules`,
 * `apps/web/src/features/missions` et `packages/contracts/src` avant ce lot.
 * Une mission n'avait AUCUNE ligne de frais, alors que sa marge est calculée
 * et affichée partout — la fiche, la liste, le board, les alertes de seuil, la
 * marge par canal. La marge affichée ignorait donc tout déplacement, tout
 * matériel, toute dépense engagée pour délivrer la mission : un chiffre qui se
 * présente comme complet et ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA FORME
 * ─────────────────────────────────────────────────────────────────────────────
 * Le précédent du dépôt est `mission_commercial_terms` : une table À PART, pas
 * des colonnes de plus sur `missions`, parce qu'une donnée réservée à
 * `finance:read` se protège mal quand elle vit dans la même ligne que le reste
 * de la fiche.
 *
 * `source` reprend le vocabulaire DÉJÀ en place pour « une correction humaine
 * gagne toujours » (`FIELD_SOURCES` de `provenance.ts` — `human` > `connector`
 * > `pipeline` > `model`) plutôt que d'inventer un second axe « manuel /
 * importé ». `entered_by` est posé UNE FOIS à la création — « qui l'a saisie »
 * est un fait historique, une édition ultérieure ne réattribue pas la ligne à
 * son éditeur.
 *
 * `amount_cents bigint NOT NULL CHECK (amount_cents > 0)` : la contrainte est
 * posée ICI, AVANT tout code qui écrit (GA-11/GA-12). Une ligne à 0 ne veut
 * rien dire, un montant négatif serait un avoir et non une dépense — les deux
 * corrompraient silencieusement la marge nette qui s'appuie dessus.
 */
export class MissionExpenses1790900000003 implements MigrationInterface {
  public name = 'MissionExpenses1790900000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS mission_expenses (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
        workspace_id uuid NOT NULL,
        label text NOT NULL,
        amount_cents bigint NOT NULL CHECK (amount_cents > 0),
        expense_date date NOT NULL,
        entered_by uuid NOT NULL,
        source text NOT NULL DEFAULT 'human',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT mission_expenses_source_check CHECK (source IN ('human', 'connector', 'pipeline', 'model'))
      )
    `)
    // La lecture de la fiche : « les frais de CETTE mission, du plus récent ».
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS mission_expenses_mission_idx
        ON mission_expenses (mission_id, expense_date DESC)
    `)
    // La purge de démonstration efface par `WHERE workspace_id = $1`, comme
    // `mission_commercial_terms` — sans cet index, chaque reset de salle
    // scannerait la table entière.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS mission_expenses_workspace_idx ON mission_expenses (workspace_id)`,
    )
    await queryRunner.query(`
      COMMENT ON TABLE mission_expenses IS
        'Lignes de frais rattachées à une mission (30/08/2026) - entrent dans la marge nette via missionMarginWithExpenses (@bellum/contracts). Reservees a finance:read, comme mission_commercial_terms.'
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS mission_expenses`)
  }
}
