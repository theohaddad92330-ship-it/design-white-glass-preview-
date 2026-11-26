/**
 * #2265.14 — LE MÊME JUGEMENT « INTERMÉDIAIRE » QUE `discover_signals.py`,
 * PORTÉ EN TYPESCRIPT POUR LES ÉCRANS QUE L'IA N'ATTEINT PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `apps/ia/app/services/intermediation.py` calcule déjà `intermediary_kind`
 * (cabinet de recrutement / plateforme de mise en relation, sur NAF puis nom)
 * et `discover_signals.py` en dérive `isIntermediary` — mais SEULEMENT pour
 * une carte Découvrir, qui appelle l'IA à chaque recherche. La fiche compte et
 * les listes de comptes ne rappellent jamais l'IA pour afficher une ligne déjà
 * connue : elles lisent `accounts.naf_code` et `accounts.company_name`, déjà
 * collectés (Pappers) et déjà stockés. Refaire un aller-retour IA pour un
 * badge serait plus cher que la donnée elle-même ; ne PAS l'y étendre, comme
 * le disaient les vérifications du 23 au 26/09, laissait le badge « limité à
 * /discover » alors que le fait qu'il nomme (cabinet de recrutement,
 * plateforme) ne dépend d'aucun signal supplémentaire — seulement des deux
 * champs déjà en base.
 *
 * MÊME PRÉCÉDENT que `application-sector-naf.ts` (« même distinction que
 * esn_naf.py ») : une dérivation stable, sur un fait du registre, portée dans
 * les deux langages plutôt qu'inventée une seconde fois. Les codes NAF et les
 * deux listes de noms ci-dessous sont recopiés À L'IDENTIQUE de
 * `intermediation.py` — un désaccord entre les deux fichiers est un bug, pas
 * un second jugement.
 *
 * Jamais de donnée fictive : sans NAF ni nom, la réponse est `false`, jamais
 * devinée.
 */

/** Codes NAF des intermédiaires du recrutement (nomenclature INSEE 2008). */
const RECRUITMENT_NAF_CODES = ['78.10Z', '78.30Z'] as const

/** Repli par le nom, identique à `intermediation.py::_KNOWN_RECRUITERS`. */
const KNOWN_RECRUITERS = [
  'michael page',
  'page personnel',
  'hays',
  'expectra',
  'randstad',
  'manpower',
  'adecco',
  'robert walters',
  'robert half',
  'fed it',
  'lynx rh',
  'walters people',
  'approach people',
  'gi group',
  'kelly services',
  'spring france',
  'hunteed',
  'urban linker',
  'silkhom',
] as const

/** Repli par le nom, identique à `intermediation.py::_KNOWN_PLATFORMS`. */
const KNOWN_PLATFORMS = [
  'collective.work',
  'malt',
  'comet',
  'freelance.com',
  'creme de la creme',
  'forums talents handicap',
  'talents handicap',
  // #4746.1 / #4814.1 (lot P) — l'organisme public de l'emploi est un site d'annonces (miroir de intermediation.py).
  'france travail',
  'pole emploi',
] as const

function fold(value: string | null | undefined): string {
  const text = (value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function nafKey(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function matchesWordBoundary(folded: string, terms: readonly string[]): boolean {
  if (!folded) return false
  return terms.some(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(folded)
  })
}

function isRecruitmentNaf(naf: string | null | undefined): boolean {
  const key = nafKey(naf)
  return key.length > 0 && (RECRUITMENT_NAF_CODES as readonly string[]).map(nafKey).includes(key)
}

function looksLikeRecruiter(name: string | null | undefined): boolean {
  return matchesWordBoundary(fold(name), KNOWN_RECRUITERS)
}

function looksLikePlatform(name: string | null | undefined): boolean {
  return matchesWordBoundary(fold(name), KNOWN_PLATFORMS)
}

/**
 * Cet acteur est-il un cabinet de recrutement ou une plateforme de mise en
 * relation ? Même ordre de preuve que `intermediary_kind` : le NAF, quand il
 * est résolu, tranche pour l'axe cabinet ; le nom reste consulté pour l'axe
 * plateforme, faute de code NAF unique.
 */
export function isIntermediaryActor(input: { name?: string | null; naf?: string | null }): boolean {
  const { name = null, naf = null } = input
  const key = nafKey(naf)
  if (key) {
    return isRecruitmentNaf(naf) || looksLikePlatform(name)
  }
  return looksLikeRecruiter(name) || looksLikePlatform(name)
}

/** Repli par le nom, identique à `intermediation.py::_KNOWN_DATA_SOURCES` (#2265.7). */
export const KNOWN_DATA_SOURCES = [
  'pappers',
  'societe.com',
  'infogreffe',
  'kompass',
  'dun & bradstreet',
  'ellisphere',
  'manageo',
  'verif.com',
  'apollo.io',
  'zoominfo',
  'lusha',
  'kaspr',
  'dropcontact',
  'hunter.io',
  'clearbit',
  'crunchbase',
] as const

/**
 * #2265.7 (épopée #2851) — ce nom est-il celui d'un fournisseur de données
 * d'entreprise connu ? Même preuve que `looks_like_data_source` (service IA) :
 * le nom seul, frontière de mot, jamais deviné sans nom.
 */
export function isDataSourceActor(input: { name?: string | null }): boolean {
  return matchesWordBoundary(fold(input.name), KNOWN_DATA_SOURCES)
}

/**
 * #2265.5/.7/.14 — LE BADGE D'UN COMPTE, une seule réponse pour les listes et
 * la fiche (GA-26). Ordre des preuves = celui de `classify_actor_type` :
 * la source de données d'abord (« jamais un prospect »), puis le partenaire
 * DÉCLARÉ par l'espace (fait résolu par l'API, jamais deviné ici), puis
 * l'intermédiaire. `null` = état ordinaire : rien ne s'affiche.
 */
export type AccountActorBadgeKind = 'data_source' | 'partner' | 'intermediary'

export function accountActorBadgeKind(input: {
  name?: string | null
  naf?: string | null
  isDeclaredPartner?: boolean | null
}): AccountActorBadgeKind | null {
  if (isDataSourceActor(input)) return 'data_source'
  if (input.isDeclaredPartner === true) return 'partner'
  if (isIntermediaryActor(input)) return 'intermediary'
  return null
}
