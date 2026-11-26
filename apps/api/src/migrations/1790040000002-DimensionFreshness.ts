import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * La fraîcheur PAR DIMENSION d'un dossier.
 *
 * ⚠️ Il n'existait qu'un `updated_at` global, qu'un refresh de signaux
 * incrémentait indistinctement. Conséquences mesurées, toutes les deux
 * invisibles depuis les tests :
 *
 * 1. **L'écran affiche une fraîcheur qui n'est celle de rien.** « Actualisé il y
 *    a 2 jours » au-dessus d'un organigramme de mars, parce qu'on a rafraîchi
 *    les signaux avant-hier. Le commercial part en rendez-vous avec des
 *    interlocuteurs périmés en croyant le dossier à jour.
 * 2. **Aucune règle de non-rerun n'était calculable.** Le seuil des 30 jours
 *    protège le LANCEMENT d'une analyse ; le chemin de refresh ne consultait
 *    aucune date, donc cliquer « Rafraîchir → Signaux » deux fois de suite
 *    débitait deux crédits pour rejouer exactement la même phase.
 *
 * Quatre colonnes NULLABLES : `NULL` veut dire « cette dimension n'a jamais été
 * rafraîchie séparément », ce qui est l'état de tous les dossiers existants — et
 * pas « rafraîchie à l'époque zéro ». La règle de non-rerun ne se déclenche donc
 * sur aucun dossier antérieur, ce qui est le comportement voulu : on ne refuse
 * pas un geste sur une date qu'on n'a pas.
 */
export class DimensionFreshness1790040000002 implements MigrationInterface {
  public name = 'DimensionFreshness1790040000002'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ⚠️ Les quatre colonnes sont écrites EN CLAIR, pas générées par une boucle.
    // GA-36 lit le TEXTE des migrations pour vérifier que chaque colonne est
    // déclarée par son entité : un nom construit par interpolation n'est lisible
    // par personne — ni par la garde, ni par quelqu'un qui grep le dépôt six
    // mois plus tard en cherchant `contacts_refreshed_at`.
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS signals_refreshed_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS contacts_refreshed_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS entities_refreshed_at timestamptz NULL`)
    await queryRunner.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS strategy_refreshed_at timestamptz NULL`)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
