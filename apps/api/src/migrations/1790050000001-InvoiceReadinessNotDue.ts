import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `not_due` — le mois d'une mission qui ne se facture PAS au mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * `mission_commercial_terms.billing_cadence` existe depuis la migration
 * `1789389517264` — trois valeurs (`monthly`, `milestone`, `fixed_price`), une
 * contrainte, une écriture, une lecture, et même un rendu sur la fiche mission.
 * Mais **le calcul de préparation à la facturation ne la lit pas**. Une mission
 * facturée au jalon ou au forfait passait donc l'écran mensuel exactement comme
 * une mission en régie : « prête à facturer », tous les mois.
 *
 * C'est de l'argent annoncé comme facturable alors qu'il n'est pas dû. Le
 * produit refuse ailleurs, systématiquement, d'additionner ce qui ne se
 * facturera pas — `blockedAmountCents` existe pour cette raison exacte. Il
 * manquait la moitié : le montant qui n'est pas bloqué, mais pas dû non plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN QUATRIÈME ÉTAT, ET PAS UN BLOQUEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * `blocked` dit « quelque chose ne va pas, va le régler ». `ready` dit « tu peux
 * facturer ». Sur une mission au forfait, les deux sont faux : rien n'est
 * cassé, et rien n'est dû. C'est la même distinction que `partial` face à
 * `failed`, ou `unknown` face à un échec — le produit a déjà tranché deux fois
 * que « je ne sais pas » et « non » ne se rangent pas ensemble.
 *
 * ⚠️ La contrainte est élargie AVANT le code qui écrira la valeur : c'est la
 * leçon d'`account_vocabulary.kind`, où l'ordre inverse avait mis la production
 * en erreur. Une valeur qui voyage du code vers la base voit sa contrainte
 * s'ouvrir d'abord.
 *
 * `monthly` ET `NULL` gardent le comportement d'aujourd'hui. `NULL` veut dire
 * « on ne sait pas », et sur ce point précis le statu quo est le mensuel : en
 * déduire l'inverse ferait disparaître de l'écran des missions qu'on facture
 * réellement chaque mois.
 */
export class InvoiceReadinessNotDue1790050000001 implements MigrationInterface {
  name = 'InvoiceReadinessNotDue1790050000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_readiness_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_readiness_state_check
        CHECK (state IN ('blocked', 'ready', 'invoiced', 'not_due'))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rétrécir une contrainte casse les lignes déjà écrites : on les ramène
    // d'abord à `blocked`, qui est l'état le plus prudent — il n'annonce aucune
    // facturation. Les perdre en silence serait pire.
    await queryRunner.query(`UPDATE invoice_readiness SET state = 'blocked' WHERE state = 'not_due'`)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness DROP CONSTRAINT IF EXISTS invoice_readiness_state_check
    `)
    await queryRunner.query(`
      ALTER TABLE invoice_readiness
        ADD CONSTRAINT invoice_readiness_state_check
        CHECK (state IN ('blocked', 'ready', 'invoiced'))
    `)
  }
}
