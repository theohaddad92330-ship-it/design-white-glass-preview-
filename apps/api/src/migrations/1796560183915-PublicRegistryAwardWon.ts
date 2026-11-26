import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #3915.decp (décision Louis 16/10/2026) — un marché public attribué où le compte
 * suivi est le TITULAIRE (`award_won`), à côté de celui où il est l'ACHETEUR
 * (`award`, #3920.8). Les deux se lisent par SIREN, jamais par le nom.
 *
 * Intégration vague 7 : cette migration passe APRÈS `PublicRegistryRne1796560050638`, qui a posé
 * `establishment_closure` ; son CHECK est donc l'UNION des deux (`award_won` + `establishment_closure`),
 * sinon elle retirerait le genre posé juste avant elle.
 *
 * GA-11/GA-12 : le CHECK s'élargit AVANT le code qui écrit la valeur. Aucune clé
 * étrangère ajoutée (rien à préciser en ON DELETE) ; aucun rattrapage : valeur
 * NEUVE, aucune ligne existante à requalifier.
 */
export class PublicRegistryAwardWon1796560183915 implements MigrationInterface {
  public name = 'PublicRegistryAwardWon1796560183915'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'executive_change',
        'headcount_change', 'award', 'award_won', 'establishment_closure', 'other'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM public_registry_announcements WHERE kind = 'award_won'`)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      DROP CONSTRAINT IF EXISTS public_registry_announcements_kind_check
    `)
    await queryRunner.query(`
      ALTER TABLE public_registry_announcements
      ADD CONSTRAINT public_registry_announcements_kind_check CHECK (kind IN (
        'collective_proceeding', 'creation', 'sale', 'accounts_filing',
        'modification', 'deregistration', 'new_establishment', 'executive_change',
        'headcount_change', 'award', 'establishment_closure', 'other'))
    `)
  }
}
