import {
  buildCohortIndexReport,
  COHORT_INDEX_EXCLUSION_REASONS,
  MARKET_MEMORY_COHORT_INDEX_BUCKETS,
  quantile,
  type CohortIndexClassification,
  type CohortIndexReport,
  type CohortIndexSignal,
} from '@bellum/contracts'
import dataSource from '../database/data-source'
import { MarketCompanySignalEntity } from '../database/entities/market-company-signal.entity'

/**
 * #1613 / #1640 — LE SEUL MOYEN DE LIRE L'INDEX D'EXTERNALISATION COHORTE
 * SUR DES DONNÉES RÉELLES, TANT QUE `MARKET_MEMORY_SCORING_ENABLED` EST À `false`.
 *
 *   pnpm --filter @bellum/api measure:market-memory-cohort-index
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LECTURE SEULE — CE QUE ÇA VEUT DIRE ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce script n'ouvre AUCUNE transaction et n'appelle jamais `.save()` / `.insert()`
 * / `.update()` — une seule requête `SELECT` sur `market_company_signal`, projetée
 * sur les quatre colonnes dont {@link buildCohortIndexReport} a besoin. Il peut
 * tourner contre une base de production sans rien risquer d'autre que le temps
 * de la requête.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS `scripts/`, HORS DU PÉRIMÈTRE DE GA-258
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-258 (`market-memory-single-source-of-truth.spec.ts`) interdit à tout
 * fichier hors de `apps/api/src/modules/market-memory/` d'importer une entité
 * de la mémoire marché — mais elle ne balaie que `apps/api/src/modules/`
 * (`const MODULES = join(__dirname, '..', 'modules')`), pas `src/scripts/`.
 * `ingest-market-memory.ts` importe déjà `MarketCompanySignalEntity` depuis ce
 * même dossier, pour ÉCRIRE ; ce script fait le même choix pour LIRE en bloc —
 * un usage que `MarketMemoryService` ne rend pas : ses méthodes répondent à
 * « que sait-on de CETTE entreprise ? », jamais à « quelle est la distribution
 * de TOUTES les entreprises ? ». Un diagnostic bulk day one, en dehors du
 * chemin produit, est exactement le cas que l'ingestion avait déjà ouvert.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL AFFICHE, ET POURQUOI CHAQUE COMPTE EST UTILE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. lues / calculables / écartées (les cinq raisons NOMMÉES) — la mesure
 *    jamais faite (`SELECT count(*), count(externalization_score),
 *    count(headcount_bracket) FROM market_company_signal`, citée dans le
 *    brief du lot) devient enfin lisible, décomposée.
 * 2. la distribution du score BRUT, PAR COHORTE (tranche d'effectif) —
 *    médiane / p25 / p75 — pour voir si les cohortes ont seulement quelques
 *    dizaines de pairs ou plusieurs milliers.
 * 3. la distribution de l'INDEX NORMALISÉ, sur les entreprises calculables —
 *    et un aperçu PROVISOIRE de {@link MARKET_MEMORY_COHORT_INDEX_BUCKETS}
 *    appliqués tels quels : PAS une recommandation, un point de départ pour
 *    la calibration.
 */

/** Ce que la requête projette — la forme exacte lue en base (avant conversion). */
export interface SignalRow {
  readonly companyKey: string
  readonly headcountBracket: string | null
  readonly pathsTotal: number
  /** `numeric` Postgres revient en `string` — jamais un nombre directement. */
  readonly externalizationScore: string | null
}

/**
 * La conversion pure DB → domaine — testable sans base.
 *
 * Un score illisible (`Number(...)` qui rend `NaN`) devient `null`, jamais un
 * `0` inventé : « on n'a pas su lire » et « le corpus dit zéro » ne sont pas
 * la même affirmation.
 */
export function toCohortIndexSignal(row: SignalRow): CohortIndexSignal {
  const parsed = row.externalizationScore === null ? null : Number(row.externalizationScore)
  return {
    companyKey: row.companyKey,
    headcountBracket: row.headcountBracket,
    pathsTotal: row.pathsTotal,
    externalizationScore: parsed === null || Number.isNaN(parsed) ? null : parsed,
  }
}

export interface CohortIndexRowReader {
  readSignals(): Promise<readonly CohortIndexSignal[]>
}

/** Le lecteur RÉEL — une seule requête, projetée, lecture seule. */
export function createTypeOrmReader(): CohortIndexRowReader {
  return {
    async readSignals(): Promise<readonly CohortIndexSignal[]> {
      const rows = await dataSource
        .getRepository(MarketCompanySignalEntity)
        .createQueryBuilder('signal')
        .select([
          'signal.companyKey AS "companyKey"',
          'signal.headcountBracket AS "headcountBracket"',
          'signal.pathsTotal AS "pathsTotal"',
          'signal.externalizationScore AS "externalizationScore"',
        ])
        .getRawMany<SignalRow>()
      return rows.map(toCohortIndexSignal)
    },
  }
}

function fmt(value: number | null): string {
  return value === null ? 'non mesuré' : String(Math.round(value * 10) / 10)
}

/** Formate le rapport en lignes de texte — pur, testable sans base ni console. */
export function formatReport(report: CohortIndexReport): string[] {
  const lines: string[] = []
  const excludedTotal = Object.values(report.counts.excluded).reduce((sum, count) => sum + count, 0)

  lines.push(`lues ${report.counts.read}  calculables ${report.counts.calculable}  écartées ${excludedTotal}`)
  // ⚠️ Vérifié, jamais supposé : si un futur changement casse l'exhaustivité
  // des cinq raisons, ce message apparaît au lieu d'un compte silencieusement faux.
  if (report.counts.calculable + excludedTotal !== report.counts.read) {
    lines.push(
      `⚠️ INCOHÉRENT — calculables (${report.counts.calculable}) + écartées (${excludedTotal}) ≠ lues (${report.counts.read})`,
    )
  }
  for (const reason of COHORT_INDEX_EXCLUSION_REASONS) {
    lines.push(`  écarté ${reason.padEnd(24)} ${report.counts.excluded[reason]}`)
  }

  lines.push('')
  lines.push('Score BRUT (0-100, AVANT normalisation), par cohorte — tranche d’effectif :')
  const byBracket = [...report.byBracket].sort((a, b) => b.measuredPeers - a.measuredPeers)
  if (byBracket.length === 0) {
    lines.push('  aucune cohorte mesurable.')
  }
  for (const bracket of byBracket) {
    lines.push(
      `  ${bracket.bracket.padEnd(16)} pairs ${String(bracket.measuredPeers).padStart(5)}  ` +
        `médiane ${fmt(bracket.median)}  p25 ${fmt(bracket.p25)}  p75 ${fmt(bracket.p75)}`,
    )
  }

  const isCalculable = (
    entry: CohortIndexClassification,
  ): entry is Extract<CohortIndexClassification, { kind: 'calculable' }> => entry.kind === 'calculable'
  const indices = report.classifications
    .filter(isCalculable)
    .map(entry => entry.result.index)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b)

  lines.push('')
  lines.push(`Distribution de l’INDEX NORMALISÉ, sur ${indices.length} entreprise(s) calculable(s) :`)
  if (indices.length === 0) {
    lines.push('  aucune — pas assez de données réelles pour calculer un seul index avec les réglages actuels.')
    return lines
  }
  lines.push(
    `  p10 ${fmt(quantile(indices, 0.1))}  p25 ${fmt(quantile(indices, 0.25))}  ` +
      `médiane ${fmt(quantile(indices, 0.5))}  p75 ${fmt(quantile(indices, 0.75))}  p90 ${fmt(quantile(indices, 0.9))}`,
  )

  const forte = indices.filter(value => value >= MARKET_MEMORY_COHORT_INDEX_BUCKETS.forteMin).length
  const moyenne = indices.filter(
    value =>
      value >= MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin && value < MARKET_MEMORY_COHORT_INDEX_BUCKETS.forteMin,
  ).length
  const faible = indices.filter(value => value < MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin).length
  lines.push(
    `  aperçu PROVISOIRE, seuils non calibrés (Forte ≥ ${MARKET_MEMORY_COHORT_INDEX_BUCKETS.forteMin}, ` +
      `Moyenne ≥ ${MARKET_MEMORY_COHORT_INDEX_BUCKETS.moyenneMin}) — ` +
      `Forte ${forte}  Moyenne ${moyenne}  Faible ${faible}  (ceci n'est PAS un affichage produit — ` +
      `MARKET_MEMORY_SCORING_ENABLED reste false)`,
  )
  return lines
}

async function main(): Promise<void> {
  await dataSource.initialize()
  let report: CohortIndexReport
  try {
    const reader = createTypeOrmReader()
    const signals = await reader.readSignals()
    console.log(`market_company_signal — ${signals.length} lignes lues (lecture seule, aucune écriture).`)
    report = buildCohortIndexReport(signals)
  } finally {
    await dataSource.destroy()
  }
  for (const line of formatReport(report)) console.log(line)
}

// ⚠️ Gardé par `require.main === module`, contrairement à `ingest-market-memory.ts`
// dont l'appel inconditionnel n'est sans risque que par coïncidence (son
// premier garde-fou — l'absence d'un dossier de pack valide dans `process.argv`
// — échoue toujours avant d'ouvrir la base quand le fichier est simplement
// IMPORTÉ par un test). Ce script n'a pas cet argument positionnel pour le
// protéger : sans cette garde explicite, `import './measure-market-memory-
// cohort-index'` depuis un test ouvrirait une VRAIE connexion Postgres.
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
