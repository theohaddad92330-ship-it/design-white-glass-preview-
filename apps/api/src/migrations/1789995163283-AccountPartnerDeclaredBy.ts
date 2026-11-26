import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2298.7 — LA MIGRATION « QUI A DÉCLARÉ LA RELATION », décision Louis 21/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * Sept des huit métadonnées de `account_partners` sont déjà rendues dans
 * `TabPartners.tsx` : `source`, `scope`, `certainty`, `evidence_origins`,
 * `market_observation_count`, `detected_at`, `note`. La huitième — QUI a
 * déclaré la relation, quand `source = 'declared'` — n'existe nulle part :
 * `AccountPartnerEntity` n'a ni `user_id` ni `declared_by`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-11 / GA-12 — LA CONTRAINTE AVANT LE CODE QUI ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Cette colonne arrive AVANT que `PartnersService.create` ne la renseigne
 * (lot suivant du même chantier) : élargir la table d'abord, écrire ensuite —
 * jamais l'inverse, sur le modèle d'`account_vocabulary.kind`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN BACKFILL — ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrairement à `InvoiceReadinessDeclared` (qui rebascule un état déjà mal
 * nommé), il n'existe ICI aucune trace de qui a saisi une ligne déjà déclarée
 * avant ce lot — la colonne n'a jamais existé, sous AUCUN nom. Une relation
 * déclarée avant cette migration n'a donc PAS d'auteur, et il ne s'invente
 * pas : `declared_by` naît NULL sur les lignes existantes, et le reste NULL
 * pour toujours sur celles-là. C'est `TabPartners.tsx` qui porte la phrase
 * « auteur inconnu (déclarée avant le `<date>`) » sur ce cas — jamais un nom
 * deviné, jamais la ligne masquée.
 */
export class AccountPartnerDeclaredBy1789995163283 implements MigrationInterface {
  name = 'AccountPartnerDeclaredBy1789995163283'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners ADD COLUMN IF NOT EXISTS declared_by uuid
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_partners DROP COLUMN IF EXISTS declared_by
    `)
  }
}
