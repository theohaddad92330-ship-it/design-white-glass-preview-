import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2295.4bis — décision Louis 18/09/2026 (question 24, née de la livraison de
 * #2295.4) : « cette adresse a été VÉRIFIÉE » (`email_verified`) et « ce
 * contact est UTILISABLE EN DÉMONSTRATION » (`demo_seed_first_door`) sont deux
 * faits DISTINCTS.
 *
 * `classifyGroup()` (#2295.4, `contact-ranking.ts`) refuse le groupe
 * « première porte » à tout contact dont l'email n'est pas vérifié — juste,
 * mais en salle de démonstration `email_verified` vaut TOUJOURS `false` (les
 * contacts de démo portent des adresses `.example`, qui ne peuvent jamais
 * être vérifiées). Le groupe le plus important des six restait donc
 * structurellement VIDE devant un prospect.
 *
 * `demo_seed_first_door` lève ce verrou UNIQUEMENT pour les contacts posés
 * par le jeu de données de démonstration — sans jamais affirmer qu'une
 * adresse réelle a été vérifiée, ni inventer de donnée sur une personne
 * réelle. `DEFAULT false` + `NOT NULL` : additive, tout contact existant (et
 * toute future écriture qui ne le mentionne pas) reste inchangé. Garde de
 * frontière qui interdit à ce champ de valoir `true` hors du semis de
 * démonstration : `apps/api/src/architecture/demo-seed-first-door-is-demo-only.spec.ts`.
 */
export class ContactDemoSeedFirstDoor1795712710555 implements MigrationInterface {
  public name = 'ContactDemoSeedFirstDoor1795712710555'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS demo_seed_first_door boolean NOT NULL DEFAULT false`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
