/**
 * #2159.26 — LES ÉTIQUETTES des contacts et des comptes (décision Louis,
 * 19/09/2026 — « Casse d'origine »).
 *
 * Une colonne « Tags » d'un export CRM n'avait nulle part où aller : aucun
 * alias au catalogue d'import, aucun champ sur `Contact` ni sur `Account`. La
 * colonne finissait dans « colonnes ignorées », et le classement que l'équipe
 * avait construit dans son ancien outil restait derrière elle.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE ÉTIQUETTE GARDE LA GRAPHIE DE SA PREMIÈRE SAISIE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2159.26 — graphie de la première saisie (décision Louis 19/09). « SAP »
 * reste « SAP » en base — NFC, espaces rognés et ramenés à un seul, 40
 * caractères au plus (`normalizeTag`). Mais « SAP », « sap » et « Sap »
 * restent la MÊME étiquette pour le dédoublonnage et pour le filtre : les
 * garder distinctes couperait le filtre de liste en trois, et cliquer l'une
 * cacherait en silence les fiches des deux autres. `tagKey()` est CETTE clé
 * de comparaison (minuscules) — la contrainte SQL `contacts_tags_check` /
 * `accounts_tags_check` s'appuie dessus, en base, comme dernier rempart.
 *
 * Tout écrivain passe par ici : l'import (fichier), la saisie à la main, le
 * semis de démo. Un second normaliseur ailleurs divergerait au premier
 * caractère spécial.
 */

/** Longueur maximale d'une étiquette — au-delà, c'est une phrase, pas un classement. */
export const TAG_MAX_LENGTH = 40

/** Nombre maximal d'étiquettes par fiche — tenu AUSSI par la contrainte SQL. */
export const TAGS_MAX_COUNT = 20

/** Les séparateurs qu'un export produit dans UNE cellule multi-valeurs. */
const CELL_SEPARATORS = /[,;|]/

/**
 * Une étiquette ramenée à sa seule graphie (NFC, espaces rognés et ramenés à
 * un seul, 40 caractères au plus), ou `null` si elle est vide. La CASSE de la
 * première saisie est gardée telle quelle (#2159.26, décision Louis 19/09).
 */
export function normalizeTag(raw: string): string | null {
  const value = raw.normalize('NFC').replace(/\s+/g, ' ').trim()
  if (!value) return null
  return value.slice(0, TAG_MAX_LENGTH).trim()
}

/**
 * La clé de comparaison d'une étiquette — minuscules. Sert au dédoublonnage
 * ET au filtre : deux graphies de la même clé sont la MÊME étiquette. Ne PAS
 * la confondre avec `normalizeTag`, qui rend la graphie AFFICHÉE.
 */
export function tagKey(tag: string): string {
  return tag.toLowerCase()
}

/**
 * Une liste d'étiquettes normalisée, dédoublonnée (sans tenir compte de la
 * casse — `tagKey`), plafonnée. La PREMIÈRE graphie rencontrée pour une clé
 * donnée est celle qui est gardée (#2159.26).
 *
 * Accepte une CELLULE de fichier (« SAP; Grand compte, cloud ») ou un tableau
 * déjà découpé. Tout le reste rend `[]` — jamais une étiquette inventée à
 * partir d'un nombre ou d'un `null`.
 */
export function normalizeTags(raw: unknown): string[] {
  const parts: unknown[] = typeof raw === 'string' ? raw.split(CELL_SEPARATORS) : Array.isArray(raw) ? raw : []
  const byKey = new Map<string, string>()
  for (const part of parts) {
    if (typeof part !== 'string') continue
    for (const piece of part.split(CELL_SEPARATORS)) {
      const tag = normalizeTag(piece)
      if (!tag) continue
      const key = tagKey(tag)
      if (!byKey.has(key)) byKey.set(key, tag)
    }
    if (byKey.size >= TAGS_MAX_COUNT) break
  }
  return [...byKey.values()].slice(0, TAGS_MAX_COUNT)
}

/**
 * #2159.26 — le filtre « Étiquette » des listes de comptes et de contacts
 * (décision Louis 19/09). Une étiquette garde sa graphie d'origine sur CHAQUE
 * fiche, mais le filtre ne peut proposer qu'UNE option par clé insensible à
 * la casse — sinon « SAP » et « sap » couperaient la liste en deux, chacune
 * cachant les fiches de l'autre.
 *
 * `occurrencesInOrder` : une entrée par FICHE qui porte cette étiquette
 * (chaque fiche ne peut en porter qu'une graphie par clé — `normalizeTags`
 * dédoublonne déjà à l'écriture), dans l'ordre où les fiches ont été créées.
 * Pour chaque clé, la graphie rendue est la plus FRÉQUENTE ; à égalité,
 * celle dont la fiche est la plus ANCIENNE (première rencontrée). Le
 * résultat est trié alphabétiquement.
 */
export function pickRepresentativeTags(occurrencesInOrder: readonly string[]): string[] {
  type Stat = { graphie: string; count: number; order: number }
  const statsByKey = new Map<string, Map<string, Stat>>()
  occurrencesInOrder.forEach((raw, order) => {
    const key = tagKey(raw)
    let byGraphie = statsByKey.get(key)
    if (!byGraphie) {
      byGraphie = new Map<string, Stat>()
      statsByKey.set(key, byGraphie)
    }
    const stat = byGraphie.get(raw)
    if (stat) {
      stat.count += 1
    } else {
      byGraphie.set(raw, { graphie: raw, count: 1, order })
    }
  })

  const winners: string[] = []
  for (const byGraphie of statsByKey.values()) {
    let best: Stat | undefined
    for (const stat of byGraphie.values()) {
      if (!best || stat.count > best.count || (stat.count === best.count && stat.order < best.order)) {
        best = stat
      }
    }
    if (best) winners.push(best.graphie)
  }
  return winners.sort((a, b) => a.localeCompare(b, 'fr'))
}
