import {
  orgGraphSchema,
  planFreshness,
  readRelationshipState,
  type OrgDecisionRole,
  type OrgGraph,
  type OrgPathHop,
  type OrgPathOrigin,
  type OrgRecommendedStep,
  type OrgSourceKind,
  type RelationshipMemory,
} from '@bellum/contracts'

/** Réexporté depuis `@bellum/contracts` (#3403.4) : `account-access.service.ts`
 *  en a besoin lui aussi pour la voie « client existant », sans importer ce
 *  module NestJS (règle #7 — un module reste autonome). Un réglage vit à un
 *  seul endroit (GA-26) — celui-ci vit désormais dans le contrat partagé. */
export { readRelationshipState }

/**
 * « Recalculer le chemin » (Annexe Organigramme §6, p21) — reconstruire la
 * séquence d'approche À PARTIR DU GRAPHE DÉJÀ STOCKÉ, sans relancer la moindre
 * recherche.
 *
 * Le besoin : après une correction (« ce contact est parti »), un enrichissement
 * ciblé ou un changement d'état de la relation, le chemin recommandé affiché
 * date du dernier run complet. Le commercial n'a pas à payer 5 minutes de
 * pipeline pour réordonner trois interlocuteurs qu'on connaît déjà.
 *
 * Purement déterministe, sans I/O ni LLM, et surtout SANS INVENTION :
 * - aucune personne n'est créée : les étapes sortent de `people[]` / du comité ;
 * - l'objectif rédigé par l'IA est CONSERVÉ pour toute personne déjà dans le
 *   chemin ; seule une personne qui y entre reçoit un objectif générique dérivé
 *   de son rôle d'achat (une méthode, pas un fait) ;
 * - un élément rejeté, un ex-employé ou un opposant identifié n'entre jamais ;
 * - sur un compte froid, la gouvernance (L0) ne passe pas devant l'opérationnel
 *   — même règle que le garde-fou d'émission côté IA (`governance_guard.py`).
 */

/** États de relation qui apportent une relation ou un sponsor — MIROIR de
 *  `WARM_RELATIONSHIP_STATES` (governance_guard.py). Tout le reste (dont
 *  l'inconnu et l'absent) se lit « froid » : le défaut sûr EST la règle. */
const WARM_RELATIONSHIP_STATES = new Set([
  'connu',
  'linkedin',
  'dormant',
  'refere',
  'ancien_client',
  'rang2',
  'client_actif',
  'besoin_ouvert',
  'partenaire_actif', // #2371.4 — placements en cours avec ce partenaire
])

/** L0 = gouvernance dans l'ontologie OrgGraph (board / président / administrateur). */
const GOVERNANCE_LEVEL = 'L0'

/**
 * Ordre d'approche par rôle d'achat (p21) : on ouvre par qui parle (champion),
 * puis par qui souffre (utilisateur) et qui valide (technique), avant de
 * remonter au budget. Les achats ferment la marche — ce sont des conditions de
 * contrat, pas une porte d'entrée. Un opposant identifié n'est pas un chemin.
 */
const ROLE_ORDER: Record<OrgDecisionRole, number> = {
  champion: 0,
  user_buyer: 1,
  technical_buyer: 2,
  influencer: 3,
  economic_buyer: 4,
  procurement: 5,
  unknown: 6,
  blocker: Number.POSITIVE_INFINITY,
}

/** Objectif générique d'une personne qui ENTRE dans le chemin (aucune donnée du
 *  compte n'y figure : c'est une méthode d'approche, pas une affirmation). */
const ROLE_OBJECTIVES: Record<OrgDecisionRole, string> = {
  champion: 'obtenir son appui et une introduction interne',
  user_buyer: 'faire décrire la douleur terrain et les usages actuels',
  technical_buyer: 'valider la faisabilité technique et les contraintes',
  influencer: 'recueillir son avis et cartographier les jeux internes',
  economic_buyer: 'confirmer le budget et le calendrier de décision',
  procurement: 'sécuriser le référencement et les conditions',
  blocker: 'traiter son objection avant qu’elle ne bloque le dossier',
  unknown: 'qualifier son rôle réel dans la décision',
}

/** Statuts d'identité qui n'ont rien à faire dans une séquence d'approche :
 *  stock brut non vérifié, ex-employé (vue réseau) et élément écarté. */
const NON_ACTIONABLE_STATUSES = new Set(['seed', 'historical', 'rejected'])

/** Un chemin est une séquence à jouer, pas un annuaire : au-delà de 5 étapes le
 *  commercial ne le suit plus. Borne alignée sur ce que produit le run complet. */
const MAX_STEPS = 5

/** True quand le compte porte déjà une relation ou un sponsor. */
function hasRelationOrSponsor(state: string | null | undefined): boolean {
  return WARM_RELATIONSHIP_STATES.has(
    String(state ?? '')
      .trim()
      .toLowerCase(),
  )
}

/**
 * Recalcule `recommendedPath` depuis le graphe stocké et rend le graphe mis à
 * jour (version bumpée), ou `null` quand il n'y a rien d'honnête à proposer
 * (aucun interlocuteur actionnable) ou que le résultat violerait le contrat.
 */
export function recomputeRecommendedPath(
  graph: OrgGraph,
  args: { version: number; relationshipState?: string | null },
): OrgGraph | null {
  const rejectedIds = new Set(graph.rejectedItems.map(r => r.sourceId))
  // Le rôle du COMITÉ prime sur les rôles portés par la fiche : c'est la lecture
  // d'achat consolidée du dossier. `accessScore` dit à quel point le siège est
  // atteignable — à rang égal, on ouvre par le plus accessible.
  const seatRole = new Map<string, OrgDecisionRole>()
  const seatAccess = new Map<string, number>()
  for (const seat of graph.buyingCommittee) {
    if (!seatRole.has(seat.personId)) seatRole.set(seat.personId, seat.role)
    if (seat.accessScore != null && !seatAccess.has(seat.personId)) seatAccess.set(seat.personId, seat.accessScore)
  }

  const previous = new Map(graph.recommendedPath.map(step => [step.personId, step]))

  const candidates = graph.people
    .filter(person => !rejectedIds.has(person.id))
    .filter(person => !NON_ACTIONABLE_STATUSES.has(person.identityStatus))
    .map(person => {
      const roles = person.decisionRoles.length > 0 ? person.decisionRoles : (['unknown'] as OrgDecisionRole[])
      const committeeRole = seatRole.get(person.id)
      // Le meilleur rang parmi les rôles connus — un champion qui est aussi
      // influenceur s'approche comme un champion.
      const rank = Math.min(...(committeeRole ? [committeeRole, ...roles] : roles).map(role => ROLE_ORDER[role]))
      return {
        person,
        rank,
        reach: seatAccess.get(person.id) ?? person.confidence,
        governance: person.hierarchyLevel === GOVERNANCE_LEVEL,
      }
    })
    // Un opposant identifié (rang infini) n'est pas une porte d'entrée.
    .filter(candidate => Number.isFinite(candidate.rank))

  if (candidates.length === 0) return null

  candidates.sort((a, b) => a.rank - b.rank || b.reach - a.reach || a.person.id.localeCompare(b.person.id, 'fr'))

  // Garde-fou DoD (p32) : sur un compte froid, la gouvernance passe derrière
  // l'opérationnel. Un chemin 100 % gouvernance reste tel quel — masquer les
  // seuls contacts trouvés serait une pire réponse (c'est une zone blanche, pas
  // un problème d'ordre).
  let ordered = candidates
  if (!hasRelationOrSponsor(args.relationshipState)) {
    const operational = candidates.filter(c => !c.governance)
    if (operational.length > 0) ordered = [...operational, ...candidates.filter(c => c.governance)]
  }

  const recommendedPath: OrgRecommendedStep[] = ordered.slice(0, MAX_STEPS).map((candidate, index) => {
    const kept = previous.get(candidate.person.id)
    const role = seatRole.get(candidate.person.id) ?? candidate.person.decisionRoles[0] ?? 'unknown'
    return {
      // L'objectif rédigé par l'IA survit au recalcul : on réordonne, on ne
      // réécrit pas ce qui a été établi sur pièces.
      ...(kept ?? { personId: candidate.person.id, objective: ROLE_OBJECTIVES[role] }),
      step: index + 1,
    }
  })

  const parsed = orgGraphSchema.safeParse({ ...graph, graphVersion: args.version, recommendedPath })
  return parsed.success ? parsed.data : null
}

/* ------------------------------------------------------------------ */
/*  D'OÙ part le chemin : le nœud « TOI », et ses TROIS formes.        */
/*  (tome 5 §27, `T5.md:815-831` — croisement couche zéro ×            */
/*   organigramme, U26/U29 du tome 1.)                                 */
/* ------------------------------------------------------------------ */

/**
 * Ce qui fait de quelqu'un un contact de la COUCHE ZÉRO — et pourquoi ce n'est
 * pas une invention.
 *
 * Le refus écrit de l'outil `find_intro_path` (`apps/ia/app/services/chat_tools
 * .py:1018`) dit : « rien dans le dépôt ne modélise "telle personne connaît
 * telle autre". L'inventer voudrait dire inventer la donnée. » Ce refus tient,
 * et rien ici ne le rouvre : **on ne modélise toujours pas « connaît »**.
 *
 * Ce qu'on lit à la place est une donnée qui EXISTE déjà sur chaque personne du
 * graphe — la PROVENANCE de sa preuve. Une personne dont au moins une source est
 * first-party est une personne que l'espace a lui-même enregistrée : elle vient
 * de notre CRM, d'une saisie de l'équipe ou d'un import à nous. Dire « nous
 * avons déjà cette personne dans nos registres » est vrai et vérifiable ; dire
 * « Claire connaît le Head of Data » ne le serait pas.
 */
const FIRST_PARTY_SOURCE_KINDS: ReadonlySet<OrgSourceKind> = new Set<OrgSourceKind>([
  'crm',
  'workspace_user',
  'workspace_import',
])

/**
 * L'ordre de PRÉFÉRENCE des bases de saut, du lien le mieux étayé au plus faible.
 *
 * ⚠️ Volontairement séparé de l'ordre de déclaration de `orgHopBasisSchema` :
 * celui-là est FIGÉ par GA-08 et une valeur neuve s'y ajoute en FIN, ce qui lui
 * donnerait ici la pire préférence par accident. Deux listes, deux raisons.
 *
 * - `hierarchy` — une arête entre CES deux personnes, avec ses `sourceIds` ;
 * - `same_entity` — une appartenance partagée, assemblée et sourcée sur chaque
 *   personne, mais qui ne dit rien du lien entre elles deux ;
 * - `influence` — probabiliste par construction (elle porte un `reasoning`).
 */
const HOP_BASIS_PREFERENCE: readonly OrgPathHop['basis'][] = ['hierarchy', 'same_entity', 'influence']

/**
 * CE QUI ENTRE DANS LE RANG, et rien d'autre (GA-06).
 *
 * Un chemin ORDONNE des personnes : il tombe donc sous « aucun critère protégé
 * ne pèse dans le rang d'une personne » (annexe III de l'EU AI Act). Cette liste
 * est la réponse écrite à « qu'est-ce qui trie ? », et `org-graph-path-forms
 * .spec.ts` la confronte à un jeu de champs interdits ET vérifie qu'une photo
 * posée sur une personne ne change pas le résultat.
 *
 * `hopBasis` = la force de la pièce ; `confidence` = ce que le graphe sait de la
 * personne ; `personId` = départage à égalité stricte, pour que deux exécutions
 * rendent le même chemin.
 */
export const PATH_ORIGIN_RANKING_INPUTS = ['hopBasis', 'confidence', 'personId'] as const

/** Un champ de mémoire vide ne devient pas une chaîne vide à l'écran. */
function trimmedValue(value: string | null | undefined): string | undefined {
  const v = value?.trim()
  return v ? v : undefined
}

/** True quand cette personne vient de NOS registres (voir le docblock plus haut). */
function isFirstParty(person: OrgGraph['people'][number]): boolean {
  return person.sources.some(source => FIRST_PARTY_SOURCE_KINDS.has(source.kind))
}

/**
 * Le lien MODÉLISÉ entre deux personnes, ou `null` s'il n'y en a aucun.
 *
 * Aucune de ces trois branches ne conclut « X connaît Y » : elles rendent la
 * pièce qui existe, et l'écran dira laquelle. Une appartenance partagée ne
 * remonte aucune `sourceId` — ce ne sont pas des preuves du LIEN, ce sont les
 * preuves de deux rattachements distincts, et les confondre serait exactement la
 * réutilisation de preuve que `orgClaimSchema` interdit.
 */
function modelledLink(graph: OrgGraph, fromId: string, toId: string): OrgPathHop | null {
  const hierarchy = graph.hierarchyEdges.find(
    edge => (edge.fromId === fromId && edge.toId === toId) || (edge.fromId === toId && edge.toId === fromId),
  )
  if (hierarchy) return { personId: fromId, basis: 'hierarchy', sourceIds: [...hierarchy.sourceIds] }

  const from = graph.people.find(p => p.id === fromId)
  const to = graph.people.find(p => p.id === toId)
  if (from?.entityId != null && to?.entityId != null && from.entityId === to.entityId) {
    return { personId: fromId, basis: 'same_entity', sourceIds: [] }
  }

  const influence = graph.influenceEdges.find(
    edge => (edge.fromId === fromId && edge.toId === toId) || (edge.fromId === toId && edge.toId === fromId),
  )
  if (influence) return { personId: fromId, basis: 'influence', sourceIds: [...influence.sourceIds] }

  return null
}

/**
 * Calcule d'où part le chemin — le nœud « TOI » — et sous quelle forme.
 *
 * Purement déterministe, sans I/O : il ne lit que le graphe stocké et la mémoire
 * de relation saisie par le commercial (`accounts.relationship_memory`, le bloc
 * « Mémoire » de la couche zéro).
 *
 * ⚠️ La forme décrit le CHEMIN, pas le compte. Un compte peut porter une mémoire
 * de relation riche et rendre malgré tout `cold` : cela veut dire qu'aucune des
 * personnes de nos registres n'atteint la personne visée. C'est une information,
 * pas une contradiction — et les champs de mémoire restent portés, pour que
 * l'écran puisse dire les deux choses.
 *
 * ⚠️ Rend `null` quand le chemin recommandé est VIDE, et c'est la distinction qui
 * compte : sans personne à atteindre, il n'y a pas de chemin, donc pas de forme.
 * Répondre `cold` ici affirmerait « aucune relation ne mène à la cible » alors
 * qu'il n'y a pas de cible — une mesure présentée là où aucune n'était possible.
 * `null` fait taire l'écran, ce qui est la seule phrase vraie.
 */
export function computePathOrigin(
  graph: OrgGraph,
  args: { memory?: RelationshipMemory | null; now: Date },
): OrgPathOrigin | null {
  const memory = args.memory ?? null
  const relationDate = trimmedValue(memory?.lastContactAt)

  // Le socle, toujours présent : ce que l'on sait de la relation, et ce qu'elle
  // vaut aujourd'hui. `planFreshness` rend `inconnu` sans date — « non mesuré »
  // n'est jamais « frais ».
  const base = {
    owner: trimmedValue(memory?.owner),
    relation: trimmedValue(memory?.relation),
    relationDate,
    relationFreshness: planFreshness(relationDate, args.now),
  }

  const targetId = graph.recommendedPath[0]?.personId
  // Pas de cible = pas de chemin = pas de forme. Voir le docblock.
  if (!targetId) return null

  const rejectedIds = new Set(graph.rejectedItems.map(item => item.sourceId))
  const target = graph.people.find(p => p.id === targetId)

  // RELATION DIRECTE — la personne visée est déjà chez nous. Aucun relais à
  // chercher : le chemin va de TOI à elle.
  if (target && !rejectedIds.has(target.id) && isFirstParty(target)) {
    return { ...base, form: 'direct' }
  }

  // À UN SAUT — quelqu'un de nos registres est relié à la personne visée par un
  // lien que le graphe porte. Mêmes exclusions que pour une étape : un élément
  // écarté, un ex-employé ou du stock brut ne sont pas des relais.
  const relays = graph.people
    .filter(person => person.id !== targetId)
    .filter(person => !rejectedIds.has(person.id))
    .filter(person => !NON_ACTIONABLE_STATUSES.has(person.identityStatus))
    .filter(isFirstParty)
    .map(person => ({ person, hop: modelledLink(graph, person.id, targetId) }))
    .filter((candidate): candidate is { person: OrgGraph['people'][number]; hop: OrgPathHop } => candidate.hop !== null)

  if (relays.length === 0) return { ...base, form: 'cold' }

  relays.sort(
    (a, b) =>
      HOP_BASIS_PREFERENCE.indexOf(a.hop.basis) - HOP_BASIS_PREFERENCE.indexOf(b.hop.basis) ||
      b.person.confidence - a.person.confidence ||
      a.person.id.localeCompare(b.person.id, 'fr'),
  )

  return { ...base, form: 'one_hop', hop: relays[0].hop }
}
