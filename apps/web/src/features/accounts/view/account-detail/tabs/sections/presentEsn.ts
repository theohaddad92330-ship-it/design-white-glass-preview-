import {
  esnObservedPathsRange,
  type AccountIntelligenceIncumbent,
  type AccountIntelligenceSource,
  type CommercialBrief,
  type EsnObservedPathsRange,
  type MarketEsnObserved,
} from '@bellum/contracts'

/**
 * K.2 / #4323 (Louis 19/10/2026, call refonte UX) — UNE SEULE liste des ESN présentes sur le compte.
 *
 * Le brief (« ESN en place »), le contexte canonique (« Qui est déjà en place ») et l'historique observé
 * (« Sociétés de services observées ») disaient chacun une partie du même fait : « Deux ESN confirmées »
 * en haut, dix « ex-ESN » plus bas, un texte qui en cite davantage — deux chiffres qui se contredisaient.
 * Fusionnées ici par NOM, une ligne par société, avec son niveau de preuve en trois mots — déclaré,
 * observé, déduit — et sa date.
 *
 * ⚠️ Le rapprochement par nom est VOLONTAIREMENT conservateur (accents, casse, espaces seulement — même
 * règle que `corroboratingPaths`) : « Groupe SII » et « SII » restent DEUX lignes plutôt que de fusionner
 * deux sociétés qui partagent un mot. Un doublon d'affichage coûte une ligne ; une fusion à tort affirme
 * un fait faux.
 *
 * ⚠️ Aucune date inventée : une ligne dont aucune source ne date la présence garde `date: null`, et
 * l'écran le DIT. Aucun nom de fournisseur : seule la preuve (déclaré/observé/déduit) se nomme.
 */
type PresentEsnEvidence = 'declared' | 'observed' | 'deduced'

interface PresentEsnRow {
  name: string
  evidence: PresentEsnEvidence
  /** La date la plus récente parmi les sources de la ligne, ISO — `null` si aucune ne date la présence. */
  date: string | null
  proof: string | null
  perimeter: string | null
  contractType: string | null
  strengths: string | null
  weaknesses: string | null
  /** Parcours qui corroborent ce nom (fourchette sous le seuil) — `null` quand la mémoire ne dit rien. */
  paths: EsnObservedPathsRange | null
  /** RV4-E-FIX 4295.21 — la base d'une ESN DÉDUITE (prior de la base de référence, parcours d'ailleurs, indice) :
   *  elle se badge « estimé ». `null` quand la ligne est déclarée ou observée chez ce compte. */
  estimateSource: EstimateSource | null
}

const EVIDENCE_RANK: Record<PresentEsnEvidence, number> = { declared: 3, observed: 2, deduced: 1 }

const BRIEF_EVIDENCE: Record<CommercialBrief['esn'][number]['evidence_level'], PresentEsnEvidence> = {
  confirmed: 'declared',
  observed: 'observed',
  hint: 'deduced',
}

/** Ce que l'espace tient pour vrai ou a corrigé → déclaré ; ce qu'une collecte a vu → observé ; un indice → déduit. */
function incumbentEvidence(source: AccountIntelligenceSource): PresentEsnEvidence {
  switch (source) {
    case 'human_correction':
    case 'current_data':
    case 'registry_identity':
    case 'connected_tools':
      return 'declared'
    case 'inference':
      return 'deduced'
    // RV4-E-FIX 4295.21 — un prior de la base de référence et un parcours vu AILLEURS ne sont pas observés
    // chez ce compte : même partage que `intelligenceEstimateKind` (une seule définition de « déduit »).
    case 'dataforge':
    case 'market_memory':
      return 'deduced'
    case 'public_sources':
      return 'observed'
  }
}

function nameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function latest(a: string | null, b: string | null): string | null {
  if (a === null) return b
  if (b === null) return a
  return Date.parse(b) > Date.parse(a) ? b : a
}

type EstimateSource = Extract<AccountIntelligenceSource, 'inference' | 'market_memory' | 'dataforge'>

const ESTIMATE_SOURCES: ReadonlySet<AccountIntelligenceSource> = new Set(['inference', 'market_memory', 'dataforge'])

const blank = (name: string): PresentEsnRow => ({
  name,
  evidence: 'deduced',
  date: null,
  proof: null,
  perimeter: null,
  contractType: null,
  strengths: null,
  weaknesses: null,
  paths: null,
  estimateSource: null,
})

export function mergePresentEsn(input: {
  brief: CommercialBrief['esn']
  briefDate: string | null
  incumbents: readonly AccountIntelligenceIncumbent[] | null
  incumbentSource: { source: AccountIntelligenceSource; observedAt: string | null } | null
  observed: readonly MarketEsnObserved[] | undefined
}): PresentEsnRow[] {
  const rows = new Map<string, PresentEsnRow>()
  const rowFor = (name: string): PresentEsnRow => {
    const key = nameKey(name)
    const known = rows.get(key)
    if (known) return known
    const created = blank(name.trim())
    rows.set(key, created)
    return created
  }
  const raise = (row: PresentEsnRow, evidence: PresentEsnEvidence, date: string | null) => {
    if (EVIDENCE_RANK[evidence] > EVIDENCE_RANK[row.evidence]) row.evidence = evidence
    row.date = latest(row.date, date)
  }

  for (const item of input.brief) {
    if (nameKey(item.name) === '') continue
    const row = rowFor(item.name)
    // La première ligne écrite par le brief donne le nom d'affichage.
    row.proof = row.proof ?? item.proof
    row.perimeter = row.perimeter ?? item.perimeter ?? null
    raise(row, BRIEF_EVIDENCE[item.evidence_level], input.briefDate)
  }

  for (const incumbent of input.incumbents ?? []) {
    if (nameKey(incumbent.name) === '' || !input.incumbentSource) continue
    const row = rowFor(incumbent.name)
    row.contractType = row.contractType ?? incumbent.contractType
    row.strengths = row.strengths ?? incumbent.strengths
    row.weaknesses = row.weaknesses ?? incumbent.weaknesses
    raise(row, incumbentEvidence(input.incumbentSource.source), input.incumbentSource.observedAt)
  }

  for (const entry of input.observed ?? []) {
    if (nameKey(entry.esnName) === '') continue
    const row = rowFor(entry.esnName)
    row.paths = esnObservedPathsRange(entry.persons)
    raise(row, 'observed', null)
  }

  // RV4-E-FIX 4295.21 — une ligne qui reste DÉDUITE se badge « estimé », avec sa base : celle de l'ESN en place si
  // c'est un prior, sinon l'indice du brief (inférence).
  const incumbentBase =
    input.incumbentSource && ESTIMATE_SOURCES.has(input.incumbentSource.source)
      ? (input.incumbentSource.source as EstimateSource)
      : null
  for (const row of rows.values()) {
    if (row.evidence === 'deduced') row.estimateSource = incumbentBase ?? 'inference'
  }

  return [...rows.values()].sort(
    (a, b) =>
      EVIDENCE_RANK[b.evidence] - EVIDENCE_RANK[a.evidence] ||
      (b.paths?.kind === 'exact' ? b.paths.count : 0) - (a.paths?.kind === 'exact' ? a.paths.count : 0) ||
      a.name.localeCompare(b.name),
  )
}

/** Mots d'enveloppe qui ne distinguent pas une société d'une autre : « Groupe SII » et « SII » sont la même enseigne. */
const ENVELOPE_WORDS: ReadonlySet<string> = new Set([
  'groupe',
  'group',
  'france',
  'sa',
  'sas',
  'sasu',
  'sarl',
  'se',
  'ltd',
  'inc',
  'gmbh',
])

function coreKey(name: string): string {
  return nameKey(name)
    .split(/[^a-z0-9]+/)
    .filter(word => word !== '' && !ENVELOPE_WORDS.has(word))
    .join(' ')
}

/**
 * #4323 — on PROPOSE la fusion, on ne la fait pas : deux lignes dont le nom ne diffère que par un mot d'enveloppe
 * (« Groupe SII » / « SII ») sont signalées l'une à l'autre. Rien n'est écrit ni fusionné ; deux sociétés qui
 * partagent seulement un mot (« Groupe Open » / « Groupe SII ») ne sont jamais proposées. Clé = nom d'affichage.
 */
export function probableSameEsn(rows: readonly PresentEsnRow[]): Record<string, string[]> {
  const byCore = new Map<string, string[]>()
  for (const row of rows) {
    const core = coreKey(row.name)
    if (core === '') continue
    byCore.set(core, [...(byCore.get(core) ?? []), row.name])
  }
  const proposals: Record<string, string[]> = {}
  for (const names of byCore.values()) {
    if (names.length < 2) continue
    for (const name of names) proposals[name] = names.filter(other => other !== name)
  }
  return proposals
}

const EX_ESN_MENTION = /(^|[^a-z])ex[\s-]?esn([^a-z]|$)/

/**
 * #4323.4 — une rubrique du brief (« ACHATS : 10 profils ex-ESN identifiés ») compte des PERSONNES passées par une ESN ;
 * la liste unique compte des SOCIÉTÉS. Sans le dire, « 17 » et « 10 » se lisent comme deux totaux qui se contredisent.
 */
export function mentionsExEsnProfiles(rows: readonly { rubric: string; known: string; meaning: string }[]): boolean {
  return rows.some(row => EX_ESN_MENTION.test(nameKey(`${row.rubric} ${row.known} ${row.meaning}`)))
}
