import type { OrgHierarchyEdge, OrgInfluenceEdge } from './org-graph.js'
import { orgReportingHypotheses } from './org-reporting-hypothesis.js'
import { ESTIMATED_FIELD_SOURCE } from './provenance.js'

/**
 * #4016 L4.2 — L'ORGANIGRAMME INFÉRÉ (décision Louis 11/10/2026,
 * `c95_estimation_badgee`, renverse en partie c12).
 *
 * Quand aucune source n'a observé à qui une personne rapporte, Bellum peut
 * DÉDUIRE un N+1 PROBABLE de ce que disent les intitulés : un « Responsable
 * infrastructure IT » d'une entité où un seul « DSI » siège au-dessus rapporte
 * probablement à lui. Cette arête :
 *
 *  - porte la provenance `inferred` — jamais une preuve, jamais `verified` ;
 *  - se dessine en POINTILLÉS, badgée « probable » (`EstimatedBadge`) ;
 *  - n'est JAMAIS écrite dans le graphe stocké (`hierarchyEdges`) ni dans le
 *    chemin recommandé : elle se calcule à la lecture, côté écran ;
 *  - cède devant tout rattachement prouvé OU supposé par l'analyse.
 *
 * Ce qu'elle lit : l'intitulé, l'entité, l'échelon. RIEN d'autre — aucun
 * critère protégé (c58) n'y entre, ni âge, ni genre, ni photo, ni adresse.
 */

/** Les fonctions qu'un intitulé désigne sans ambiguïté. */
type OrgTitleFamily = 'security' | 'data' | 'procurement' | 'finance' | 'hr' | 'it'

/** L'ordre COMPTE : « Responsable des achats IT » est un acheteur, pas un informaticien. */
const FAMILY_PATTERNS: readonly (readonly [OrgTitleFamily, RegExp])[] = [
  ['security', /\b(rssi|ciso|securite|security|cyber\w*)\b/],
  ['data', /\b(data|donnees)\b/],
  ['procurement', /\b(achats?|acheteuse|acheteur|procurement|purchasing|sourcing)\b/],
  ['finance', /\b(daf|cfo|finances?|financier|financiere|comptab\w*)\b/],
  ['hr', /\b(drh|rh|chro|ressources humaines|human resources)\b/],
  [
    'it',
    /\b(dsi|cio|cto|informatiques?|systemes? d ?information|si|it|infrastructures?|applications?|numerique|digital)\b/,
  ],
]

/** Une fonction sans tête PROPRE dans l'entité remonte à la tête du SI. */
const PARENT_FAMILIES: Readonly<Record<OrgTitleFamily, readonly OrgTitleFamily[]>> = {
  security: ['security', 'it'],
  data: ['data', 'it'],
  it: ['it'],
  procurement: ['procurement'],
  finance: ['finance'],
  hr: ['hr'],
}

/** L0 → L4 : la ligne managériale. L5 (achats/contrôle) est un axe à part, jamais comparé. */
const LEVEL_RANK: Readonly<Record<string, number>> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 }

function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** La fonction qu'un intitulé désigne, ou `null` quand il n'en désigne aucune. */
export function orgTitleFamily(title: string | null | undefined): OrgTitleFamily | null {
  const normalized = normalizeTitle(title ?? '')
  if (!normalized) return null
  return FAMILY_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null
}

type OrgTitlePerson = {
  id: string
  title?: string | null
  entityId?: string | null
  hierarchyLevel?: string | null
}

type OrgInferredReporting = {
  fromId: string
  toId: string
  family: OrgTitleFamily
  /** Toujours `inferred` : une déduction, jamais une observation. */
  source: typeof ESTIMATED_FIELD_SOURCE
  /** Les deux intitulés dont l'arête est déduite — ce que l'écran cite. */
  fromTitle: string
  toTitle: string
}

/**
 * Les N+1 PROBABLES que les intitulés désignent.
 *
 * Pour chaque personne sans rattachement connu (`alreadyLinked`), on cherche,
 * dans la MÊME entité, l'échelon le plus proche au-dessus d'elle occupé par sa
 * fonction (puis par la fonction parente). UN seul candidat à cet échelon ⇒
 * une arête ; deux ou plus ⇒ AUCUNE (on ne choisit pas au hasard) ; personne ⇒
 * on essaie la fonction parente.
 */
export function inferReportingFromTitles(
  people: readonly OrgTitlePerson[],
  alreadyLinked: ReadonlySet<string> = new Set(),
): OrgInferredReporting[] {
  const typed = people
    .map(person => ({
      id: person.id,
      title: (person.title ?? '').trim(),
      entityId: person.entityId ?? null,
      rank: person.hierarchyLevel != null ? LEVEL_RANK[person.hierarchyLevel] : undefined,
      family: orgTitleFamily(person.title),
    }))
    .filter(person => person.entityId && person.rank !== undefined && person.family)

  const edges: OrgInferredReporting[] = []
  for (const subject of typed) {
    if (alreadyLinked.has(subject.id)) continue
    for (const family of PARENT_FAMILIES[subject.family as OrgTitleFamily]) {
      const above = typed.filter(
        other =>
          other.id !== subject.id &&
          other.entityId === subject.entityId &&
          other.family === family &&
          (other.rank as number) < (subject.rank as number),
      )
      if (above.length === 0) continue
      const nearest = Math.max(...above.map(other => other.rank as number))
      const atNearest = above.filter(other => other.rank === nearest)
      const manager = atNearest.length === 1 ? atNearest[0] : undefined
      if (manager) {
        edges.push({
          fromId: subject.id,
          toId: manager.id,
          family: subject.family as OrgTitleFamily,
          source: ESTIMATED_FIELD_SOURCE,
          fromTitle: subject.title,
          toTitle: manager.title,
        })
      }
      break
    }
  }
  return edges
}

/**
 * Les N+1 PROBABLES d'un graphe — LA dérivation unique (GA-26), lue par l'écran
 * (carte de la personne, pointillés « probable ») ET par l'API (« vérifier ce
 * lien » sur une arête inférée). Une personne qui a déjà un rattachement — ligne
 * `reports_to` du graphe OU hypothèse de l'analyse — n'en reçoit pas d'inféré :
 * la preuve gagne, puis la supposition de l'analyse, puis seulement la déduction.
 */
export function orgInferredReportings(
  graph:
    | {
        people: readonly OrgTitlePerson[]
        hierarchyEdges: readonly Pick<OrgHierarchyEdge, 'fromId' | 'type'>[]
        influenceEdges: readonly OrgInfluenceEdge[]
      }
    | null
    | undefined,
): OrgInferredReporting[] {
  if (!graph) return []
  const linked = new Set<string>([
    ...graph.hierarchyEdges.filter(edge => edge.type === 'reports_to').map(edge => edge.fromId),
    ...orgReportingHypotheses(graph).map(hypothesis => hypothesis.fromId),
  ])
  return inferReportingFromTitles(graph.people, linked)
}
