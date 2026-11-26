import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2195.33 — `missions.renewal_opportunity_id` : L'AFFAIRE QUI RENOUVELLE LA
 * MISSION. Décision de Louis du 16/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX COLONNES, DEUX FAITS — ET C'EST TOUT LE SUJET
 * ─────────────────────────────────────────────────────────────────────────────
 * `missions.opportunity_id` existe depuis `1788290000000-DeliveryOs.ts` : il
 * nomme l'affaire qui a PRODUIT la mission. Le renouvellement est une affaire
 * NEUVE — il se négocie, il a son montant, son échéance et son étape de pipe —
 * et l'écrire dans `opportunity_id` ferait perdre d'où la mission vient. Une
 * ESN qui renouvelle trois fois de suite verrait son affaire d'origine
 * remplacée trois fois, et la question « d'où sort cette mission ? » n'aurait
 * plus de réponse. D'où une SECONDE colonne, jamais un écrasement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA CONTRAINTE GARDE
 * ─────────────────────────────────────────────────────────────────────────────
 * `UNIQUE` partiel comme pour `opportunity_id` (`1790140000001`) : une affaire
 * ne renouvelle qu'UNE mission. Deux missions qui se réclameraient du même
 * renouvellement feraient compter deux fois le même euro dans le pipe.
 * `WHERE renewal_opportunity_id IS NOT NULL` : les missions sans
 * renouvellement — l'immense majorité — ne se gênent pas entre elles.
 *
 * `ON DELETE SET NULL` : supprimer une affaire ne supprime pas la mission qui
 * tourne. On archive, on ne supprime pas ; et si l'affaire disparaît, le lien
 * redevient inconnu plutôt que d'emporter la prestation en cours.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PART DEVANT LE CODE QUI L'ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 / GA-12 : la contrainte SQL s'élargit AVANT le code qui écrit la
 * valeur. `POST /projects` (et lui seul) renseigne cette colonne, et il ne part
 * qu'après cette migration.
 *
 * ⚠️ Rien à élargir du côté de `opportunities.kind` pour la nouvelle nature
 * `manual` : la colonne est un `text` NOT NULL SANS contrainte CHECK
 * (`1787900000000-Opportunities.ts:32`). Mesuré, pas supposé.
 */
export class MissionRenewalOpportunity1795200000003 implements MigrationInterface {
  public name = 'MissionRenewalOpportunity1795200000003'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE missions
        ADD COLUMN IF NOT EXISTS renewal_opportunity_id uuid
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        DROP CONSTRAINT IF EXISTS missions_renewal_opportunity_id_fkey
    `)
    await queryRunner.query(`
      ALTER TABLE missions
        ADD CONSTRAINT missions_renewal_opportunity_id_fkey
        FOREIGN KEY (renewal_opportunity_id) REFERENCES opportunities (id) ON DELETE SET NULL
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS missions_renewal_opportunity_uniq
        ON missions (renewal_opportunity_id)
        WHERE renewal_opportunity_id IS NOT NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS missions_renewal_opportunity_uniq`)
    await queryRunner.query(`ALTER TABLE missions DROP CONSTRAINT IF EXISTS missions_renewal_opportunity_id_fkey`)
    await queryRunner.query(`ALTER TABLE missions DROP COLUMN IF EXISTS renewal_opportunity_id`)
  }
}
