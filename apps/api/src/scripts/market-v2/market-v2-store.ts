import type { DataSource } from 'typeorm'
import type { MarketV2Row, MarketV2Store, MarketV2TableLoad } from './market-v2-import'

/**
 * Lot 783 (#5205) — le store Postgres de l'import v2.1 (migration `1796900104000-MarketV2Rows`). UNE transaction
 * par table : la ligne `market_v2_datasets` (clé étrangère des lignes) est posée en tête de transaction, ses compteurs
 * mis à jour en fin — une coupure annule tout, la table redevient « non chargée » et la relance la reprend.
 *
 * Insertion par lots via `unnest` (une requête par lot de 1 000 lignes, pas un paramètre par cellule) ;
 * `ON CONFLICT DO NOTHING` en ceinture : la transaction suffit, mais un rejeu ne peut jamais dupliquer.
 *
 * C'est le SEUL fichier hors migration qui nomme le coffre `market_v2_row_identities` (garde
 * `market-v2-pii-never-read.spec.ts`). Une erreur Postgres se journalise par son CODE et sa contrainte, jamais par
 * son message ni son détail — ceux-ci peuvent citer une valeur.
 */
export function createPgMarketV2Store(dataSource: DataSource): MarketV2Store {
  return {
    async loadedTables(version: string): Promise<Set<string>> {
      const rows = (await dataSource.query(`SELECT source_table FROM market_v2_datasets WHERE dataset_version = $1`, [
        version,
      ])) as { source_table: string }[]
      return new Set(rows.map(r => r.source_table))
    },

    async loadTable(load: MarketV2TableLoad, batches: AsyncIterable<MarketV2Row[]>): Promise<{ written: number }> {
      const runner = dataSource.createQueryRunner()
      await runner.connect()
      await runner.startTransaction()
      let written = 0
      try {
        await runner.query(
          `INSERT INTO market_v2_datasets (dataset_version, source_table, folder, expected_rows, pii_columns)
           VALUES ($1, $2, $3, $4, $5)`,
          [load.version, load.table, load.folder, load.expectedRows, load.piiColumns],
        )
        for await (const batch of batches) {
          await runner.query(
            `INSERT INTO market_v2_rows (dataset_version, source_table, row_no, account_id, data)
             SELECT $1, $2, r.row_no, r.account_id, r.data
               FROM unnest($3::int[], $4::text[], $5::jsonb[]) AS r(row_no, account_id, data)
             ON CONFLICT DO NOTHING`,
            [
              load.version,
              load.table,
              batch.map(r => r.rowNo),
              batch.map(r => r.accountId),
              batch.map(r => JSON.stringify(r.data)),
            ],
          )
          const withIdentity = batch.filter(r => Object.keys(r.identity).length > 0)
          if (withIdentity.length > 0) {
            await runner.query(
              `INSERT INTO market_v2_row_identities (dataset_version, source_table, row_no, data)
               SELECT $1, $2, r.row_no, r.data FROM unnest($3::int[], $4::jsonb[]) AS r(row_no, data)
               ON CONFLICT DO NOTHING`,
              [
                load.version,
                load.table,
                withIdentity.map(r => r.rowNo),
                withIdentity.map(r => JSON.stringify(r.identity)),
              ],
            )
          }
          written += batch.length
        }
        const { read, rejected } = load.counts()
        await runner.query(
          `UPDATE market_v2_datasets
              SET file_sha256 = $3, rows_read = $4, rows_written = $5, rows_rejected = $6, loaded_at = now()
            WHERE dataset_version = $1 AND source_table = $2`,
          [load.version, load.table, load.fileSha256(), read, written, rejected],
        )
        await runner.commitTransaction()
        return { written }
      } catch (error) {
        await runner.rollbackTransaction()
        throw new Error(describePgError(error))
      } finally {
        await runner.release()
      }
    },
  }
}

/** Code SQLSTATE et contrainte seulement : `message`/`detail` d'une erreur Postgres peuvent citer une valeur. */
function describePgError(error: unknown): string {
  const e = (error ?? {}) as { code?: unknown; constraint?: unknown; name?: unknown }
  const code = typeof e.code === 'string' ? e.code : 'inconnu'
  const constraint = typeof e.constraint === 'string' ? ` (contrainte ${e.constraint})` : ''
  const name = typeof e.name === 'string' ? e.name : 'Error'
  return `${name} SQLSTATE ${code}${constraint}`
}
