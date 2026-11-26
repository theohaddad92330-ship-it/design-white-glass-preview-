import { toSignalLineDate, type SignalLineCandidate, type SignalLineOutcome } from '@bellum/contracts'
import { refineLineType } from './account-signal-lines.sources'

/**
 * Lot 794 (Louis 04/11/2026, « absolument tout rattaché, lié, accessible par n'importe quel angle ») — LES FAMILLES DU
 * PACK v2.1 (`market_v2_rows`, base commune) rattachées à un BM-A, devenues faits bruts des lignes de signaux.
 *
 * Inventaire (`scripts/market-v2/market-v2-schema.json`) : 70 tables portent un `account_id` BM-A non pii. Trois sont des
 * FAITS DATABLES d'un compte et deviennent des lignes : `needs` (3 452 besoins/missions, tous statuts), `signals` (600
 * projets, programmes, AO, M&A) et `job_postings` (213 offres). Les autres sont des agrégats, des scores, des fiches ou des
 * relations sans date de fait (`account_domains`, `esn_presence`, `tech_by_account`…) : elles se lisent ailleurs, elles ne
 * font pas de ligne. `job_postings_extra` redit `job_postings` (ses lignes `poste` y sont déjà) : non lue.
 *
 * Règles :
 *  · lecture de la DERNIÈRE version chargée de chaque table (`market_v2_datasets`), par `account_id = ANY(BM-A résolus)` —
 *    les BM-A viennent du résolveur lié à l'espace, jamais d'une saisie ;
 *  · colonnes ÉNUMÉRÉES : aucune qui nomme une personne (prescripteur, contact client, consultant) ni le coffre pii ;
 *    aucune source nommée (`source` n'est pas lu) ;
 *  · date : celle du fait, à défaut une autre colonne date de la MÊME ligne, à défaut la date où la table a été chargée
 *    (`observedAt`) — la ligne reste alors en Historique, à l'année : jamais jetée, jamais inventée ;
 *  · un montant n'est un TJM que si la source le dit (« TJM annoncé ») ; absent = absent, jamais 0.
 */

export const MARKET_V2_LINE_TABLES = ['needs', 'signals', 'job_postings'] as const
type MarketV2LineTable = (typeof MARKET_V2_LINE_TABLES)[number]

type Query = <R>(sql: string, params: unknown[]) => Promise<R[]>

/** Les seules clés lues dans `data` — toutes non pii dans le schéma du pack. */
const READ_KEYS = [
  'need_uid',
  'title',
  'technologies',
  'family',
  'date_publication',
  'date_start',
  'date_ref',
  'year',
  'source_date',
  'city_norm',
  'location_raw',
  'amount_eur',
  'amount_type',
  'outcome_raw',
  'is_duplicate',
  'entity_name',
  'signal_type',
  'description',
  'date',
  'horizon',
  'keywords',
  'source_url',
  'city',
  'contract',
] as const
type ReadKey = (typeof READ_KEYS)[number]

type V2Row = {
  source_table: MarketV2LineTable
  row_no: number
  account_id: string
  loaded_at: Date | string | null
  data: Partial<Record<ReadKey, string | null>>
}

/** Écrite en toutes lettres (la garde `market-v2-pii-never-read` lit chaque clé extraite). */
const PROJECTION = `jsonb_build_object(
  'need_uid', r.data->>'need_uid',
  'title', r.data->>'title',
  'technologies', r.data->>'technologies',
  'family', r.data->>'family',
  'date_publication', r.data->>'date_publication',
  'date_start', r.data->>'date_start',
  'date_ref', r.data->>'date_ref',
  'year', r.data->>'year',
  'source_date', r.data->>'source_date',
  'city_norm', r.data->>'city_norm',
  'location_raw', r.data->>'location_raw',
  'amount_eur', r.data->>'amount_eur',
  'amount_type', r.data->>'amount_type',
  'outcome_raw', r.data->>'outcome_raw',
  'is_duplicate', r.data->>'is_duplicate',
  'entity_name', r.data->>'entity_name',
  'signal_type', r.data->>'signal_type',
  'description', r.data->>'description',
  'date', r.data->>'date',
  'horizon', r.data->>'horizon',
  'keywords', r.data->>'keywords',
  'source_url', r.data->>'source_url',
  'city', r.data->>'city',
  'contract', r.data->>'contract'
)`

/** Un fait brut du pack et le BM-A qui le porte. */
export type MarketV2Fact = { bmAccountId: string; candidate: SignalLineCandidate }

function clean(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed === '' ? null : trimmed
}

/** Une liste interne du pack (`a|b|c`). */
function list(value: string | null | undefined): string[] {
  return (clean(value) ?? '')
    .split('|')
    .map(item => item.trim())
    .filter(item => item.length > 0)
}

/** La première date LISIBLE de la ligne, dans l'ordre donné. */
function firstDate(...values: Array<string | null | undefined>): string | null {
  for (const value of values) if (clean(value) && toSignalLineDate(value)) return clean(value)
  return null
}

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** L'issue BRUTE d'un besoin clos ; une issue non reconnue n'en devient pas une. */
function outcomeOf(raw: string | null | undefined): SignalLineOutcome | undefined {
  const value = fold(clean(raw) ?? '')
  if (/gagn|won|sign/.test(value)) return 'won'
  if (/perdu|lost/.test(value)) return 'lost'
  if (/abandon|supprim|expir|annul/.test(value)) return 'none'
  return undefined
}

function tjmOf(data: V2Row['data']): number | null {
  if (fold(clean(data.amount_type) ?? '') !== 'tjm annonce') return null
  const amount = Number((clean(data.amount_eur) ?? '').replace(',', '.'))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

/** La nature d'un signal du pack → le type de ligne, puis la règle unique de typage (`refineLineType`). */
function signalTypeOf(raw: string | null | undefined, title: string | null): SignalLineCandidate['type'] {
  const value = fold(clean(raw) ?? '')
  const base: SignalLineCandidate['type'] = /appel d.?offres|\bao\b/.test(value)
    ? 'marche_public'
    : /recrutement/.test(value)
      ? 'recrutement'
      : /reorganis|nomination/.test(value)
        ? 'equipe'
        : /projet|programme|transformation|investissement/.test(value)
          ? 'projet'
          : 'fait'
  return refineLineType(base, title)
}

function toFact(row: V2Row): MarketV2Fact | null {
  const data = row.data ?? {}
  const title = clean(data.title)
  const common = { entity: clean(data.entity_name), observedAt: row.loaded_at ?? null, title }
  switch (row.source_table) {
    case 'needs': {
      if (clean(data.is_duplicate) === '1') return null
      const outcome = outcomeOf(data.outcome_raw)
      return {
        bmAccountId: row.account_id,
        candidate: {
          ...common,
          key: `market-v2-need:${clean(data.need_uid) ?? row.row_no}`,
          type: 'besoin_passe',
          origin: 'memoire',
          rawDate: firstDate(data.date_publication, data.date_start, data.date_ref, data.year, data.source_date),
          detail: clean(data.family),
          ...(outcome ? { outcome } : {}),
          tjmEur: tjmOf(data),
          technologies: list(data.technologies),
          location: clean(data.city_norm) ?? clean(data.location_raw),
        },
      }
    }
    case 'signals': {
      const type = signalTypeOf(data.signal_type, title)
      return {
        bmAccountId: row.account_id,
        candidate: {
          ...common,
          key: `market-v2-signal:${row.row_no}`,
          type,
          origin: type === 'marche_public' ? 'marche' : type === 'recrutement' ? 'offre' : 'memoire',
          rawDate: firstDate(data.date, data.source_date, data.horizon),
          detail: clean(data.description),
          url: clean(data.source_url),
          technologies: list(data.keywords),
        },
      }
    }
    case 'job_postings':
      return {
        bmAccountId: row.account_id,
        candidate: {
          ...common,
          key: `market-v2-offer:${row.row_no}`,
          type: 'recrutement',
          origin: 'offre',
          rawDate: firstDate(data.date),
          detail: clean(data.family),
          url: clean(data.source_url),
          contractType: clean(data.contract),
          location: clean(data.city_norm) ?? clean(data.city),
        },
      }
    default:
      return null
  }
}

/**
 * Les faits du pack v2.1 des BM-A donnés, en UNE requête (le nombre de comptes n'y change rien). Aucun BM-A ⇒ aucune
 * lecture.
 */
export async function readMarketV2Facts(q: Query, bmAccountIds: readonly string[]): Promise<MarketV2Fact[]> {
  const ids = [...new Set(bmAccountIds.filter(id => /^BM-A-\d+$/.test(id)))]
  if (ids.length === 0) return []
  const rows = await q<V2Row>(
    `WITH latest AS (
       SELECT DISTINCT ON (source_table) source_table, dataset_version, loaded_at
         FROM market_v2_datasets
        WHERE source_table = ANY($2::text[])
        ORDER BY source_table, loaded_at DESC
     )
     SELECT r.source_table, r.row_no, r.account_id, l.loaded_at, ${PROJECTION} AS data
       FROM market_v2_rows r
       JOIN latest l ON l.source_table = r.source_table AND l.dataset_version = r.dataset_version
      WHERE r.account_id = ANY($1::text[]) AND r.source_table = ANY($2::text[])`,
    [ids, [...MARKET_V2_LINE_TABLES]],
  )
  return rows.map(toFact).filter((fact): fact is MarketV2Fact => fact !== null)
}
