import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * QUATRE STOCKS DE TRAVAIL ENTRENT DANS LA PHOTO MENSUELLE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET POURQUOI CE N'ÉTAIT PAS UN OUBLI
 * ─────────────────────────────────────────────────────────────────────────────
 * Les neuf indicateurs photographiés sortaient tous de DEUX dérivations, toutes
 * deux dans le module `pilotage` : la chaîne et la vue Qualité. C'était la
 * limite du service de photo, pas un choix de produit — cinq écrans montrent des
 * compteurs de TRAVAIL (besoins sans profil positionné, relevés à valider,
 * factures prêtes, talents disponibles) et affichaient tous « non mesuré » sur
 * leur variation, faute que quoi que ce soit les photographie.
 *
 * Chacun des quatre a une dérivation RÉELLE, déjà servie à l'écran, déjà scopée
 * par espace, et qui rend `null` — jamais un zéro — quand elle ne sait pas :
 *
 *  · `needs_without_positioning` → `OpenNeedsService.list` (`projects`),
 *    compteur `withoutShortlist`, sur `NOT EXISTS (… submissions …)`. Le
 *    dénominateur est `counters.total`, c'est-à-dire les besoins ouverts.
 *  · `timesheets_to_validate`    → `TimesheetsService.month` (`delivery`),
 *    `summary.submitted` (déposé, en attente de validation), dénominateur
 *    `summary.total`. ⚠️ `awaiting` (rien n'est arrivé) et `rejected` (renvoyé)
 *    sont comptés à part par la dérivation, exprès : trois gestes différents.
 *  · `invoices_ready`            → `InvoiceReadinessService.list` (`delivery`),
 *    `summary.ready`, dénominateur = la somme des quatre états, qui
 *    PARTITIONNENT la population (`summarizeReadiness` a une branche nommée par
 *    état, sans `else` fourre-tout, précisément pour que cette somme soit vraie).
 *  · `talents_available`         → `TalentService.stats` (`consultants`),
 *    `availableNow`, dénominateur `total`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA CONTRAINTE EST ÉLARGIE AVANT LE CODE QUI ÉCRIT (GA-11 / GA-12)
 * ─────────────────────────────────────────────────────────────────────────────
 * La liste repart de la DERNIÈRE déclarée — celle de `StockSnapshots1790300000004`
 * — et n'en retire rien. Une clé ajoutée au TypeScript sans élargir la contrainte
 * produirait une violation avalée par le `catch` du balayage : une photo qui
 * manque, chaque mois, sans que personne ne le sache. Le mois écoulé ne revient
 * pas.
 *
 * ⚠️ Aucune valeur n'est INSÉRÉE au milieu : les quatre s'ajoutent en fin, dans
 * l'ordre exact de `STOCK_METRIC_KEYS` (GA-08).
 *
 * ⚠️ `value` reste en `integer`, comme au premier jour : les quatre nouveautés
 * sont des DÉNOMBREMENTS. Aucun montant n'entre ici — `invoices_ready`
 * photographie les COMPTES de factures prêtes et jamais
 * `preparedAmountCents`, qui est une donnée FINANCE soumise à `redactFinance`
 * et dont une photo serait un second endroit où il faudrait re-tenir cette porte.
 */
export class StockSnapshotWorkKeys1791009000001 implements MigrationInterface {
  name = 'StockSnapshotWorkKeys1791009000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE stock_snapshots DROP CONSTRAINT IF EXISTS stock_snapshots_metric_key_check`)
    await queryRunner.query(`
      ALTER TABLE stock_snapshots ADD CONSTRAINT stock_snapshots_metric_key_check CHECK (metric_key IN (
        'benchAvailable',
        'activeClients',
        'accounts_without_next_action',
        'contacts_without_email',
        'projects_without_amount',
        'missions_without_end_date',
        'needs_without_skills',
        'talents_unknown_availability',
        'missions_without_cost',
        'needs_without_positioning',
        'timesheets_to_validate',
        'invoices_ready',
        'talents_available'
      ))
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // On RETIRE la contrainte plutôt que de restaurer l'ancienne liste : des
    // lignes portant les quatre clés neuves existent peut-être déjà, et une
    // contrainte rétrécie les rendrait indéployables. Une table sans contrainte
    // accepte trop ; une table dont la contrainte refuse ses propres lignes ne
    // se migre plus du tout.
    await queryRunner.query(`ALTER TABLE stock_snapshots DROP CONSTRAINT IF EXISTS stock_snapshots_metric_key_check`)
  }
}
