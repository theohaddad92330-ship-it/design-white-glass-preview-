import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #4971.1 — nommer ses outils MAISON à l'onboarding.
 *
 * Un client dont le CRM, l'ATS ou l'ERP est développé en interne ne trouvait
 * aucun champ pour le nommer : l'échelle de présence (`tooling_crm`…) ne prend
 * pas de saisie. Une colonne ADDITIVE, `text[]` NULLABLE et SANS défaut :
 * `NULL` = question passée (inconnue), jamais « aucun outil interne ».
 *
 * Aucune contrainte de valeur en base : la borne (nombre de noms, longueur
 * d'un nom) vit dans le contrat (`answers-outillage.ts`), comme pour toutes les
 * réponses libres du questionnaire. Posée AVANT le code qui l'écrit (GA-11/12).
 *
 * ⚠️ #4971.2 — un nom saisi ici n'est jamais une connexion : rien ne lit cette
 * colonne pour afficher « branché ».
 */
export class OutillageNomsInternes1796610000200 implements MigrationInterface {
  name = 'OutillageNomsInternes1796610000200'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles ADD COLUMN IF NOT EXISTS tooling_internal_names text[];`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE esn_profiles DROP COLUMN IF EXISTS tooling_internal_names;`)
  }
}
