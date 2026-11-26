import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Un compte REPRIS d'un fichier n'a jamais été analysé — et aucune des valeurs
 * existantes ne le disait (PDF 7 §7).
 *
 * `analyzing` afficherait une progression que rien n'alimente. `completed`
 * affirmerait qu'un dossier de conquête existe, et les écrans qui filtrent
 * là-dessus l'ouvriraient sur du vide. `error` désignerait une panne qui n'a pas
 * eu lieu. `imported` dit la vérité : la ligne existe, personne ne l'a encore
 * travaillée.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ÉLARGIR UNE CONTRAINTE, C'EST L'ÉLARGIR — PAS LA RÉÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * La première version de cette migration reprenait la liste de
 * `1779200000000-AddCanceledStatusToAccounts`, qui est PÉRIMÉE :
 * `1783000000000-AddArchivedDeletedStatusesToAccounts` y avait ajouté `archived`
 * et `deleted` depuis. En la recopiant, on retirait ces deux valeurs — et le
 * `ADD CONSTRAINT` échouait sur les lignes qui les portent.
 *
 * Conséquence observée en production le 21/08 : `migration:run:prod` est le
 * `preDeployCommand` de Railway. Son échec ABANDONNE le déploiement, l'ancienne
 * version reste en ligne, et rien dans l'application ne le dit. On cherche une
 * panne applicative pendant une heure alors que le nouveau code n'a jamais
 * démarré.
 *
 * La liste ci-dessous est donc la précédente PLUS `imported`, et une garde
 * (`accounts-status-constraint.spec.ts`) refuse désormais toute migration qui
 * rétrécirait un `CHECK ... IN (...)` existant.
 */
export class AccountImportedStatus1789910000003 implements MigrationInterface {
  name = 'AccountImportedStatus1789910000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted', 'imported'))`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_status_check`)
    await queryRunner.query(
      `ALTER TABLE accounts ADD CONSTRAINT accounts_status_check CHECK (status IN ('analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted'))`,
    )
  }
}
