/**
 * #3215 (recette prod 04/10) — « Est-ce que je peux ouvrir SG ? » rendait « fiche non
 * retrouvée » alors que « Société Générale » existe, active, dans l'espace.
 *
 * Le pont ne savait chercher qu'un `ILIKE %SG%` sur le nom : ni le SIGLE (les initiales
 * des mots significatifs), ni les accents (« Societe » ≠ « Société »), ni la forme
 * juridique. Cette résolution est PURE : elle classe des candidats déjà lus dans le
 * périmètre de l'appelant, elle ne lit rien et n'invente aucun compte.
 *
 * Deux règles qui ne se discutent pas :
 *  - un sigle rapproche des comptes, il n'en ancre aucun : plusieurs candidats sortent
 *    tous, dans l'ordre, et c'est à l'appelant de dire qu'il y en a plusieurs ;
 *  - une fiche ACTIVE passe devant une fiche archivée de même nom (#3490).
 */

const STOP_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'of', 'the', 'and', 'd', 'l'])
const LEGAL_FORMS = new Set([
  'sa',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'se',
  'snc',
  'sca',
  'scs',
  'spa',
  'gmbh',
  'ag',
  'plc',
  'ltd',
  'inc',
])
const INACTIVE_STATUSES = new Set(['archived', 'deleted'])

type NameResolutionCandidate = {
  company_name: string
  status?: string | null
  commercial_status?: string | null
}

type NameMatchKind = 'exact' | 'acronym' | 'prefix' | 'contains' | 'embedded'

const KIND_RANK: Record<NameMatchKind, number> = { exact: 0, acronym: 1, prefix: 2, contains: 3, embedded: 4 }

/** Sans accents, sans casse, sans ponctuation : « Société-Générale S.A. » → « societe generale sa ». */
export function foldName(value: string | null | undefined): string {
  return (
    (value ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // « S.A. », « S.G. » : les points entre lettres seules se recollent (« sa », « sg »).
      .replace(/\b([a-z0-9])\.(?=[a-z0-9]\b)/g, '$1')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  )
}

function significantTokens(folded: string): string[] {
  const tokens = folded.split(' ').filter(Boolean)
  const withoutLegalForms = tokens.filter(token => !LEGAL_FORMS.has(token))
  return (withoutLegalForms.length > 0 ? withoutLegalForms : tokens).filter(
    token => !STOP_WORDS.has(token) || tokens.length === 1,
  )
}

/** « Société Générale » → « sg ». Un nom d'un seul mot n'a pas de sigle. */
export function acronymOf(name: string): string | null {
  const tokens = significantTokens(foldName(name))
  return tokens.length >= 2 ? tokens.map(token => token[0]).join('') : null
}

export function isInactiveAccount(candidate: NameResolutionCandidate): boolean {
  return (
    INACTIVE_STATUSES.has(String(candidate.status ?? '')) ||
    INACTIVE_STATUSES.has(String(candidate.commercial_status ?? ''))
  )
}

function matchKind(query: string, candidate: NameResolutionCandidate): NameMatchKind | null {
  const foldedQuery = foldName(query)
  if (!foldedQuery) return null
  const foldedName = foldName(candidate.company_name)
  const queryTokens = significantTokens(foldedQuery).join(' ')
  const nameTokens = significantTokens(foldedName).join(' ')
  if (foldedName === foldedQuery || (queryTokens && queryTokens === nameTokens)) return 'exact'
  // Le sigle se tape sans espace ni point : « SG », « s.g. » → « sg ».
  const queryWords = foldedQuery.split(' ')
  const typedAcronym = queryWords.join('')
  const looksLikeAcronym = queryWords.length === 1 || queryWords.every(word => word.length === 1)
  if (typedAcronym.length >= 2 && looksLikeAcronym && acronymOf(candidate.company_name) === typedAcronym) {
    return 'acronym'
  }
  if (foldedName.startsWith(foldedQuery) || nameTokens.startsWith(queryTokens)) return 'prefix'
  if (foldedName.includes(foldedQuery)) return 'contains'
  // #3670 (recette prod 10/10, « Altran Technologies ») — la saisie est PLUS LONGUE que la fiche :
  // le nom du compte y figure comme MOTS ENTIERS (« Altran Technologies » ⊃ « Altran »). Au moins
  // cinq caractères : « SA », « Alt » ne ressemblent à rien, et jamais une sous-chaîne de mot.
  if (nameTokens.length >= 5 && ` ${foldedQuery} `.includes(` ${nameTokens} `)) return 'embedded'
  return null
}

/**
 * Les candidats qui répondent à `query`, du plus sûr au moins sûr : actifs avant archivés,
 * puis exact > sigle > début de nom > contient. Ordre stable à rang égal. Rien ne correspond
 * ⇒ `[]` — jamais un candidat deviné.
 */
export function resolveAccountsByName<T extends NameResolutionCandidate>(query: string, candidates: readonly T[]): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, kind: matchKind(query, candidate) }))
    .filter((entry): entry is { candidate: T; index: number; kind: NameMatchKind } => entry.kind !== null)
    .sort(
      (a, b) =>
        Number(isInactiveAccount(a.candidate)) - Number(isInactiveAccount(b.candidate)) ||
        KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
        a.index - b.index,
    )
    .map(entry => entry.candidate)
}
