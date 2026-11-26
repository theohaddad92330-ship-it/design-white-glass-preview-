import { orgGraphSchema, type OrgGraph, type OrgRejectedItem } from '@bellum/contracts'

/**
 * Versionnement du graphe d'organigramme (Annexe Organigramme §5, p30 :
 * « chaque correction user produit une nouvelle graph_version et recalcul »).
 *
 * Jusqu'ici un retour utilisateur (`account_feedback`) ne déposait qu'une
 * DIRECTIVE TEXTE réinjectée au prochain prompt : le graphe déjà affiché restait
 * identique, sa version ne bougeait pas, et un contact signalé « parti » pouvait
 * revenir au run suivant (rien ne mémorisait le rejet). Ce module apporte la
 * moitié déterministe qui manquait :
 *
 * - une correction ⇒ `graphVersion + 1` (l'historique et le recalcul peuvent s'y
 *   accrocher) ;
 * - une correction NÉGATIVE sur un contact ⇒ un `rejectedItem` mémorisé, et le
 *   graphe stocké est ÉLAGUÉ sur-le-champ (le contact disparaît des 4 vues sans
 *   attendre un full rerun — DoD p32).
 *
 * Pur, sans I/O, sans LLM : les mêmes entrées donnent toujours la même sortie.
 */

/** Verdicts qui signifient « ne me le repropose pas » (contrat `accountFeedbackVerdictSchema`). */
const REJECTING_VERDICTS = new Set(['inutile', 'faux', 'obsolete'])

/** Libellé de la raison mémorisée, par verdict. Cité, jamais réinterprété. */
const REJECTION_REASONS: Record<string, string> = {
  inutile: "écarté par l'utilisateur (jugé inutile / hors sujet)",
  faux: "écarté par l'utilisateur (information signalée fausse)",
  obsolete: "écarté par l'utilisateur (signalé obsolète — n'est plus en poste)",
}

/**
 * Id de personne synthétisé par l'assembleur IA (`org_graph_assembler._slug`,
 * préfixe `p-`). MIROIR EXACT du Python : c'est ce qui permet à un rejet
 * mémorisé ici de retrouver la même personne dans le run SUIVANT, où le graphe
 * est réassemblé de zéro et où les ids sont re-synthétisés depuis le nom.
 */
export function orgPersonIdFor(fullName: string): string {
  const slug = (fullName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `p-${slug || 'p'}`
}

/**
 * Traduit un retour utilisateur en élément à mémoriser, ou `null` quand le
 * retour ne concerne pas un nœud du graphe (un play, une section, un verdict
 * positif). Seule la surface `contact` a un équivalent dans le graphe — un
 * « ce play est hors sujet » bump la version mais n'écarte personne.
 */
export function rejectionFromFeedback(feedback: {
  target: string
  targetRef: string
  verdict: string
}): OrgRejectedItem | null {
  if (feedback.target !== 'contact') return null
  if (!REJECTING_VERDICTS.has(feedback.verdict)) return null
  const ref = (feedback.targetRef || '').trim()
  if (!ref) return null
  return { sourceId: orgPersonIdFor(ref), reason: REJECTION_REASONS[feedback.verdict] ?? 'écarté par l’utilisateur' }
}

/** Fusionne deux listes de rejets en dédoublonnant par `sourceId` (le premier gagne). */
export function mergeRejectedItems(existing: OrgRejectedItem[], incoming: OrgRejectedItem[]): OrgRejectedItem[] {
  const seen = new Set<string>()
  const out: OrgRejectedItem[] = []
  for (const item of [...existing, ...incoming]) {
    if (!item?.sourceId || seen.has(item.sourceId)) continue
    seen.add(item.sourceId)
    out.push({ sourceId: item.sourceId, reason: item.reason })
  }
  return out
}

/** Lit le graphe validé stocké sous `raw_analysis.org.orgGraph`, ou `null`. */
export function readStoredOrgGraph(rawAnalysis: unknown): OrgGraph | null {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') return null
  const org = (rawAnalysis as Record<string, unknown>)['org']
  if (!org || typeof org !== 'object') return null
  const candidate = (org as Record<string, unknown>)['orgGraph']
  if (!candidate || typeof candidate !== 'object') return null
  const parsed = orgGraphSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/**
 * Applique une correction au graphe : nouvelle version + élagage déterministe
 * des éléments écartés. Le résultat est RE-VALIDÉ contre le contrat — on ne
 * réécrit jamais un graphe invalide (`null` = on ne touche pas au stocké).
 *
 * L'élagage est transitif par nécessité, pas par zèle : un invariant du contrat
 * interdit qu'un id rejeté reste référencé (edge, siège de comité, étape de
 * chemin) ou qu'un `parentId`/`entityId` pointe dans le vide.
 */
export function applyOrgGraphCorrection(
  graph: OrgGraph,
  args: { version: number; rejections: OrgRejectedItem[] },
): OrgGraph | null {
  const rejectedIds = new Set(args.rejections.map(r => r.sourceId))

  const entities = graph.entities.filter(e => !rejectedIds.has(e.id))
  const entityIds = new Set(entities.map(e => e.id))
  const people = graph.people.filter(p => !rejectedIds.has(p.id))
  const peopleIds = new Set(people.map(p => p.id))
  const liveIds = new Set([...entityIds, ...peopleIds])

  // Un parent/rattachement écarté ne peut pas rester pendant : on le coupe
  // plutôt que de jeter le nœud enfant (l'information « qui est là » survit).
  const prunedEntities = entities.map(e =>
    e.parentId != null && !entityIds.has(e.parentId) ? { ...e, parentId: null } : e,
  )
  const prunedPeople = people.map(p =>
    p.entityId != null && !entityIds.has(p.entityId) ? { ...p, entityId: null } : p,
  )

  let step = 0
  const recommendedPath = graph.recommendedPath
    .filter(s => peopleIds.has(s.personId))
    .map(s => ({ ...s, step: ++step }))

  const next: OrgGraph = {
    ...graph,
    graphVersion: args.version,
    entities: prunedEntities,
    people: prunedPeople,
    hierarchyEdges: graph.hierarchyEdges.filter(e => liveIds.has(e.fromId) && liveIds.has(e.toId)),
    influenceEdges: graph.influenceEdges.filter(e => liveIds.has(e.fromId) && liveIds.has(e.toId)),
    buyingCommittee: graph.buyingCommittee
      .filter(m => peopleIds.has(m.personId))
      .map(m => (m.entityId != null && !entityIds.has(m.entityId) ? { ...m, entityId: null } : m)),
    uncoveredZones: graph.uncoveredZones.map(z =>
      z.entityId != null && !entityIds.has(z.entityId) ? { ...z, entityId: null } : z,
    ),
    recommendedPath,
    // Mémoire cumulative : un élément écarté une fois le reste (p10 « rejeté +
    // mémorisé »). On ne garde que les ids réellement absents du graphe actif,
    // le contrat interdisant qu'un rejeté soit encore un nœud vivant.
    rejectedItems: mergeRejectedItems(graph.rejectedItems, args.rejections).filter(r => !liveIds.has(r.sourceId)),
  }

  const parsed = orgGraphSchema.safeParse(next)
  return parsed.success ? parsed.data : null
}
