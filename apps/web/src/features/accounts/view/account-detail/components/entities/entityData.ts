import { deriveScopeKind, type EntitySource, type GraphEntity, type RawEntity } from './entityTypes'

type RawPappersSubsidiary = {
  name?: string
  legal_name?: string
  siren?: string | null
  source?: string
  /** #4327.2 — la page qui nomme la filiale (lien déduit) ; jamais inventée. */
  source_url?: string | null
  type?: string
  actionable?: boolean | null
  getsPlay?: boolean | null
}

/** #4327.1 — le terme du « Vocabulaire du groupe » qu'on lit ici : seulement ce qui est de type Entité. */
export type VocabularyEntityTerm = {
  term: string
  kind: string
  truthStatus?: string
}

export function normaliseEntities(
  entities: unknown,
  pappersSubsidiaries: unknown,
  rootName: string | null,
  vocabulary: readonly VocabularyEntityTerm[] = [],
): GraphEntity[] {
  const collected: GraphEntity[] = []
  const seenNames = new Map<string, Set<string | null>>()
  const pushEntity = buildEntityPusher(collected, seenNames)
  appendRawEntities(entities, pushEntity)
  appendSubsidiaries(pappersSubsidiaries, rootName, pushEntity)
  appendVocabularyEntities(vocabulary, rootName, pushEntity)
  return resolveLevels(collected)
}

// Théo p.6 : par défaut la cartographie n'affiche que les entités ACTIONNABLES
// (BU / marque / filiale stratégique). Le gate IA classe SPV / cédées / homonymes
// / bruit en actionable=false — on les garde mais dans un onglet secondaire, au
// lieu de les jeter. Fallback sur getsPlay quand le flag actionable est absent
// (runs antérieurs), avec bénéfice du doute si aucun signal n'est présent.
function isActionable(raw: { actionable?: boolean | null; getsPlay?: boolean | null }): boolean {
  if (typeof raw.actionable === 'boolean') return raw.actionable
  return raw.getsPlay !== false
}

export function splitEntitiesByActionable(entities: GraphEntity[]): {
  actionable: GraphEntity[]
  others: GraphEntity[]
} {
  const actionable: GraphEntity[] = []
  const others: GraphEntity[] = []
  entities.forEach(entity => (entity.actionable ? actionable : others).push(entity))
  return { actionable, others }
}

function buildEntityPusher(collected: GraphEntity[], seenNames: Map<string, Set<string | null>>) {
  return (entity: Omit<GraphEntity, 'id' | 'level' | 'scopeKind'>) => {
    const key = entity.name.toLowerCase()
    const region = entity.region?.trim().toLowerCase() || null
    // #4327 — les homonymes se NOMMENT : deux entités de même nom situées à deux endroits restent deux lignes.
    // Un doublon sans lieu (ou au même lieu) se replie sur la ligne déjà posée.
    const seenRegions = seenNames.get(key)
    if (seenRegions && (region === null || seenRegions.has(null) || seenRegions.has(region))) return
    if (seenRegions) seenRegions.add(region)
    else seenNames.set(key, new Set([region]))
    collected.push({ ...entity, id: `entity-${collected.length}`, level: 0, scopeKind: deriveScopeKind(entity.type) })
  }
}

function appendRawEntities(
  entities: unknown,
  pushEntity: (entity: Omit<GraphEntity, 'id' | 'level' | 'scopeKind'>) => void,
) {
  if (!Array.isArray(entities)) return
  entities.forEach(raw => {
    if (typeof raw !== 'object' || raw === null) return
    const entity = raw as RawEntity & { actionable?: boolean | null; getsPlay?: boolean | null }
    const name = (entity.name ?? entity.label ?? '').toString().trim()
    if (!name) return
    pushEntity({
      name,
      type: (entity.type ?? 'unknown').toString(),
      parent: entity.parent?.toString().trim() ?? null,
      region: entity.region?.toString() ?? null,
      actionable: isActionable(entity),
      // #2966 (#2119.45) — cette ligne vient de la recherche BellumAI (Claude),
      // jamais du registre légal : distinct de `appendSubsidiaries` ci-dessous.
      source: 'analysis' satisfies EntitySource,
    })
  })
}

function appendSubsidiaries(
  subsidiaries: unknown,
  rootName: string | null,
  pushEntity: (entity: Omit<GraphEntity, 'id' | 'level' | 'scopeKind'>) => void,
) {
  // #4327 — sans nom de compte la filiale n'a pas de parent, mais elle n'est JAMAIS jetée.
  if (!Array.isArray(subsidiaries)) return
  subsidiaries.forEach(raw => {
    if (typeof raw !== 'object' || raw === null) return
    const sub = raw as RawPappersSubsidiary
    const name = (sub.legal_name ?? sub.name ?? '').toString().trim()
    // #4327.2 — le niveau de preuve se lit sur la source : SIREN, registre ou liste du registre sans clé `source` =
    // confirmé ; nommée par le web sans SIREN = déduite (affichée, étiquetée « à confirmer », avec sa source) ;
    // une source présente mais vide ou inconnue = AUCUNE source, rien n'est affiché (on ne l'invente pas).
    const deduced = sub.source === 'web' && !sub.siren
    const confirmed = !deduced && (Boolean(sub.siren) || sub.source === undefined || sub.source === 'registry')
    if (!name || (!deduced && !confirmed)) return
    const sourceHost = confirmed ? undefined : hostOf(sub.source_url)
    pushEntity({
      name,
      type: (sub.type ?? 'filiale').toString(),
      parent: rootName,
      region: null,
      actionable: isActionable(sub),
      source: (confirmed ? 'registry' : 'web') satisfies EntitySource,
      ...(sourceHost ? { sourceHost } : {}),
    })
  })
}

/** L'hôte lisible d'une URL de source (sans « www. ») ; `undefined` si l'URL n'est pas lisible. */
function hostOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host || undefined
  } catch {
    return undefined
  }
}

/**
 * #4327.1 (recette prod 22/10, Arkéa : Fortuneo et Suravenir connues au vocabulaire, absentes de Périmètres) —
 * une entité que le « Vocabulaire du groupe » nomme (type Entité, statut registre ou fait) APPARTIENT à la liste.
 * Elle passe en dernier : une ligne déjà posée par l'analyse ou le registre garde sa forme (doublon par nom).
 */
function appendVocabularyEntities(
  vocabulary: readonly VocabularyEntityTerm[],
  rootName: string | null,
  pushEntity: (entity: Omit<GraphEntity, 'id' | 'level' | 'scopeKind'>) => void,
) {
  for (const term of vocabulary) {
    const name = term.term?.trim()
    if (!name || term.kind !== 'entity') continue
    if (term.truthStatus !== 'registre' && term.truthStatus !== 'fait') continue
    if (rootName && name.toLowerCase() === rootName.trim().toLowerCase()) continue
    pushEntity({
      name,
      type: 'filiale',
      parent: rootName,
      region: null,
      actionable: true,
      source: term.truthStatus === 'registre' ? 'registry' : 'analysis',
    })
  }
}

function resolveLevels(entities: GraphEntity[]) {
  const byName = new Map(entities.map(entity => [entity.name.toLowerCase(), entity]))
  entities.forEach(entity => {
    let cursor: GraphEntity | undefined = entity
    const seen = new Set<string>()
    while (cursor?.parent) {
      const parent = byName.get(cursor.parent.toLowerCase())
      if (!parent || seen.has(parent.name)) break
      seen.add(parent.name)
      cursor = parent
      entity.level += 1
    }
  })
  return entities
}
