import type { MarketBrief } from '../schemas/market-brief.js'

/**
 * Contrôles MÉTIER du brief d'un marché local (capacité « Marchés locaux »,
 * 04/10/2026, lot L0). Le schéma zod tient la FORME ; ces fonctions PURES tiennent
 * ce qu'une forme valide peut encore mentir :
 *
 * - `SCOPE_MIXED` : France et Suisse mêlées dans une même zone (D4) ;
 * - `CURRENCY_SCOPE` : une zone française se chiffre en EUR, une zone suisse en CHF ;
 * - `PRICE_CELL_UNDERSAMPLED` : n < 3 ⇒ la cellule est ABSENTE, jamais un zéro ;
 * - `PRICE_GRID_CONCENTRATED_UNSAID` : un client fait plus de la moitié de
 *   l'échantillon ⇒ un garde-fou doit le NOMMER (« la grille reflète d'abord ADEO ») ;
 * - `COVERAGE_AS_MARKET` (GA-259) : un taux de couverture mesure ce qu'on SAIT,
 *   jamais ce que le marché FAIT ;
 * - `PROBABILITY_WORDING` (doctrine c26) : aucune probabilité, aucune chance de signer.
 *
 * AUCUN contrôle anti-personnes (D5) : les personnes sont en clair, avec leur
 * employeur. Les contrôles tournent aussi sur un brief NON parsé : chaque lecture
 * est défensive.
 */

export type MarketBriefViolationCode =
  | 'SCOPE_MIXED'
  | 'CURRENCY_SCOPE'
  | 'PRICE_CELL_UNDERSAMPLED'
  | 'PRICE_GRID_CONCENTRATED_UNSAID'
  | 'COVERAGE_AS_MARKET'
  | 'PROBABILITY_WORDING'

type MarketBriefViolation = { code: MarketBriefViolationCode; path: string; message: string }

/** En dessous, une cellule de prix n'est pas un chiffre : c'est une anecdote. */
const MIN_CELL_SAMPLE = 3
/** Au-delà de cette part, un seul client fait la grille. */
const CONCENTRATION_THRESHOLD = 0.5

/**
 * GA-259 : mêmes racines que `market-coverage-is-not-outsourcing.test.ts`
 * (« externalis », « externaliz », « sous-trait », « outsourc »).
 */
const OUTSOURCING_ROOTS = ['externalis', 'externaliz', 'sous-trait', 'sous trait', 'outsourc'] as const

/** Doctrine c26 : écrit sous forme normalisée (minuscules, sans accents), comparé en sous-chaîne. */
const PROBABILITY_TERMS = [
  'probabilite',
  'probability',
  'proba de',
  'chance de closing',
  'chances de closing',
  'chance de signer',
  'chances de signer',
  'chance de signature',
  'chance de gagner',
  'chances de gagner',
  'closing chance',
  'win chance',
  'likelihood to close',
  'taux de reussite estime',
  'previsionnel pondere',
  'weighted forecast',
] as const

type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
type LooseBrief = DeepPartial<MarketBrief>

const fold = (value: string): string => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Minuscules, sans accents, toute ponctuation → un espace. */
const norm = (value: unknown): string =>
  typeof value === 'string'
    ? fold(value)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : ''

const v = (code: MarketBriefViolationCode, path: string, message: string): MarketBriefViolation => ({
  code,
  path,
  message,
})

const INSEE_DEPARTMENT = /^(\d{2,3}|2[AB])$/
const CANTON = /^[A-Z]{2}$/

const checkScope = (b: LooseBrief): MarketBriefViolation[] => {
  const zone = b.zone
  if (!zone) return []
  const departments = zone.departments ?? []
  const cantons = zone.cantons ?? []
  const out: MarketBriefViolation[] = []
  if (zone.scope === 'france' && cantons.length > 0) {
    out.push(
      v('SCOPE_MIXED', 'zone.cantons', 'Une zone france ne porte aucun canton : France et Suisse ne se mêlent pas.'),
    )
  }
  if (zone.scope === 'suisse' && departments.length > 0) {
    out.push(
      v(
        'SCOPE_MIXED',
        'zone.departments',
        'Une zone suisse ne porte aucun département : France et Suisse ne se mêlent pas.',
      ),
    )
  }
  // Un sigle de canton rangé parmi les départements (ou l'inverse) : le mélange se cache dans la valeur.
  departments.forEach((code, i) => {
    if (typeof code === 'string' && CANTON.test(code) && !INSEE_DEPARTMENT.test(code)) {
      out.push(v('SCOPE_MIXED', `zone.departments[${i}]`, `« ${code} » est un sigle de canton, pas un département.`))
    }
  })
  cantons.forEach((code, i) => {
    if (typeof code === 'string' && INSEE_DEPARTMENT.test(code)) {
      out.push(v('SCOPE_MIXED', `zone.cantons[${i}]`, `« ${code} » est un code de département, pas un canton.`))
    }
  })
  return out
}

const checkCurrency = (b: LooseBrief): MarketBriefViolation[] => {
  const scope = b.zone?.scope
  const currency = b.price_grid?.currency
  const expected = scope === 'france' ? 'EUR' : scope === 'suisse' ? 'CHF' : undefined
  return expected && currency && currency !== expected
    ? [v('CURRENCY_SCOPE', 'price_grid.currency', `Une zone ${scope} se chiffre en ${expected}, pas en ${currency}.`)]
    : []
}

const SENIORITIES = ['junior', 'confirmed', 'senior'] as const

const checkCells = (b: LooseBrief): MarketBriefViolation[] =>
  (b.price_grid?.rows ?? []).flatMap((row, r) =>
    SENIORITIES.flatMap(level => {
      const cell = row?.[level]
      if (!cell) return []
      const n = typeof cell.n === 'number' ? cell.n : 0
      return n < MIN_CELL_SAMPLE
        ? [
            v(
              'PRICE_CELL_UNDERSAMPLED',
              `price_grid.rows[${r}].${level}`,
              `« ${row?.family ?? '?'} » (${level}) : n=${n} < ${MIN_CELL_SAMPLE}, la cellule doit être absente, jamais affichée.`,
            ),
          ]
        : []
    }),
  )

const checkConcentration = (b: LooseBrief): MarketBriefViolation[] => {
  const grid = b.price_grid
  const top = grid?.top_client
  const sample = grid?.sample_size
  if (!top?.name || typeof top.n !== 'number' || typeof sample !== 'number' || sample <= 0) return []
  if (top.n / sample <= CONCENTRATION_THRESHOLD) return []
  const name = norm(top.name)
  const said = (b.guardrails ?? []).some(g => ` ${norm(`${g?.point ?? ''} ${g?.detail ?? ''}`)} `.includes(` ${name} `))
  return said
    ? []
    : [
        v(
          'PRICE_GRID_CONCENTRATED_UNSAID',
          'price_grid.top_client',
          `« ${top.name} » fait ${top.n} besoins sur ${sample} : un garde-fou doit dire que la grille le reflète d'abord.`,
        ),
      ]
}

/**
 * Tous les textes du brief avec leur chemin — SAUF les garde-fous, qui NOMMENT
 * l'interdit (« ne jamais lire 59 % comme… ») et ne sont pas un fait affirmé.
 */
const textsOf = (value: unknown, path: string, out: [string, string][] = []): [string, string][] => {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((item, i) => textsOf(item, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    // Un KPI sépare son libellé (« Sous-traitance ») de sa valeur (« 59 % ») : la
    // phrase fautive n'existe qu'une fois les champs scalaires d'un objet réunis.
    const scalars = Object.values(value).filter(c => typeof c === 'string' || typeof c === 'number')
    if (path && scalars.length > 1) out.push([path, scalars.join(' ')])
    for (const [key, child] of Object.entries(value)) {
      if (!path && key === 'guardrails') continue
      textsOf(child, path ? `${path}.${key}` : key, out)
    }
  }
  return out
}

const PERCENT = /\d\s*(%|pourcent|percent)|\bpour\s*cent\b|\bsur\s+(dix|10)\b/i

const checkCoverage = (b: LooseBrief): MarketBriefViolation[] =>
  textsOf(b, '').flatMap(([path, text]) => {
    const folded = fold(text)
    const root = OUTSOURCING_ROOTS.find(r => folded.includes(r))
    return root && PERCENT.test(folded)
      ? [
          v(
            'COVERAGE_AS_MARKET',
            path,
            `« ${text} » lit un taux de couverture comme un fait de marché (${root}…) : dire « parmi les profils observés ».`,
          ),
        ]
      : []
  })

const checkProbability = (b: LooseBrief): MarketBriefViolation[] =>
  textsOf(b, '').flatMap(([path, text]) => {
    const normalised = ` ${norm(text)} `
    const term = PROBABILITY_TERMS.find(t => normalised.includes(` ${t} `) || normalised.includes(` ${t}`))
    return term
      ? [
          v(
            'PROBABILITY_WORDING',
            path,
            `« ${text} » énonce une probabilité (${term}) : le produit n'en affiche aucune.`,
          ),
        ]
      : []
  })

/** Toutes les violations métier d'un brief de marché ; `[]` = brief publiable. */
export const checkMarketBrief = (brief: MarketBrief): MarketBriefViolation[] => {
  const b = brief as LooseBrief
  return [
    ...checkScope(b),
    ...checkCurrency(b),
    ...checkCells(b),
    ...checkConcentration(b),
    ...checkCoverage(b),
    ...checkProbability(b),
  ]
}
