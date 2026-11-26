import {
  ORG_CORRECTION_CLAIM_BY_FIELD,
  orgDecisionRoleSchema,
  orgGraphSchema,
  orgHierarchyLevelSchema,
  orgHierarchyRelationSchema,
  type OrgCorrectionClaim,
  type OrgCorrectionEvidence,
  type OrgCorrectionField,
  type OrgCorrectionObjectType,
  type OrgCorrectionValue,
  type OrgDecisionRole,
  type OrgEntity,
  type OrgGraph,
  type OrgHierarchyEdge,
  type OrgHierarchyLevel,
  type OrgHierarchyRelation,
  type OrgPerson,
  type OrgSource,
} from '@bellum/contracts'

/**
 * Application d'une correction humaine sur le graphe STOCKÉ (OrgGraph FINAL §7).
 *
 * Fonction PURE, troisième sœur de `applyOrgGraphCorrection` (qui ÉLAGUE ce
 * qu'on écarte) et de `applyDeclaredPeople` (qui GREFFE ce qu'on connaît) :
 * celle-ci CORRIGE ce qu'on sait faux. Les trois sont rejouées sur le graphe
 * déjà affiché pour que le geste se voie sans attendre un run, et réappliquées
 * après chaque run pour qu'il ne les écrase pas.
 *
 * ── Les cinq règles, et l'accident que chacune évite ───────────────────────
 *
 * 1. **Tout ou rien.** Une correction qui ne peut pas s'appliquer entièrement
 *    ne s'applique pas du tout (`null`). Une correction qui applique le titre
 *    et laisse tomber le N+1 en silence est pire que refusée : l'écran dirait
 *    « enregistré » et le graphe mentirait sur la moitié.
 * 2. **On ne crée JAMAIS de nœud.** Une entité inconnue, un manager
 *    introuvable, une extrémité de lien absente : refus. Fabriquer le nœud
 *    inventerait une branche d'organigramme à partir d'une faute de frappe —
 *    et un N+1 fabriqué oriente toute une approche commerciale vers la
 *    mauvaise personne.
 * 3. **Une valeur retirée redevient INCONNUE, pas nulle.** Effacer un titre
 *    qu'on sait faux laisse la personne SANS titre connu ; couper un N+1 laisse
 *    le rattachement inconnu. C'est une information vraie, et ce n'est jamais
 *    « 0 » ni « ».
 * 4. **Une affirmation humaine est une preuve de rang A.** La source posée est
 *    `workspace_user`, grounding `A`, confiance 100 — la même échelle que
 *    `applyDeclaredPeople`, et pour la même raison : quelqu'un qui travaille le
 *    compte affirme le savoir. C'est ce qui rend un lien corrigé `verified`.
 * 5. **Le résultat est RE-VALIDÉ contre le contrat.** Un graphe qui violerait
 *    un invariant n'est pas écrit. Même arbitrage que `applyRelationVerdict` :
 *    on préfère perdre la correction que stocker un graphe qui ment.
 *
 * ⚠️ Ce fichier ne connaît NI la base NI la version : il reçoit la version à
 * poser et rend le graphe. Le verrou optimiste vit dans le service, là où il y
 * a une transaction — un verrou dans une fonction pure ne verrouille rien.
 */

/** Ce qu'un champ a changé — une ligne de ledger, et rien d'autre. */
export type AppliedCorrection = {
  field: OrgCorrectionField
  oldValue: OrgCorrectionValue
  newValue: OrgCorrectionValue
}

type ApplyCorrectionsResult = {
  graph: OrgGraph
  /** Une entrée par champ RÉELLEMENT changé. Vide = rien à écrire au ledger. */
  applied: AppliedCorrection[]
}

/**
 * L'identité d'un lien, faute d'id dans le contrat.
 *
 * `fromId|type|toId` — déterministe, lisible, et surtout STABLE d'un run à
 * l'autre puisque les ids de personnes sont des slugs synthétisés depuis le
 * nom. C'est ce qui permet à une correction de lien de survivre à un rebuild.
 * La barre verticale n'apparaît dans aucun slug (`[^a-z0-9]+` → `-`).
 */
export function edgeKey(edge: { fromId: string; toId: string; type: OrgHierarchyRelation }): string {
  return `${edge.fromId}|${edge.type}|${edge.toId}`
}

/** L'inverse. `null` quand ce n'est pas une clé — jamais une clé devinée. */
export function parseEdgeKey(key: string): { fromId: string; toId: string; type: OrgHierarchyRelation } | null {
  const parts = key.split('|')
  if (parts.length !== 3) return null
  const [fromId, rawType, toId] = parts as [string, string, string]
  if (!fromId || !toId) return null
  const type = orgHierarchyRelationSchema.safeParse(rawType)
  if (!type.success) return null
  return { fromId, toId, type: type.data }
}

/** La preuve telle qu'elle est POSÉE sur le nœud. Provenance = la source ET la date. */
function sourceFor(
  objectId: string,
  field: OrgCorrectionField,
  evidence: OrgCorrectionEvidence,
  at: string,
): OrgSource {
  return {
    // Une correction du même champ sur le même objet remplace la précédente
    // plutôt que d'empiler dix preuves du même fait.
    id: `s-correction-${objectId}-${field}`,
    kind: evidence.kind,
    grounding: 'A',
    ...(evidence.ref ? { ref: evidence.ref } : {}),
    // La date de la preuve si on l'a, sinon celle du geste. Jamais aucune des deux.
    date: evidence.date ?? at,
    claim: evidence.claim,
  }
}

function withSource(sources: readonly OrgSource[], source: OrgSource): OrgSource[] {
  return [...sources.filter(s => s.id !== source.id), source]
}

/** `undefined`/`''` d'un champ optionnel du graphe → `null` de ledger. */
function asOldString(value: string | null | undefined): OrgCorrectionValue {
  return value == null || value === '' ? null : value
}

/**
 * Applique les claims d'UNE correction sur UN objet du graphe.
 *
 * Rend `null` dès que quoi que ce soit ne tient pas (règle 1). Rend un
 * `applied` VIDE quand tous les champs portaient déjà la valeur demandée — le
 * graphe est alors rendu inchangé, version comprise, et l'appelant n'écrit rien.
 */
export function applyOrgCorrections(
  graph: OrgGraph,
  args: {
    version: number
    objectType: OrgCorrectionObjectType
    objectId: string
    claims: readonly OrgCorrectionClaim[]
    /** ISO — le moment du geste. */
    at: string
  },
): ApplyCorrectionsResult | null {
  const { version, objectType, objectId, claims, at } = args

  const people: OrgPerson[] = [...graph.people]
  const entities: OrgEntity[] = [...graph.entities]
  let hierarchyEdges: OrgHierarchyEdge[] = [...graph.hierarchyEdges]
  const applied: AppliedCorrection[] = []

  const entityIds = () => new Set(entities.map(e => e.id))
  const nodeIds = () => new Set([...entities.map(e => e.id), ...people.map(p => p.id)])

  for (const claim of claims) {
    // Ceinture ET bretelles : le contrat le refuse déjà, mais cette fonction est
    // appelée aussi par la REPRISE après un run, où les claims viennent de la
    // base et non d'une requête validée.
    if (claim.evidence.claim !== ORG_CORRECTION_CLAIM_BY_FIELD[claim.field]) return null
    const source = sourceFor(objectId, claim.field, claim.evidence, at)

    if (objectType === 'person') {
      const index = people.findIndex(p => p.id === objectId)
      if (index === -1) return null // règle 2 — on ne fabrique pas la personne
      const person = people[index]!

      switch (claim.field) {
        case 'title': {
          const next = typeof claim.value === 'string' && claim.value.trim() ? claim.value.trim() : null
          const before = asOldString(person.title)
          if (before === next) break
          people[index] = {
            ...person,
            // Règle 3 — retiré ⇒ inconnu, jamais la chaîne vide.
            ...(next === null ? { title: undefined } : { title: next }),
            sources: withSource(person.sources, source),
          }
          applied.push({ field: 'title', oldValue: before, newValue: next })
          break
        }
        case 'entityId': {
          const next = typeof claim.value === 'string' && claim.value ? claim.value : null
          if (next !== null && !entityIds().has(next)) return null // règle 2
          const before = asOldString(person.entityId)
          if (before === next) break
          people[index] = { ...person, entityId: next, sources: withSource(person.sources, source) }
          applied.push({ field: 'entityId', oldValue: before, newValue: next })
          break
        }
        case 'hierarchyLevel': {
          let next: OrgHierarchyLevel | null = null
          if (claim.value !== null) {
            const parsed = orgHierarchyLevelSchema.safeParse(claim.value)
            if (!parsed.success) return null
            next = parsed.data
          }
          const before = asOldString(person.hierarchyLevel)
          if (before === next) break
          people[index] = {
            ...person,
            ...(next === null ? { hierarchyLevel: undefined } : { hierarchyLevel: next }),
            sources: withSource(person.sources, source),
          }
          applied.push({ field: 'hierarchyLevel', oldValue: before, newValue: next })
          break
        }
        case 'decisionRoles': {
          if (!Array.isArray(claim.value)) return null
          const parsed: OrgDecisionRole[] = []
          for (const raw of claim.value) {
            const role = orgDecisionRoleSchema.safeParse(raw)
            if (!role.success) return null
            if (!parsed.includes(role.data)) parsed.push(role.data)
          }
          const before = [...person.decisionRoles]
          if (before.length === parsed.length && before.every((r, i) => r === parsed[i])) break
          // Le badge « déduit » TOMBE : quelqu'un vient de l'observer et de
          // l'écrire. Le laisser dirait « rôle deviné par une règle de titre » sur
          // un rôle que l'équipe a corrigé à la main — et « une correction humaine
          // gagne toujours, quelle que soit sa date ».
          people[index] = {
            ...person,
            decisionRoles: parsed,
            roleInferred: false,
            sources: withSource(person.sources, source),
          }
          applied.push({ field: 'decisionRoles', oldValue: before, newValue: parsed })
          break
        }
        case 'reportsTo': {
          const next = typeof claim.value === 'string' && claim.value ? claim.value : null
          if (next !== null) {
            if (next === objectId) return null // personne ne se rapporte à soi-même
            if (!people.some(p => p.id === next)) return null // règle 2
            if (reportingCycle(hierarchyEdges, objectId, next)) return null
          }
          const current = hierarchyEdges.find(e => e.fromId === objectId && e.type === 'reports_to')
          const before = asOldString(current?.toId)
          if (before === next) break
          // Le lien est REMPLACÉ, jamais empilé : une personne a UN N+1 direct.
          hierarchyEdges = hierarchyEdges.filter(e => !(e.fromId === objectId && e.type === 'reports_to'))
          if (next !== null) {
            hierarchyEdges.push({
              fromId: objectId,
              toId: next,
              type: 'reports_to',
              sourceIds: [source.id],
              confidence: 100, // règle 4 — une affirmation humaine est de rang A
              verified: true,
            })
          }
          people[index] = { ...person, sources: withSource(person.sources, source) }
          applied.push({ field: 'reportsTo', oldValue: before, newValue: next })
          break
        }
        default:
          // Un champ d'un autre objet : le contrat le refuse, la reprise aussi.
          return null
      }
      continue
    }

    if (objectType === 'entity') {
      const index = entities.findIndex(e => e.id === objectId)
      if (index === -1) return null
      const entity = entities[index]!

      switch (claim.field) {
        case 'name': {
          const next = typeof claim.value === 'string' && claim.value.trim() ? claim.value.trim() : null
          // Une entité SANS nom n'est pas une entité : on refuse plutôt que de
          // la laisser anonyme dans un organigramme.
          if (next === null) return null
          if (entity.name === next) break
          entities[index] = { ...entity, name: next, sources: withSource(entity.sources, source) }
          applied.push({ field: 'name', oldValue: entity.name, newValue: next })
          break
        }
        case 'parentId': {
          const next = typeof claim.value === 'string' && claim.value ? claim.value : null
          if (next !== null) {
            if (next === objectId) return null
            if (!entityIds().has(next)) return null
            if (entityCycle(entities, objectId, next)) return null
          }
          const before = asOldString(entity.parentId)
          if (before === next) break
          entities[index] = { ...entity, parentId: next, sources: withSource(entity.sources, source) }
          applied.push({ field: 'parentId', oldValue: before, newValue: next })
          break
        }
        default:
          return null
      }
      continue
    }

    // objectType === 'edge'
    const key = parseEdgeKey(objectId)
    if (!key) return null
    const index = hierarchyEdges.findIndex(e => e.fromId === key.fromId && e.toId === key.toId && e.type === key.type)

    switch (claim.field) {
      case 'presence': {
        const next = claim.value === 'present' ? 'present' : claim.value === 'absent' ? 'absent' : null
        if (next === null) return null
        const before = index === -1 ? 'absent' : 'present'
        if (before === next) break
        if (next === 'absent') {
          hierarchyEdges = hierarchyEdges.filter((_, i) => i !== index)
        } else {
          const known = nodeIds()
          if (!known.has(key.fromId) || !known.has(key.toId)) return null // règle 2
          if (key.type === 'reports_to' && reportingCycle(hierarchyEdges, key.fromId, key.toId)) return null
          hierarchyEdges.push({
            fromId: key.fromId,
            toId: key.toId,
            type: key.type,
            sourceIds: [source.id],
            confidence: 100,
            verified: true,
          })
        }
        applied.push({ field: 'presence', oldValue: before, newValue: next })
        break
      }
      case 'type': {
        if (index === -1) return null
        const parsed = orgHierarchyRelationSchema.safeParse(claim.value)
        if (!parsed.success) return null
        const edge = hierarchyEdges[index]!
        if (edge.type === parsed.data) break
        hierarchyEdges[index] = {
          ...edge,
          type: parsed.data,
          sourceIds: [...new Set([...edge.sourceIds, source.id])],
        }
        applied.push({ field: 'type', oldValue: edge.type, newValue: parsed.data })
        break
      }
      case 'verified': {
        if (index === -1) return null
        if (typeof claim.value !== 'boolean') return null
        const edge = hierarchyEdges[index]!
        if (edge.verified === claim.value) break
        hierarchyEdges[index] = {
          ...edge,
          verified: claim.value,
          // Le contrat impose ≥ 90 pour un lien vérifié et ≤ 89 sinon. Une
          // personne qui INFIRME un lien ne le supprime pas : elle le fait
          // redescendre au rang d'hypothèse, avec sa preuve.
          confidence: claim.value ? 100 : Math.min(edge.confidence, 89),
          sourceIds: [...new Set([...edge.sourceIds, source.id])],
        }
        applied.push({ field: 'verified', oldValue: edge.verified, newValue: claim.value })
        break
      }
      default:
        return null
    }
  }

  const parsed = orgGraphSchema.safeParse({
    ...graph,
    graphVersion: version,
    people,
    entities,
    hierarchyEdges,
  })
  if (!parsed.success) return null // règle 5
  return { graph: parsed.data, applied }
}

/** Est-ce que faire rapporter `from` à `to` boucle ? (`to` rapporte déjà à `from`, transitivement) */
function reportingCycle(edges: readonly OrgHierarchyEdge[], from: string, to: string): boolean {
  const seen = new Set<string>([from])
  let cursor: string | undefined = to
  while (cursor) {
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor = edges.find(e => e.fromId === cursor && e.type === 'reports_to')?.toId
  }
  return false
}

/** Même question pour les entités, sur `parentId`. */
function entityCycle(entities: readonly OrgEntity[], child: string, parent: string): boolean {
  const seen = new Set<string>([child])
  let cursor: string | null | undefined = parent
  while (cursor) {
    if (seen.has(cursor)) return true
    seen.add(cursor)
    cursor = entities.find(e => e.id === cursor)?.parentId ?? null
  }
  return false
}

/** Une ligne du ledger, réduite à ce qu'il faut pour la rejouer. */
export type ReplayableCorrection = {
  objectType: OrgCorrectionObjectType
  objectId: string
  field: OrgCorrectionField
  newValue: OrgCorrectionValue
  reason: string
  evidence: OrgCorrectionEvidence
  /** La date du geste d'ORIGINE. Rejouer n'est pas re-décider. */
  at: string
}

/**
 * REJOUE les corrections encore actives sur le graphe qu'un run vient d'écrire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MOITIÉ SANS LAQUELLE LE LEDGER NE SERAIT QU'UNE ARCHIVE
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque run réécrit `raw_analysis.org.orgGraph` à NEUF. Une correction posée
 * hier tiendrait donc jusqu'à la réanalyse suivante, puis disparaîtrait sans un
 * mot — on aurait demandé du travail à quelqu'un et on l'aurait jeté en
 * silence. C'est exactement le raisonnement de `applyDeclaredPeople`, et c'est
 * pour cela que l'appelant vit au même endroit : `AccountsService.applyOrgChart`,
 * le seul endroit où le bloc `org` d'un run atterrit.
 *
 * Deux différences avec `applyOrgCorrections`, et les deux comptent :
 *
 * 1. **Une correction qui ne s'applique plus est SAUTÉE, pas fatale.** La
 *    personne a pu quitter l'entreprise, ou la vague d'enrichissement ne l'a
 *    pas ramenée. Sa ligne reste au ledger — si elle revient, sa correction
 *    reprend. Refuser tout le rejeu pour une cible disparue perdrait les
 *    corrections des autres, ce qui est le contraire du but. C'est la
 *    différence entre « on archive, on ne supprime pas » et « tout ou rien ».
 * 2. **La version ne bouge pas.** Rejouer n'est pas un nouveau geste ; c'est la
 *    restitution de gestes déjà comptés.
 *
 * Rend `null` quand il n'y a rien à faire ou que rien n'a pu s'appliquer —
 * l'appelant laisse alors le graphe exactement tel que le run l'a écrit.
 */
export function replayCorrections(graph: OrgGraph, entries: readonly ReplayableCorrection[]): OrgGraph | null {
  let current = graph
  let touched = false
  for (const entry of entries) {
    const next = applyOrgCorrections(current, {
      version: current.graphVersion,
      objectType: entry.objectType,
      objectId: entry.objectId,
      claims: [
        { field: entry.field, value: entry.newValue, reason: entry.reason || 'Correction', evidence: entry.evidence },
      ],
      at: entry.at,
    })
    // Règle 1 — sautée, jamais fatale.
    if (!next || next.applied.length === 0) continue
    current = next.graph
    touched = true
  }
  return touched ? current : null
}

/**
 * Le claim INVERSE d'une correction — ce qu'il faut appliquer pour l'annuler.
 *
 * L'annulation est un geste humain à part entière : sa preuve est
 * `workspace_user`, pas la preuve d'origine (qui, elle, ne dit rien de
 * l'annulation). Le `claim` reste celui du champ — c'est toujours du même fait
 * qu'on parle.
 */
export function invertCorrection(entry: {
  field: OrgCorrectionField
  oldValue: OrgCorrectionValue
  newValue: OrgCorrectionValue
  evidence: OrgCorrectionEvidence
  reason: string
}): OrgCorrectionClaim {
  return {
    field: entry.field,
    value: entry.oldValue,
    reason: `Annulation : ${entry.reason}`.slice(0, 500),
    evidence: {
      kind: 'workspace_user',
      claim: ORG_CORRECTION_CLAIM_BY_FIELD[entry.field],
    },
  }
}
