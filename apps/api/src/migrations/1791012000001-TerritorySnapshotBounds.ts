import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * LA PHOTO D'UN TERRITOIRE PORTE SA BORNE DE COLLECTE (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE « 100 » NE DISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran Marché affichait « Offres IT : 100 » sur DEUX départements. Cent tout
 * rond, deux fois. Ce n'était pas une coïncidence : c'est la borne de collecte.
 *
 *     apps/ia/app/services/territory_overview.py
 *       hiring_task = list_hiring_companies(department, None, since_days, 100)
 *     apps/ia/app/services/data_sources/france_travail.py
 *       return [row for _dt, row in rows[:limit]]     # limit = 100
 *
 * `offers` vaut `len(rows)`, donc **au plus 100**. Un département qui publie
 * 340 offres IT rend « 100 » — et l'écran l'affichait comme un dénombrement.
 * Deux territoires incomparables se lisaient identiques, et une variation entre
 * deux photos toutes deux clipées se lisait « stable » alors que rien n'était
 * mesuré.
 *
 * Les trois autres mesures ont la même forme : `openTenders` et
 * `awardedContracts` sont bornés à 50 (BOAMP, DECP), `esnPresent` au plafond
 * que le registre pose lui-même sur `total_results` (10 000 — le service IA le
 * dit déjà dans sa raison, l'écran ne le lisait pas).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA BORNE EST DANS LA PHOTO, ET PAS SEULEMENT DANS LE CODE
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce qu'elle CHANGE. Le jour où la collecte passe de 100 à 300, une photo de
 * la semaine dernière prise à 100 ne se compare plus à une photo de cette
 * semaine prise à 300 : la hausse serait entièrement due à la borne. La borne
 * appartient donc à la MESURE, exactement comme sa date — pas à la constante
 * qui se trouvait être en vigueur au moment où quelqu'un relit la table.
 *
 * `'{}'::jsonb` sur les lignes déjà écrites : on ne sait pas rétroactivement à
 * quelle borne elles ont été prises. Les lire comme « non borné » serait
 * inventer ; la lecture (`readTerritoryCount`) retombe donc sur la constante en
 * vigueur, et c'est ÉCRIT dans son docblock.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `source` — ET POURQUOI L'INDEX UNIQUE CHANGE AVEC ELLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `territory_snapshots` est PARTAGÉE : pas de `workspace_id`, parce que le
 * nombre d'offres IT en Haute-Garonne est le même pour tout le monde. C'est
 * exactement pour cette raison que la salle de démonstration n'y semait RIEN —
 * « en fabriquer de fausses ferait mentir la moyenne de tout le monde », dit le
 * semis. Résultat : l'écran Marché s'ouvrait sans une seule tendance devant un
 * prospect, ce qui est la parité démo enfreinte.
 *
 * `source` tranche les deux : une photo de démonstration est ÉTIQUETÉE, et
 * aucune lecture réelle ne la voit — ni `refreshBaselines` (donc la médiane de
 * recrutement du référentiel reste propre), ni le tableau d'un espace qui n'est
 * pas la salle. La contrainte `CHECK` est inscrite au `MAPPING` de GA-12
 * (`TERRITORY_SNAPSHOT_SOURCES`).
 *
 * ⚠️ L'index unique passe de `(department, taken_on)` à
 * `(department, taken_on, source)`. Sans ce troisième terme, une photo de démo
 * du lundi EMPÊCHERAIT le balayage réel d'écrire la sienne le même jour — et
 * pire, `snapshot()` la trouverait et rendrait `false` en croyant la semaine
 * déjà photographiée. La donnée réelle serait perdue, silencieusement, pour le
 * seul département que la démonstration affiche.
 */
export class TerritorySnapshotBounds1791012000001 implements MigrationInterface {
  name = 'TerritorySnapshotBounds1791012000001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE territory_snapshots
         ADD COLUMN IF NOT EXISTS collection_limits jsonb NOT NULL DEFAULT '{}'::jsonb`,
    )
    await queryRunner.query(
      `ALTER TABLE territory_snapshots
         ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'sweep'`,
    )
    await queryRunner.query(
      `ALTER TABLE territory_snapshots
         DROP CONSTRAINT IF EXISTS territory_snapshots_source_check`,
    )
    await queryRunner.query(
      `ALTER TABLE territory_snapshots
         ADD CONSTRAINT territory_snapshots_source_check CHECK (source IN ('sweep', 'demo'))`,
    )

    // L'ancien index unique porte le nom que TypeORM lui a donné ; on le
    // retrouve par son ATTRIBUTION plutôt que par un nom deviné, sans quoi la
    // migration serait juste sur une base et sans effet sur une autre.
    const rows = (await queryRunner.query(
      `SELECT i.relname AS name
         FROM pg_index x
         JOIN pg_class i ON i.oid = x.indexrelid
         JOIN pg_class t ON t.oid = x.indrelid
        WHERE t.relname = 'territory_snapshots'
          AND x.indisunique
          AND NOT x.indisprimary`,
    )) as Array<{ name: string }>
    for (const row of rows) {
      await queryRunner.query(`DROP INDEX IF EXISTS "${row.name}"`)
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS territory_snapshots_department_taken_on_source_key
         ON territory_snapshots (department, taken_on, source)`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS territory_snapshots_department_taken_on_source_key`)
    await queryRunner.query(
      `ALTER TABLE territory_snapshots DROP CONSTRAINT IF EXISTS territory_snapshots_source_check`,
    )
    await queryRunner.query(`ALTER TABLE territory_snapshots DROP COLUMN IF EXISTS source`)
    await queryRunner.query(`ALTER TABLE territory_snapshots DROP COLUMN IF EXISTS collection_limits`)
  }
}
