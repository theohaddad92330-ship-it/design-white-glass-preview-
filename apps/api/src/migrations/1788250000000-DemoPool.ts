import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Pool de SALLES de démo — plusieurs visiteurs en même temps sur le lien partagé.
 *
 * Jusqu'ici le lien menait à UN espace unique : le deuxième visiteur déclenchait
 * une remise à neuf (~35 DELETE) qui effaçait les dossiers du premier en pleine
 * présentation, et les deux partageaient la même identité (le fil du copilote de
 * l'un était lisible par l'autre).
 *
 * Trois colonnes suffisent à transformer cet espace unique en pool loué :
 *
 *  1. `demo_slot_index` — le numéro de salle (1..N). L'espace créé par
 *     l'opérateur (`POST /internal/admin/workspaces/demo`) devient la salle n°1
 *     par adoption ; les suivantes sont provisionnées à la demande, jamais
 *     au-delà de `DEMO_POOL_SIZE`. L'index unique PARTIEL est ce qui empêche
 *     deux requêtes concurrentes de s'attribuer la même salle.
 *  2. `demo_leased_at` — début du bail courant. NULL = jamais loué. Un bail
 *     expiré (> `DEMO_LEASE_TTL_MINUTES`) rend la salle disponible, et c'est à
 *     ce moment-là — pas pendant la visite de quelqu'un — qu'elle est purgée.
 *  3. `demo_lease_device` — le cookie `bellum_did` du navigateur qui occupe la
 *     salle. C'est lui qui fait qu'un rechargement de page (ou un robot qui
 *     suit le lien public) retrouve SA salle au lieu d'en consommer une neuve.
 *
 * Additif et sans effet hors démo : les trois colonnes sont NULL sur tout
 * workspace réel, et un pool de taille 1 reproduit exactement l'ancien
 * comportement.
 */
export class DemoPool1788250000000 implements MigrationInterface {
  public name = 'DemoPool1788250000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_slot_index integer`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_leased_at timestamptz`)
    await queryRunner.query(`ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS demo_lease_device text`)
    // Partiel : seules les salles de démo portent un index, tous les autres
    // workspaces gardent NULL (et NULL n'entre pas en conflit avec NULL).
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS workspaces_demo_slot_index_uniq
      ON workspaces (demo_slot_index)
      WHERE demo_slot_index IS NOT NULL
    `)
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
