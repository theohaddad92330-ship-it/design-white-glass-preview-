import type {
  AnalysisContactSeed,
  AnalysisEnrichedContact,
  AnalysisScopeSelection,
  ContactScope,
} from '@bellum/contracts'
import {
  businessFamilyTerms,
  effectiveScopeSelection,
  isOutsideGeoPerimeter,
  normalizeScopeLabel,
} from '@bellum/contracts'

export { effectiveScopeSelection, isOutsideGeoPerimeter }

/**
 * Application du cadrage de collecte au dossier livré (Théo TF1 P0-02).
 *
 * Le commercial peut désormais exclure des entités et des thèmes AVANT le débit.
 * Sans ce module, cette confirmation serait décorative : l'IA continuerait de
 * remonter la filiale écartée et ses contacts. Ici, l'exclusion MORD —
 * déterministe, côté API, sans toucher aux prompts.
 *
 * Deux règles de sûreté, pour ne jamais amputer un dossier par accident :
 *
 *  1. **Correspondance par mots entiers, à sens unique.** Le libellé candidat
 *     doit CONTENIR le libellé exclu (« TF1 PUB SA » tombe sous « TF1 PUB »),
 *     jamais l'inverse (exclure « TF1 PUB » ne supprime pas « TF1 »). Les mots
 *     sont bornés : exclure « pub » ne touche pas « publicis ».
 *  2. **On n'efface jamais un FAIT, seulement une recommandation.** Un thème
 *     exclu retire les angles d'attaque qui le portent (ce que Bellum
 *     recommande de vendre) ; les douleurs et chantiers relevés sur le compte
 *     restent au dossier — ce sont des observations, pas des propositions.
 *
 * Cadrage absent/vide ⇒ toutes les fonctions rendent l'entrée TELLE QUELLE
 * (même référence) : un run sans cadrage est byte-identique à avant la feature.
 */

/** Clés du blob de recherche qui portent des entités du groupe. */
const ENTITY_KEYS = ['subsidiaries', 'entitiesExhaustive', 'sitesFrance'] as const

/** Clés d'un élément d'entité où peut vivre son nom, selon la source. */
const ENTITY_NAME_KEYS = ['name', 'entity', 'label', 'companyName', 'raisonSociale', 'denomination'] as const

/** Clés d'un angle d'attaque où vit son thème (texte de l'angle, offre rattachée). */
const ANGLE_TEXT_KEYS = ['angle', 'offer', 'title', 'name'] as const

/** Tri STABLE : ce qui matche passe en tête. Rien ne matche (ou tout) ⇒ même référence. */
function rankFirst<T>(list: T[], matches: (item: T) => boolean): T[] {
  const head = list.filter(matches)
  if (head.length === 0 || head.length === list.length) return list
  const tail = list.filter(item => !matches(item))
  const ranked = [...head, ...tail]
  return ranked.every((item, i) => item === list[i]) ? list : ranked
}

/** Un libellé plus court que ça n'est pas un critère d'exclusion fiable. */
const MIN_LABEL_LENGTH = 3

/** Le libellé candidat tombe-t-il sous l'une des exclusions ? */
export function isExcludedLabel(value: unknown, excluded: readonly string[] | undefined): boolean {
  if (!excluded?.length || typeof value !== 'string') return false
  const candidate = normalizeScopeLabel(value)
  if (!candidate) return false
  const padded = ` ${candidate} `
  return excluded.some(label => {
    const needle = normalizeScopeLabel(label)
    return needle.length >= MIN_LABEL_LENGTH && padded.includes(` ${needle} `)
  })
}

/** Toute valeur texte d'un objet (ou la chaîne elle-même) tombe-t-elle sous une exclusion ? */
function itemIsExcluded(item: unknown, excluded: readonly string[] | undefined, keys: readonly string[]): boolean {
  if (typeof item === 'string') return isExcludedLabel(item, excluded)
  if (!item || typeof item !== 'object') return false
  const record = item as Record<string, unknown>
  return keys.some(key => isExcludedLabel(record[key], excluded))
}

/** Ce que le cadrage lit hors du dossier : les SIREN déjà travaillés dans le CRM de l'espace (#4142.6). */
type ScopeSources = { workedSirens?: ReadonlySet<string> }

/**
 * #4142.6 — l'entité est-elle du SECTEUR PUBLIC ? Catégorie juridique INSEE 7xxx, sinon section NAF O (division
 * 84). `null` = aucune des deux données n'est portée : « non mesuré », jamais `false`.
 */
export function entityIsPublicSector(entity: Record<string, unknown>): boolean | null {
  const legal = entity['legalCategory'] ?? entity['categorie_juridique'] ?? entity['categorieJuridique']
  if (typeof legal === 'string' || typeof legal === 'number') {
    const code = String(legal).trim()
    if (/^\d{4}$/.test(code)) return code.startsWith('7')
  }
  const naf = entity['nafCode'] ?? entity['naf_code']
  if (typeof naf === 'string') {
    const division = naf.trim().slice(0, 2)
    if (/^\d{2}$/.test(division)) return division === '84'
  }
  return null
}

/**
 * #4294.4 — l'effectif d'une entité, en fenêtre `[bas, haut]`. Un effectif exact donne `[n, n]` ; une tranche
 * donne ses deux bornes (l'une peut manquer). `null` = aucune donnée : « non mesuré », jamais 0.
 */
export function entityHeadcountWindow(entity: Record<string, unknown>): { low: number; high: number } | null {
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  for (const key of ['headcount', 'effectif', 'effectifs', 'employees', 'employeeCount'] as const) {
    const exact = num(entity[key])
    if (exact !== null) return { low: exact, high: exact }
  }
  const low = num(entity['headcount_min'] ?? entity['effectif_min'])
  const high = num(entity['headcount_max'] ?? entity['effectif_max'])
  if (low === null && high === null) return null
  return { low: low ?? 0, high: high ?? Number.POSITIVE_INFINITY }
}

/** #4294.4 — la fenêtre de l'entité ne recoupe pas [min, max] ⇒ hors cadrage. Non mesuré ⇒ reste. */
function entityOutsideHeadcount(entity: Record<string, unknown>, selection: AnalysisScopeSelection): boolean {
  const { headcount_min: min, headcount_max: max } = selection
  if (min === undefined && max === undefined) return false
  const window = entityHeadcountWindow(entity)
  if (!window) return false
  if (min !== undefined && window.high < min) return true
  if (max !== undefined && window.low > max) return true
  return false
}

function entityExcludedBySource(item: unknown, selection: AnalysisScopeSelection, sources: ScopeSources): boolean {
  if (!item || typeof item !== 'object') return false
  const entity = item as Record<string, unknown>
  if (selection.exclude_public_sector === true && entityIsPublicSector(entity) === true) return true
  if (entityOutsideHeadcount(entity, selection)) return true
  if (selection.exclude_worked_accounts === true && sources.workedSirens) {
    const siren = typeof entity['siren'] === 'string' ? entity['siren'].trim() : ''
    if (siren && sources.workedSirens.has(siren)) return true
  }
  return false
}

/**
 * Retire du blob de recherche les entités et les angles écartés par le
 * commercial. Rend l'objet d'origine quand il n'y a rien à retirer — aucune
 * copie inutile, aucun risque de perdre une clé passthrough.
 */
export function applyScopeToResearch<T extends Record<string, unknown>>(
  data: T | undefined,
  selection: AnalysisScopeSelection | undefined,
  sources: ScopeSources = {},
): T | undefined {
  if (!data || !selection) return data
  const entities = selection.excluded_entities ?? []
  const angles = selection.excluded_angles ?? []
  const targeted = selection.included_entities ?? []
  const priorities = selection.selected_angles ?? []
  const bySource =
    selection.exclude_public_sector === true ||
    selection.exclude_worked_accounts === true ||
    selection.headcount_min !== undefined ||
    selection.headcount_max !== undefined
  if (entities.length === 0 && angles.length === 0 && targeted.length === 0 && priorities.length === 0 && !bySource) {
    return data
  }

  const patch: Record<string, unknown> = {}

  // Cadrage analyse (15/10) — « Quelle partie du groupe ? » et « Ce que tu vends » ORDONNENT
  // le dossier : les entités ciblées et les angles qui portent tes priorités passent en tête.
  // Classer, jamais retirer : un libellé ciblé qui ne matche pas (raison sociale différente)
  // ne doit pas vider la cartographie. Seules les EXCLUSIONS retirent (plus bas).
  if (targeted.length > 0) {
    for (const key of ENTITY_KEYS) {
      const list = data[key]
      if (!Array.isArray(list)) continue
      const ranked = rankFirst(list, item => itemIsExcluded(item, targeted, ENTITY_NAME_KEYS))
      if (ranked !== list) patch[key] = ranked
    }
  }
  if (priorities.length > 0 && Array.isArray(data.angles)) {
    const ranked = rankFirst(data.angles, item => itemIsExcluded(item, priorities, ANGLE_TEXT_KEYS))
    if (ranked !== data.angles) patch.angles = ranked
  }

  if (entities.length > 0) {
    for (const key of ENTITY_KEYS) {
      const list = (patch[key] ?? data[key]) as unknown
      if (!Array.isArray(list)) continue
      const kept = list.filter(item => !itemIsExcluded(item, entities, ENTITY_NAME_KEYS))
      if (kept.length !== list.length) patch[key] = kept
    }
  }

  // #4142.6 — « Secteur public » et « Déjà travaillées » lisent une SOURCE (le registre, le CRM de l'espace).
  // Une entité dont la source est muette n'est ni retenue ni écartée : elle RESTE (non mesuré, jamais 0).
  if (bySource) {
    for (const key of ENTITY_KEYS) {
      const list = (patch[key] ?? data[key]) as unknown
      if (!Array.isArray(list)) continue
      const kept = list.filter(item => !entityExcludedBySource(item, selection, sources))
      if (kept.length !== list.length) patch[key] = kept
    }
  }

  const currentAngles = (patch.angles ?? data.angles) as unknown
  if (angles.length > 0 && Array.isArray(currentAngles)) {
    // Un angle est une RECOMMANDATION : le thème écarté ne doit plus être
    // proposé. Le texte de l'angle et l'offre rattachée sont tous deux testés.
    const kept = currentAngles.filter(item => !itemIsExcluded(item, angles, ANGLE_TEXT_KEYS))
    if (kept.length !== currentAngles.length) patch.angles = kept
  }

  return Object.keys(patch).length > 0 ? { ...data, ...patch } : data
}

/**
 * Retire les contacts dont l'employeur est une entité écartée. Le contact d'une
 * filiale exclue n'entre pas dans le dossier — c'est ça, « exclu pour de vrai ».
 */
export function applyScopeToContactSeeds(
  seeds: AnalysisContactSeed[] | undefined,
  selection: AnalysisScopeSelection | undefined,
): { kept: AnalysisContactSeed[] | undefined; dropped: number } {
  const excluded = selection?.excluded_entities ?? []
  const geoBound =
    selection?.geo_perimeter === 'france' ||
    selection?.geo_perimeter === 'europe' ||
    selection?.geo_perimeter === 'city'
  if (!seeds?.length || (excluded.length === 0 && !geoBound)) return { kept: seeds, dropped: 0 }
  const kept = seeds.filter(
    seed =>
      !isExcludedLabel(seed.apolloDetails?.organization, excluded) &&
      !isOutsideGeoPerimeter(
        {
          country: seed.country,
          city: seed.city,
          title: seed.title,
          organization: seed.apolloDetails?.organization,
        },
        selection,
      ),
  )
  return { kept, dropped: seeds.length - kept.length }
}

/**
 * Le cadrage confirmé interdit-il CETTE recherche ciblée ? (Théo TF1 p8 —
 * « corriger le scope AVANT de payer la collecte »).
 *
 * Les fonctions ci-dessus filtrent ce qui est PERSISTÉ : la donnée a déjà été
 * collectée et payée quand elles s'appliquent. Celle-ci est la seule qui morde
 * en AMONT — sur la seule collecte dont l'API tient le déclencheur : la
 * recherche de contacts ciblée (`POST /analysis/:id/enrich-contacts`, le bouton
 * « Lancer une recherche ciblée » des zones blanches). Renvoyer un motif ici
 * empêche l'appel Apollo/LLM de partir : zéro réseau, zéro crédit.
 *
 * Trois champs sont testés, et seulement eux :
 *   - `entity` contre les entités écartées (« ne cherche plus chez TF1 PUB ») ;
 *   - `theme` / `family` contre les thèmes écartés (« pas d'ERP sur ce compte »).
 * `titles`, `seniorities`, `geographies` et `level` décrivent QUI on cherche,
 * pas OÙ ni SUR QUOI — les exclure sur un thème amputerait une recherche
 * légitime. Cadrage vide ou recherche large ⇒ `null`, comportement inchangé.
 */
export function contactSearchExcludedBy(
  scope: ContactScope | undefined,
  selection: AnalysisScopeSelection | undefined,
): { field: 'entity' | 'theme' | 'family'; label: string } | null {
  if (!scope || !selection) return null
  const entities = selection.excluded_entities ?? []
  const angles = selection.excluded_angles ?? []

  if (scope.entity && isExcludedLabel(scope.entity, entities)) return { field: 'entity', label: scope.entity }
  if (scope.theme && isExcludedLabel(scope.theme, angles)) return { field: 'theme', label: scope.theme }
  if (scope.family && isExcludedLabel(scope.family, angles)) return { field: 'family', label: scope.family }
  return null
}

/** Même règle sur les contacts classés en phase 3, où l'entité est explicite. */
export function applyScopeToEnrichedContacts(
  items: AnalysisEnrichedContact[] | undefined,
  selection: AnalysisScopeSelection | undefined,
): { kept: AnalysisEnrichedContact[] | undefined; dropped: number } {
  const excluded = selection?.excluded_entities ?? []
  if (!items?.length || excluded.length === 0) return { kept: items, dropped: 0 }
  const kept = items.filter(item => !isExcludedLabel(item.entity, excluded))
  return { kept, dropped: items.length - kept.length }
}

/** Le nom d'une personne, tel que `pruneOrgGraphPeople` le compare. */
export function geoPersonKey(fullName: string | null | undefined): string {
  return normalizeScopeLabel(fullName ?? '')
}

const PERSON_REF_KEYS = ['fromId', 'toId', 'personId', 'contactId', 'sourceId', 'targetId'] as const

/**
 * #3742 / #3744 — l'organigramme suit le périmètre géographique.
 *
 * Le graphe vient de l'IA, qui classe TOUT ce que la collecte a découvert : un
 * contact écarté par « France » (pays connu étranger) y restait comme nœud.
 * On retire du graphe chaque personne dont le contact lié — rapprochement par
 * NOM sur ce compte (`names`, clés `geoPersonKey`) — est hors périmètre, et
 * tout lien qui la cite (arêtes, chemin recommandé, comité).
 *
 * Un nœud sans contact écarté (pays inconnu compris) RESTE : une absence
 * d'information n'est pas une exclusion. Rien à retirer ⇒ même référence.
 */
export function pruneOrgGraphPeople(
  org: Record<string, unknown> | undefined,
  names: ReadonlySet<string>,
): { org: Record<string, unknown> | undefined; removed: number } {
  const graph = org?.['orgGraph']
  if (!org || names.size === 0 || typeof graph !== 'object' || graph === null) return { org, removed: 0 }
  const people = (graph as Record<string, unknown>)['people']
  if (!Array.isArray(people)) return { org, removed: 0 }

  const removedIds = new Set<string>()
  for (const person of people) {
    const record = person as Record<string, unknown>
    if (typeof record['id'] === 'string' && names.has(geoPersonKey(String(record['fullName'] ?? '')))) {
      removedIds.add(record['id'])
    }
  }
  if (removedIds.size === 0) return { org, removed: 0 }

  const citesRemoved = (item: unknown): boolean =>
    typeof item === 'object' &&
    item !== null &&
    PERSON_REF_KEYS.some(key => {
      const value = (item as Record<string, unknown>)[key]
      return typeof value === 'string' && removedIds.has(value)
    })

  const pruned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(graph as Record<string, unknown>)) {
    if (key === 'people') {
      pruned[key] = people.filter(person => !removedIds.has(String((person as Record<string, unknown>)['id'])))
    } else if (Array.isArray(value)) {
      pruned[key] = value.filter(item => !citesRemoved(item))
    } else {
      pruned[key] = value
    }
  }
  return { org: { ...org, orgGraph: pruned }, removed: removedIds.size }
}

/**
 * Ce que le graphe IA reçoit du cadrage. Avant le lot « cadrage analyse » (15/10),
 * seuls le PALIER (#3288) et la ZONE (#3742) partaient : niveaux de contact,
 * postes à placer, priorités, entités ciblées/exclues et thèmes exclus étaient
 * saisis à l'écran puis jetés ici. Chacun part désormais, et c'est l'IA qui
 * les lit :
 *   - `geo_perimeter`/`geo_areas` → `scope_filter.filter_recommended_path` ;
 *   - `hierarchy_levels` → CLASSE le chemin recommandé (`scope_filter`) ;
 *   - `business_families` + `business_family_terms` (résolus ICI, une seule
 *     table : `businessFamilyTerms`, contracts) → filtrent et classent les
 *     offres (`placedRoles` du run, `run_cadrage.py`) ET les contacts ;
 *   - `selected_angles`, `included_entities`, `excluded_entities`,
 *     `excluded_angles` → consigne de collecte (`run_cadrage.cadrage_directive`).
 * L'effectif n'en fait pas partie : supprimé de l'écran, il n'agissait pas.
 * Rien de tout cela ⇒ `undefined` : corps du graphe inchangé.
 */
type GraphScopeSelection = Pick<
  AnalysisScopeSelection,
  | 'depth'
  | 'geo_perimeter'
  | 'geo_areas'
  | 'included_entities'
  | 'excluded_entities'
  | 'selected_angles'
  | 'excluded_angles'
  | 'business_families'
  | 'hierarchy_levels'
  | 'objectives'
  | 'angle'
  | 'contact_entities'
> & { business_family_terms?: string[] }

export function graphScopeSelection(selection: AnalysisScopeSelection | undefined): GraphScopeSelection | undefined {
  const out: GraphScopeSelection = {}
  if (selection?.depth) out.depth = selection.depth
  if (selection?.geo_perimeter) out.geo_perimeter = selection.geo_perimeter
  if (selection?.geo_perimeter && selection.geo_areas?.length) out.geo_areas = selection.geo_areas
  for (const key of [
    'included_entities',
    'excluded_entities',
    'selected_angles',
    'excluded_angles',
    'business_families',
  ] as const) {
    const values = selection?.[key]
    if (values?.length) out[key] = values
  }
  if (selection?.hierarchy_levels?.length) out.hierarchy_levels = selection.hierarchy_levels
  // Théo B r1-recherche.N1 — les objectifs choisis (table fermée), lus par `run_cadrage.cadrage_directive`.
  if (selection?.objectives?.length) out.objectives = selection.objectives
  if (selection?.angle) out.angle = selection.angle
  // Lot 757 (arbitrage Louis 31/10) — les filiales COCHÉES : la phase contacts fait une passe par entité.
  if (selection?.contact_entities?.length) out.contact_entities = selection.contact_entities
  const terms = businessFamilyTerms(selection?.business_families)
  if (terms.length > 0) out.business_family_terms = terms
  return Object.keys(out).length > 0 ? out : undefined
}
