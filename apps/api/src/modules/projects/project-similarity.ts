/**
 * « Comparer à un besoin similaire sur un autre compte » (restitution V2 §7) —
 * the DETERMINISTIC half of the comparison.
 *
 * No model, no embedding, no invention: two needs are related when they share
 * significant words. The scoring is a plain Jaccard overlap over the terms of
 * `label` + `offer`, with a small bonus when both needs are of the same nature
 * (`kind`). Everything shown to the rep — the score AND the shared terms — comes
 * out of this file, so a match can always be explained by pointing at the words
 * that produced it.
 *
 * Kept free of NestJS/TypeORM on purpose: the ranking is the risky part and it is
 * unit-tested without a database.
 */

/**
 * Words that carry no discriminating meaning in a need label. Two needs sharing
 * only « projet » or « plateforme » are not similar — they are both IT. FR + EN,
 * accents already stripped by {@link normalize}.
 */
const STOPWORDS = new Set([
  'aux',
  'avec',
  'business',
  'chez',
  'dans',
  'data',
  'des',
  'donnee',
  'donnees',
  'entreprise',
  'est',
  'for',
  'gestion',
  'groupe',
  'informatique',
  'les',
  'leur',
  'management',
  'metier',
  'metiers',
  'mise',
  'nouveau',
  'nouvelle',
  'outil',
  'outils',
  'par',
  'plateforme',
  'plateformes',
  'plus',
  'pour',
  'programme',
  'projet',
  'projets',
  'service',
  'services',
  'solution',
  'solutions',
  'son',
  'sur',
  'systeme',
  'systemes',
  'the',
  'their',
  'une',
  'with',
])

/** Lowercase, strip accents — so « données » and « donnees » are one word. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * The words of a need that are worth comparing: at least 3 characters, not a
 * stopword, not a bare number. Two-letter tokens survive ONLY when they were
 * written in capitals in the source (« RH », « SI », « BI ») — an uppercase pair
 * is an acronym a rep searches on, a lowercase pair is « de » or « la ».
 * Deduplicated, order preserved (first occurrence) so the justification reads in
 * the order the rep read the need.
 */
export function significantTerms(...texts: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const terms: string[] = []
  for (const text of texts) {
    if (!text) continue
    for (const raw of text.split(/[^\p{L}\p{N}+#]+/u)) {
      const token = normalize(raw)
      const keepable = token.length >= 3 || (token.length === 2 && raw === raw.toUpperCase())
      if (!keepable) continue
      if (STOPWORDS.has(token)) continue
      if (/^\d+$/.test(token)) continue
      if (seen.has(token)) continue
      seen.add(token)
      terms.push(token)
    }
  }
  return terms
}

/** The comparable shape of a need — whatever the row it came from. */
type ComparableNeed = {
  kind: string
  label: string
  offer: string | null
}

type SimilarityVerdict = {
  /** Jaccard overlap (+ same-kind bonus), 0 → 1. */
  score: number
  /** The terms BOTH needs carry — the only justification shown to the rep. */
  sharedTerms: string[]
}

/** Same-nature bonus: a pain echoing a pain is a stronger signal than a pain
 *  echoing a named project. Small — the words remain what decides. */
const SAME_KIND_BONUS = 0.1

/**
 * Score one candidate against the reference. Returns a `score` of 0 with no
 * shared terms when nothing overlaps — the caller drops those rather than
 * showing a "match" the rep can't justify.
 */
export function scoreSimilarity(reference: ComparableNeed, candidate: ComparableNeed): SimilarityVerdict {
  const referenceTerms = significantTerms(reference.label, reference.offer)
  const candidateTerms = new Set(significantTerms(candidate.label, candidate.offer))
  if (referenceTerms.length === 0 || candidateTerms.size === 0) return { score: 0, sharedTerms: [] }

  const sharedTerms = referenceTerms.filter(term => candidateTerms.has(term))
  if (sharedTerms.length === 0) return { score: 0, sharedTerms: [] }

  const union = new Set([...referenceTerms, ...candidateTerms]).size
  const jaccard = sharedTerms.length / union
  const bonus = reference.kind === candidate.kind ? SAME_KIND_BONUS : 0
  return { score: Math.min(1, Number((jaccard + bonus).toFixed(4))), sharedTerms }
}

/**
 * Rank candidates against the reference and keep the best `max`. Only rows with
 * at least one shared term survive. Ties break on the number of shared terms then
 * on the label, so the same portfolio always yields the same shortlist.
 */
export function rankSimilar<T extends ComparableNeed>(
  reference: ComparableNeed,
  candidates: readonly T[],
  max: number,
): Array<T & { match_score: number; shared_terms: string[] }> {
  return candidates
    .map(candidate => ({ candidate, verdict: scoreSimilarity(reference, candidate) }))
    .filter(({ verdict }) => verdict.sharedTerms.length > 0)
    .sort((a, b) => {
      const byScore = b.verdict.score - a.verdict.score
      if (byScore !== 0) return byScore
      const byShared = b.verdict.sharedTerms.length - a.verdict.sharedTerms.length
      if (byShared !== 0) return byShared
      return a.candidate.label.localeCompare(b.candidate.label, 'fr')
    })
    .slice(0, Math.max(0, max))
    .map(({ candidate, verdict }) => ({
      ...candidate,
      match_score: verdict.score,
      shared_terms: verdict.sharedTerms,
    }))
}
