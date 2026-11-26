import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * #2298.4 (19/09/2026, lot I3) — LA DATE DU REJEU GRATUIT DE L'AXE RELATION.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `signals_collected_at`
 * ─────────────────────────────────────────────────────────────────────────────
 * I2 a fait porter la fraîcheur de `raw_analysis.addressability` (donc de
 * l'axe relation) par `signals_collected_at` (`AccessLandscape.addressabilityCollectedAt`)
 * — un choix honnête TANT QUE les deux ne bougent QUE de conserve : les deux
 * sont stampés par la MÊME écriture, `AccountsService.applyResearch` (Phase 1,
 * payante).
 *
 * Ce lot casse cette conserve : le rejeu gratuit de l'axe relation SEUL
 * (`AnalysisOnDemandService.recalculateRelationAxis`) réécrit
 * `raw_analysis.addressability` SANS repasser par une recherche complète —
 * donc sans toucher `signals_collected_at`. Réutiliser cette colonne ici
 * ferait croire qu'une recherche COMPLÈTE (Brave/Firecrawl/Claude) vient
 * d'avoir lieu, ce qui est faux et fausserait un futur rattrapage sur le
 * segment `signals` lui-même (GA-26 : un réglage vit à un seul endroit —
 * partager une colonne entre deux événements qui peuvent désormais diverger
 * EST exactement la faute que GA-26 vise).
 *
 * Additive, même forme que `signals_collected_at`/`contacts_collected_at` :
 * `timestamptz`, NULLABLE, `IF NOT EXISTS`. `NULL` = « cet axe n'a jamais été
 * recalculé gratuitement » — l'écran retombe alors sur `signals_collected_at`
 * seul (voir `AccountAccessService.landscape`).
 *
 * Seul écrivain prévu : `AccountsService.applyAddressabilityRelationRecalc`,
 * appelé UNIQUEMENT par `AnalysisOnDemandService.recalculateRelationAxis`
 * (le geste « Recalculer la relation (gratuit) », jamais automatique).
 */
export class AddressabilityRelationCollectedAt1795716734279 implements MigrationInterface {
  public name = 'AddressabilityRelationCollectedAt1795716734279'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS addressability_relation_collected_at timestamptz NULL`,
    )
  }

  public async down(): Promise<void> {
    throw new Error('down migrations are not supported')
  }
}
