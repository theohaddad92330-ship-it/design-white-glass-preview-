import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Rendre RÉVERSIBLE le rattachement de deux dossiers d'un même groupe (#1111).
 *
 * `merged_into_id` (migration `1790106284517`) dit à quel dossier un doublon a
 * été rattaché. Elle ne dit ni QUAND, ni PAR QUI, ni — surtout — ce que le
 * dossier était AVANT. Or le rattachement écrase `status` et
 * `commercial_status` par `'archived'` : l'état d'avant n'existe plus nulle
 * part une fois le geste passé.
 *
 * Conséquence, mesurée sur le code de `absorbAccount` avant cette migration :
 * un « détacher » écrit aujourd'hui ne POURRAIT pas restituer le dossier. Il
 * lui faudrait choisir un statut, donc en INVENTER un — « JAMAIS de donnée
 * fictive », et « une correction humaine gagne toujours » suppose qu'on sache
 * ce que la correction corrige.
 *
 * Ces cinq colonnes sont donc la condition du retour arrière, pas un confort :
 *
 * - `merged_at` / `merged_by` — la PROVENANCE du lien : sa date et sa source.
 *   Un rattachement est une AFFIRMATION humaine (« ces deux dossiers sont le
 *   même groupe »), pas une inférence du produit ; l'écran doit pouvoir dire de
 *   quand elle date et de qui elle vient, sinon elle se lit comme un fait
 *   établi par la machine.
 * - `merged_previous_status` / `merged_previous_commercial_status` — l'état
 *   d'AVANT, pour le rendre au lieu de le deviner. `NULL` sur un lien posé
 *   avant cette migration : ces liens-là ne sont pas réversibles, et le code
 *   le DIT (refus `link_predates_reversal`) au lieu de restituer au hasard.
 * - `merged_entity_id` — l'entité d'accueil créée sur le compte gardé. C'est
 *   le seul repère fiable des contacts qui ont bougé : sans elle, un détachement
 *   devrait deviner lesquels des contacts du compte gardé venaient de l'autre.
 *
 * Aucune contrainte de clé étrangère, pour la même raison que
 * `1790106284517` : une cascade emporterait l'historique du dossier rattaché,
 * ce que ce chantier existe précisément pour ne pas faire.
 *
 * Aucune table nouvelle, donc aucune politique RLS à poser : les cinq colonnes
 * vivent sur `accounts`, qui porte déjà son cloisonnement. Un lien reste par
 * construction interne à un espace — les deux bouts sont lus par `findOne`,
 * qui filtre déjà sur l'appartenance.
 *
 * Additive et idempotente. Toutes nullables : `NULL` partout = comportement
 * d'avant, à l'octet près.
 */
export class AccountLinkReversible1790280000001 implements MigrationInterface {
  public name = 'AccountLinkReversible1790280000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_at timestamptz`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_by uuid`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_previous_status text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_previous_commercial_status text`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_entity_id uuid`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_entity_id`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_previous_commercial_status`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_previous_status`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_by`)
    await queryRunner.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS merged_at`)
  }
}
