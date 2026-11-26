import {
  TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS,
  TECHNO_PREVALENCE_TIERS,
  quantile,
  technoPrevalenceScaleRead,
  technoPrevalenceTier,
  type TechnoPrevalenceTier,
} from '@bellum/contracts'
import dataSource from '../database/data-source'
import { MarketCompanyStackEntity } from '../database/entities/market-company-stack.entity'

/**
 * #1638.2 — LE SEUL MOYEN DE SAVOIR SI LE PALIER DE PRÉVALENCE S'AFFICHERA
 * UN JOUR SUR LE CORPUS RÉEL.
 *
 *   pnpm --filter @bellum/api measure:techno-prevalence
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SCRIPT EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux bornes de l'échelle se CALCULENT (quantiles 1/3 et 2/3 de la
 * distribution du jour) : elles n'ont donc pas besoin d'être calibrées à la
 * main. Mais les quatre REFUS, eux, dépendent de la FORME de la distribution —
 * et cette forme n'a jamais été lue.
 *
 * Le risque que ce script mesure est précis, et il est le seul : si la
 * distribution des fréquences par technologie est fortement à égalités — ce que
 * font souvent les corpus à longue traîne — l'échelle est REFUSÉE, et le bloc
 * reste muet EN PRODUCTION sans que rien n'échoue nulle part. Un écran livré
 * mais vide se découvre en réunion, pas en CI.
 *
 * Le précédent est écrit dans ce dépôt : `measure-market-memory-cohort-index.ts`
 * a été lancé en lecture seule sur la production le 10/09/2026, et sa mesure a
 * tranché DANS L'AUTRE SENS que ce que tout le monde supposait (6,9 % des
 * lignes seulement portaient les deux colonnes, donc le verrou reste). Une
 * mesure jamais faite n'est pas une mesure rassurante.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LECTURE SEULE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune transaction, aucun `.save()` / `.insert()` / `.update()` : un seul
 * `GROUP BY` sur la table des piles observées, projeté sur deux colonnes. Il
 * peut tourner contre la production sans rien risquer d'autre que le temps de
 * la requête.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL VIT DANS `scripts/`, HORS DU PÉRIMÈTRE DE GA-258
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-258 ne balaie que `apps/api/src/modules/`, pas `src/scripts/` — et
 * `measure-market-memory-cohort-index.ts` a déjà ouvert exactement ce cas :
 * `MarketMemoryService` répond à « que sait-on de CETTE entreprise ? », jamais
 * à « quelle est la distribution de TOUT le corpus ? ». Un diagnostic en bloc,
 * hors du chemin produit, n'est pas une seconde vérité : il ne descend dans
 * aucun écran.
 */

/** Ce que la requête projette — la forme exacte lue en base (avant conversion). */
export interface StackFrequencyRow {
  readonly techno: string
  /** `count(...)` Postgres revient en `string` — jamais un nombre directement. */
  readonly companies: string
}

/**
 * La conversion pure DB → table des fréquences, testable sans base.
 *
 * Une ligne illisible est ÉCARTÉE, jamais comptée pour zéro : « on n'a pas su
 * lire » et « aucune entreprise » ne sont pas la même affirmation. Le compte
 * des lignes écartées est rendu à part, pour qu'il ne disparaisse pas.
 */
export function toFrequencyMap(rows: readonly StackFrequencyRow[]): {
  frequency: Map<string, number>
  unreadable: number
} {
  const frequency = new Map<string, number>()
  let unreadable = 0
  for (const row of rows) {
    const companies = Number(row.companies)
    const techno = row.techno.trim().toLowerCase()
    if (!techno || !Number.isFinite(companies) || companies <= 0) {
      unreadable += 1
      continue
    }
    // Le `GROUP BY` porte sur `lower(techno)` côté SQL, mais deux libellés
    // différant par un espace resteraient distincts : on additionne plutôt que
    // d'écraser, sinon la fréquence d'une techno serait celle de sa dernière
    // graphie seulement.
    frequency.set(techno, (frequency.get(techno) ?? 0) + companies)
  }
  return { frequency, unreadable }
}

export interface StackFrequencyReader {
  readFrequency(): Promise<{ rows: readonly StackFrequencyRow[] }>
}

/** Le lecteur RÉEL — une seule requête, projetée, lecture seule. */
export function createTypeOrmReader(): StackFrequencyReader {
  return {
    async readFrequency(): Promise<{ rows: readonly StackFrequencyRow[] }> {
      const rows = await dataSource
        .getRepository(MarketCompanyStackEntity)
        .createQueryBuilder('stack')
        .select('lower(stack.techno)', 'techno')
        .addSelect('COUNT(DISTINCT stack.company_key)', 'companies')
        .groupBy('lower(stack.techno)')
        .getRawMany<StackFrequencyRow>()
      return { rows }
    },
  }
}

function fmt(value: number | null): string {
  return value === null ? 'non mesuré' : String(Math.round(value * 10) / 10)
}

/**
 * Ce que rend le script — pur, testable sans base ni console.
 *
 * Les comptes par palier s'ADDITIONNENT jusqu'au nombre de technologies lues :
 * un seau qui manquerait rendrait une répartition silencieusement fausse.
 */
export function formatReport(frequency: ReadonlyMap<string, number>, unreadable: number): string[] {
  const lines: string[] = []
  const values = [...frequency.values()].sort((a, b) => a - b)

  lines.push(`technologies lues ${frequency.size}  lignes illisibles écartées ${unreadable}`)
  if (values.length === 0) {
    lines.push('Aucune technologie mesurable : le corpus des piles observées est vide ou illisible.')
    return lines
  }

  lines.push(
    `Fréquence (entreprises par technologie) — min ${fmt(values[0])}  p25 ${fmt(quantile(values, 0.25))}  ` +
      `médiane ${fmt(quantile(values, 0.5))}  p75 ${fmt(quantile(values, 0.75))}  ` +
      `p90 ${fmt(quantile(values, 0.9))}  max ${fmt(values[values.length - 1])}`,
  )

  const read = technoPrevalenceScaleRead(frequency)
  lines.push('')
  if (read.kind === 'refused') {
    lines.push(
      `ÉCHELLE REFUSÉE — ${read.reason} (sur ${read.distinctTechnos} technologie(s) mesurée(s), ` +
        `plancher ${TECHNO_PREVALENCE_MIN_DISTINCT_TECHNOS}).`,
    )
    lines.push(
      '⇒ Le bloc « contexte de marché » d’une preuve reste MUET sur ce corpus, et c’est volontaire : ' +
        'une majorité ne peut pas s’appeler « rare », et des bornes confondues ne font pas trois paliers.',
    )
    return lines
  }

  const { scale } = read
  lines.push(
    `Échelle CALCULÉE — rare ≤ ${fmt(scale.rareMax)}  spécialisée ≤ ${fmt(scale.specialiseeMax)}  ` +
      `courante au-delà  (sur ${scale.distinctTechnos} technologies).`,
  )

  const byTier = new Map<TechnoPrevalenceTier, number>(TECHNO_PREVALENCE_TIERS.map(tier => [tier, 0]))
  for (const value of values) {
    const tier = technoPrevalenceTier(value, scale)
    byTier.set(tier, (byTier.get(tier) ?? 0) + 1)
  }
  const counted = [...byTier.values()].reduce((sum, count) => sum + count, 0)
  lines.push(
    `Répartition — ${TECHNO_PREVALENCE_TIERS.map(tier => `${tier} ${byTier.get(tier) ?? 0}`).join('  ')}` +
      `  (total ${counted})`,
  )
  // Vérifié, jamais supposé : une répartition qui ne retombe pas sur ses pieds
  // se dit, plutôt que de passer pour une mesure.
  if (counted !== values.length) {
    lines.push(`⚠️ INCOHÉRENT — la somme des paliers (${counted}) ≠ technologies mesurées (${values.length})`)
  }
  return lines
}

async function main(): Promise<void> {
  await dataSource.initialize()
  let lines: string[]
  try {
    const { rows } = await createTypeOrmReader().readFrequency()
    console.log(`piles observées — ${rows.length} technologie(s) groupée(s) (lecture seule, aucune écriture).`)
    const { frequency, unreadable } = toFrequencyMap(rows)
    lines = formatReport(frequency, unreadable)
  } finally {
    await dataSource.destroy()
  }
  for (const line of lines) console.log(line)
}

// ⚠️ Même garde que `measure-market-memory-cohort-index.ts` : sans elle, un
// simple `import` depuis un test ouvrirait une VRAIE connexion Postgres.
if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
