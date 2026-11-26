import type { TargetCandidate } from '@bellum/contracts'

/**
 * #2156.55 — « Importer une liste » sur Mes cibles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `addTargetListItemSchema` (packages/contracts/src/schemas/target-list.ts)
 * exige un `ref_id` — l'UUID d'un compte ou d'un contact RÉEL de l'espace.
 * Une liste « importée » ne peut donc jamais inventer une fiche à partir d'un
 * nom collé : elle ne fait que RETROUVER, parmi les fiches déjà là, celles
 * dont le nom correspond exactement. Un nom sans correspondance certaine
 * reste NON TROUVÉ — jamais deviné, jamais créé à la volée (doctrine : jamais
 * de donnée fictive).
 *
 * Les deux fonctions ci-dessous sont pures et testées seules ; l'appel réseau
 * (`targetListsApi.candidates`) et l'écriture (`createList` / `addItem`)
 * vivent dans le composant qui les orchestre.
 */

/**
 * Un collage massif ne doit pas déclencher des centaines d'appels réseau
 * (un par nom, faute de recherche en lot côté API) : au-delà, le reste du
 * texte est ignoré plutôt que de geler l'écran ou de saturer l'API.
 */
export const IMPORT_LIST_MAX_NAMES = 100

/**
 * Découpe un texte collé en noms distincts : une ligne OU une virgule sépare
 * deux entrées (les deux formes de collage vues en usage — un export CSV à une
 * colonne, ou une liste sur une seule ligne). Les espaces sont rognés, les
 * lignes vides ignorées, et la casse ne compte pas pour la déduplication —
 * la PREMIÈRE graphie rencontrée est celle qui reste.
 */
export function parseImportedNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split(/[\n,]/)) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (names.length >= IMPORT_LIST_MAX_NAMES) break
  }
  return names
}

/**
 * Le SEUL candidat dont le libellé correspond exactement à `name` (casse
 * ignorée) — `null` s'il n'y en a aucun OU s'il y en a plusieurs. Une
 * ambiguïté (deux fiches au même nom) n'est jamais résolue en devinant : elle
 * reste un nom NON TROUVÉ, à traiter à la main dans Mes cibles.
 */
export function pickExactCandidate(name: string, candidates: readonly TargetCandidate[]): TargetCandidate | null {
  const normalized = name.trim().toLowerCase()
  const matches = candidates.filter(candidate => (candidate.label ?? '').trim().toLowerCase() === normalized)
  return matches.length === 1 ? matches[0] : null
}
