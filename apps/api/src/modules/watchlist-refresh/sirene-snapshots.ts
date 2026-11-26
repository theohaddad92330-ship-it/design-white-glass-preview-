import { IsNull, Not, type Repository } from 'typeorm'
import type { SireneSnapshotEntity } from '../../database/entities/public-registry.entity'

/**
 * #3921.a / #3921.b — lecture et écriture des relevés Sirene (`sirene_snapshots`).
 *
 * Isolées de `public-registry-watch.ts` pour une raison précise : ce fichier-là
 * écrit AUSSI dans `esn_directory` (le risque), et la garde `unwritten-columns`
 * lit chaque affectation d'un écrivain du référentiel comme une écriture de
 * SES colonnes — `establishments` d'un relevé y passerait pour la colonne
 * homonyme du référentiel, que rien n'écrit.
 */

type SnapshotEstablishment = NonNullable<SireneSnapshotEntity['establishments']>[number]

/** Le dernier relevé qui porte des établissements — le « hier » de la comparaison. */
export async function latestEstablishmentsReading(
  repo: Repository<SireneSnapshotEntity>,
  siren: string,
): Promise<SnapshotEstablishment[] | null> {
  const latest = await repo.findOne({ where: { siren, establishments: Not(IsNull()) }, order: { observed_on: 'DESC' } })
  return latest?.establishments ?? null
}

/** Le dernier relevé qui porte une tranche d'effectif MESURÉE — le point de
 *  comparaison du signal `headcount_change` (#3921, décision Louis 13/10/2026).
 *  `null` tant qu'aucun relevé antérieur n'a mesuré de tranche : rien à comparer. */
export async function latestHeadcountReading(
  repo: Repository<SireneSnapshotEntity>,
  siren: string,
): Promise<{ observedOn: string; headcountRange: string } | null> {
  const latest = await repo.findOne({
    where: { siren, headcount_range: Not(IsNull()) },
    order: { observed_on: 'DESC' },
  })
  return latest?.headcount_range ? { observedOn: latest.observed_on, headcountRange: latest.headcount_range } : null
}

/** Le relevé du jour, une ligne par (SIREN, jour). Une tranche déjà mesurée ce
 *  jour-là n'est jamais effacée par une lecture qui n'en rend pas. */
export async function writeDailyReading(
  repo: Repository<SireneSnapshotEntity>,
  reading: { siren: string; day: string; headcountRange: string | null; list: readonly SnapshotEstablishment[] },
): Promise<void> {
  await repo.query(
    `INSERT INTO sirene_snapshots (siren, observed_on, source, headcount_range, establishments)
     VALUES ($1, $2::date, 'registry_watch', $3, $4::jsonb)
     ON CONFLICT (siren, observed_on) DO UPDATE
       SET headcount_range = COALESCE(EXCLUDED.headcount_range, sirene_snapshots.headcount_range),
           establishments = EXCLUDED.establishments,
           source = 'registry_watch',
           collected_at = now()`,
    [reading.siren, reading.day, reading.headcountRange, JSON.stringify(reading.list)],
  )
}
