import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `consultants.photo_url` — la photo d'un talent (écran Vivier, PDF-22 §01).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE COLONNE EST, ET CE QU'ELLE N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * La maquette du vivier affiche une photo par ligne. Le dépôt n'a NULLE PART
 * ailleurs de photo de talent — `photo_url` existe déjà sur `contacts`, pas sur
 * `consultants` — d'où cette colonne, nullable, sans défaut : « non renseigné »
 * pour toute fiche existante, jamais une image devinée ni un portrait inventé.
 *
 * ⚠️ Elle s'AFFICHE et n'ENTRE DANS AUCUN CLASSEMENT. `photo_url` /
 * `photoUrl` est un critère PROTÉGÉ (annexe III de l'EU AI Act + droit des
 * données personnelles), tenu par `apps/api/src/architecture/
 * protected-criteria.spec.ts` (GA-06) : `TalentService` — l'un des moteurs
 * qu'elle surveille — ne lit NI n'écrit cette colonne. Elle est fusionnée
 * après coup, côté lecture seule, par `talent-photo.service.ts`, un fichier
 * hors de la liste surveillée.
 *
 * Aucune donnée existante n'est touchée : `null` partout, comme le veut
 * « jamais de donnée fictive ».
 */
export class ConsultantPhotoUrl1790973000001 implements MigrationInterface {
  public name = 'ConsultantPhotoUrl1790973000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants ADD COLUMN IF NOT EXISTS photo_url text`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE consultants DROP COLUMN IF EXISTS photo_url`)
  }
}
