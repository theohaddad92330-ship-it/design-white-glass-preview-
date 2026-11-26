import {
  committeeSeatsHeldByContact,
  computeHierarchyLevel,
  isAboveCommitteeEntryLevel,
  readOrgFreshness,
  type CommitteeEntryLevel,
  type Contact,
  type OrgDecisionRole,
  type OrgEntity,
  type OrgFreshness,
  type OrgGraph,
  type OrgPerson,
} from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'
import { buildOrgGraphViewData } from '../organigramme/orgGraphData'

/**
 * #3282 / #3263.39 — les données de l'écran « Comité d'achat ».
 *
 * AUCUN second moteur : l'écran relit le `buyingCommittee` du graphe d'organisation
 * (`raw_analysis.org.orgGraph`), déjà validé et déjà rendu par la vue « Comité » de
 * l'onglet Organigramme. Ce module ne fait que le REGROUPER par siège.
 *
 * Trois règles de doctrine tenues ici, et gardées par le test voisin :
 *  - #3263.50 (NO-GO) — l'ordre est celui des SIÈGES, jamais celui de la séniorité :
 *    ni `hierarchyLevel`, ni titre, ni score ne réordonne les personnes. Les
 *    personnes d'un siège restent dans l'ordre du graphe.
 *  - un siège cœur sans personne est NOMMÉ (#3263.42), jamais rempli d'un nom deviné ;
 *  - une fraîcheur inconnue est « jamais vérifié », jamais un `0` jour (#3263.21).
 */

/** Les cinq sièges qu'un comité sain doit couvrir — miroir de `CORE_COMMITTEE_ROLES`
 *  (apps/ia/app/knowledge/buying_committee.py), dans le même ordre. */
export const CORE_SEATS = ['economic_buyer', 'technical_buyer', 'user_buyer', 'champion', 'procurement'] as const

/** Ordre d'AFFICHAGE des sièges : les cinq cœur, puis les rôles d'influence. */
const SEAT_ORDER: readonly OrgDecisionRole[] = [...CORE_SEATS, 'blocker', 'influencer', 'unknown']

/** #4324.1 — le siège du comité que tient chacun des trois sièges lisibles par l'intitulé. */
const SEAT_OF_TITLE_SEAT = {
  economic: 'economic_buyer',
  technical: 'technical_buyer',
  procurement: 'procurement',
} as const satisfies Record<string, OrgDecisionRole>

export type CommitteeScreenMember = {
  personId: string
  fullName: string
  title: string | null
  entityName: string | null
  reason: string | null
  /** Le rôle est-il DÉDUIT du titre plutôt que déclaré ? (`roleInferred`) */
  roleInferred: boolean
  /** #3263.21 — dernière vérification, lue par `readOrgFreshness` (seuil unique). */
  freshness: OrgFreshness
  /** Identité pas encore assez solide pour agir dessus, ou vérification périmée. */
  toVerify: boolean
  person: OrgPerson
  /**
   * #3263.17/.18/.19/.44/.46/.48 — le VRAI `Contact` derrière ce siège, quand
   * un nom NON AMBIGU le résout (`orgPersonSlug`, même rapprochement que
   * `organigrammeData.ts::resolveServerPath`). `null` = aucun contact de ce
   * nom, ou plusieurs (homonymie) — jamais deviné, surtout pas pour un CTA
   * qui ÉCRIT (masquer, enrichir…).
   */
  contactId: string | null
  /**
   * #3263.37 — un exécutif (`hierarchyLevel: 'L1'`) rattaché à l'entité RACINE
   * du groupe, alors qu'une entité plus précise (filiale/BU) est déjà
   * représentée par un AUTRE membre nommé : ne doit pas être recommandé par
   * défaut. `false` quand personne de plus précis n'est au comité — rien à
   * préférer à sa place.
   */
  tooGlobalExecutive: boolean
  /**
   * #3263.31 — rattaché à une entité SANS AUCUN lien d'ascendance avec
   * l'entité majoritaire du comité (une branche entièrement différente) —
   * distinct de `tooGlobalExecutive`, qui reste sur la MÊME branche, juste
   * plus haut. `false` quand le comité ne représente qu'une seule entité.
   */
  outOfPerimeter: boolean
  /**
   * #3282 / #3263.30 — plus HAUT que le niveau d'entrée que le commercial a
   * DÉCLARÉ (liste fermée). `false` sans déclaration : rien n'est signalé sur
   * un titre ou un texte libre, jamais deviné.
   */
  tooHigh: boolean
}

type CommitteeScreenSeat = {
  role: OrgDecisionRole
  members: CommitteeScreenMember[]
}

type CommitteeScreenData = {
  /** Uniquement les sièges OCCUPÉS — une absence ne fait pas une ligne ici. */
  seats: CommitteeScreenSeat[]
  /** Les sièges cœur SANS personne, nommés (#3263.42). */
  vacantSeats: OrgDecisionRole[]
  /** #4324.1 — sièges sans personne au GRAPHE, mais qu'un contact du dossier peut tenir : jamais dits « à pourvoir ». */
  contactHeldSeats: { role: OrgDecisionRole; names: string[] }[]
  /** #3263.41 — les personnes du comité à vérifier avant de s'en servir. */
  toVerify: CommitteeScreenMember[]
  memberCount: number
  /** #3263.45 — le graphe BRUT, pour les CTA qui corrigent une personne
   *  (`OrgCorrectionDrawer` prend `graph`, jamais une vue dérivée). */
  graph: OrgGraph
}

/**
 * #3263.17/.18/.19/.44/.46/.48/.38/.40/.11 — le rapprochement nom → `Contact`,
 * EXTRAIT pour être le même que `organigrammeData.ts::resolveServerPath` :
 * deux implémentations d'un même rapprochement finiraient par diverger
 * (GA-26). Diffère volontairement sur l'AMBIGUÏTÉ : `resolveServerPath` lit
 * seulement (le dernier doublon gagne, un chemin approximatif reste
 * utilisable) ; ce siège alimente des CTA qui ÉCRIVENT (masquer, corriger…),
 * donc un slug porté par plusieurs contacts ne résout personne.
 */
function contactIdBySlug(contacts: readonly Contact[]): Map<string, string | null> {
  const bySlug = new Map<string, string | null>()
  for (const contact of contacts) {
    const slug = orgPersonSlug(contact.full_name)
    // `undefined` = premier vu (id) ; déjà vu → ambigu (`null`), qu'il l'ait
    // été dès le deuxième passage ou qu'il le devienne au troisième.
    bySlug.set(slug, bySlug.has(slug) ? null : contact.id)
  }
  return bySlug
}

/**
 * #3263.37/.31 — L'ENTITÉ MAJORITAIRE du comité : celle que le plus de membres
 * NOMMÉS du comité partagent déjà. Un signal DÉRIVÉ (un comptage sur ce qui est
 * déjà collecté), jamais une entité « sujet » inventée — doctrine « jamais de
 * donnée fictive ». `null` quand aucun membre n'a d'entité résolue.
 */
function primaryEntityId(people: readonly OrgPerson[]): string | null {
  const counts = new Map<string, number>()
  for (const person of people) {
    if (!person.entityId) continue
    counts.set(person.entityId, (counts.get(person.entityId) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [entityId, count] of counts) {
    if (count > bestCount) {
      best = entityId
      bestCount = count
    }
  }
  return best
}

/** La chaîne `entityId → parentId → … → racine`, pour tester un lien d'ascendance. */
function ancestorChain(graph: OrgGraph, entityId: string): Set<string> {
  const chain = new Set<string>()
  let current: string | null | undefined = entityId
  while (current && !chain.has(current)) {
    chain.add(current)
    current = graph.entities.find(e => e.id === current)?.parentId
  }
  return chain
}

/** Vrai quand `a` et `b` sont la MÊME entité, ou que l'une est l'ancêtre de l'autre. */
function sameBranch(graph: OrgGraph, a: string, b: string): boolean {
  if (a === b) return true
  const chainA = ancestorChain(graph, a)
  if (chainA.has(b)) return true
  return ancestorChain(graph, b).has(a)
}

function entityOf(graph: OrgGraph, entityId: string | null | undefined): OrgEntity | undefined {
  return entityId ? graph.entities.find(e => e.id === entityId) : undefined
}

/** `null` quand le dossier ne porte aucun graphe : l'écran dit alors « à qualifier ». */
export function buildCommitteeScreenData(
  rawAnalysis: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
  contacts: readonly Contact[] = [],
  entryLevel: CommitteeEntryLevel | null = null,
): CommitteeScreenData | null {
  // #3742/#3744 (reste) — même filtre géographique que les contacts : un siège
  // du comité d'achat ne cite plus une personne dont le contact est écarté.
  const view = buildOrgGraphViewData(rawAnalysis, contacts)
  if (!view) return null

  const contactIdOf = contactIdBySlug(contacts)
  // Une personne rejetée ou inconnue du graphe ne s'affiche pas : « rejected » ne
  // revient jamais (contrat), et un id technique n'est pas un nom.
  const resolvedSeats = view.committee
    .map(seat => ({ seat, person: view.personOf(seat.personId) }))
    .filter((entry): entry is { seat: (typeof view.committee)[number]; person: OrgPerson } =>
      Boolean(entry.person && entry.person.identityStatus !== 'rejected'),
    )
  // #3263.31 — l'entité majoritaire se calcule sur les membres NOMMÉS de CE
  // comité, avant toute annotation individuelle (jamais un second calcul par membre).
  const primaryEntity = primaryEntityId(resolvedSeats.map(({ person }) => person))
  // #3263.37 — une entité plus précise (filiale/BU) est-elle DÉJÀ représentée
  // par au moins un membre nommé ? Indépendant de la MAJORITÉ (`primaryEntity`) :
  // UN seul membre de filiale suffit à rendre un dirigeant du groupe évitable.
  const hasMoreSpecificEntity = resolvedSeats.some(
    ({ person }) =>
      entityOf(view.graph, person.entityId)?.type !== undefined &&
      entityOf(view.graph, person.entityId)?.type !== 'groupe',
  )

  const bySeat = new Map<OrgDecisionRole, CommitteeScreenMember[]>()
  for (const { seat, person } of resolvedSeats) {
    const freshness = readOrgFreshness(person.lastVerifiedAt, now)
    const memberEntityId = seat.entityId ?? person.entityId ?? null
    const memberEntity = entityOf(view.graph, memberEntityId)
    // #3263.37 — exécutif rattaché à la racine du groupe, alors qu'une entité
    // plus précise est DÉJÀ représentée par un autre membre nommé.
    // #4813.1 — le graphe réel (Swiss Life Lux, Sopra CE I2S, SGCIB) ne porte souvent NI `hierarchyLevel` NI
    // entité de rattachement pour le dirigeant : le badge ne sortait jamais. Sans niveau, le titre le dit
    // (`computeHierarchyLevel` = c_level) ; sans entité, un dirigeant n'est rattaché à rien de plus précis
    // que le groupe. Un niveau ou une entité PRÉSENTS gardent leur verdict (jamais écrasés).
    const isExecutive = person.hierarchyLevel
      ? person.hierarchyLevel === 'L1'
      : computeHierarchyLevel(person.title) === 'c_level'
    const atGroupLevel = memberEntity ? memberEntity.type === 'groupe' : true
    const tooGlobalExecutive = Boolean(isExecutive && atGroupLevel && hasMoreSpecificEntity)
    // #3263.31 — aucun lien d'ascendance avec l'entité majoritaire : une
    // branche entièrement différente (distinct du dirigeant mondial, qui
    // reste sur la MÊME branche, juste plus haut).
    const outOfPerimeter = Boolean(
      memberEntityId && primaryEntity && !sameBranch(view.graph, memberEntityId, primaryEntity),
    )
    const member: CommitteeScreenMember = {
      personId: person.id,
      fullName: person.fullName,
      title: person.title ?? null,
      entityName: view.entityNameOf(memberEntityId),
      reason: seat.reason ?? null,
      roleInferred: person.roleInferred === true,
      freshness,
      toVerify:
        freshness.state === 'stale' || person.identityStatus === 'seed' || person.identityStatus === 'historical',
      person,
      contactId: contactIdOf.get(orgPersonSlug(person.fullName)) ?? null,
      tooGlobalExecutive,
      outOfPerimeter,
      // #3282 / #3263.30 — calculé sur le niveau d'entrée SAISI, pas sur le titre.
      tooHigh: isAboveCommitteeEntryLevel(person.hierarchyLevel, entryLevel),
    }
    bySeat.set(seat.role, [...(bySeat.get(seat.role) ?? []), member])
  }

  const seats = SEAT_ORDER.filter(role => bySeat.has(role)).map(role => ({ role, members: bySeat.get(role) ?? [] }))
  // #4324.1 — un siège n'est « à pourvoir » que si AUCUN contact du dossier ne peut le tenir : un titulaire
  // d'intitulé voisin compte, même rangé « à qualifier » (pas fini de le vérifier ≠ n'existe pas). Un contact
  // masqué ne siège plus. Le siège est alors NOMMÉ avec ses contacts, jamais perdu ni déclaré vide.
  const heldByContacts = new Map<OrgDecisionRole, string[]>()
  for (const contact of contacts) {
    if (contact.hidden === true) continue
    for (const held of committeeSeatsHeldByContact(contact)) {
      const role = SEAT_OF_TITLE_SEAT[held]
      heldByContacts.set(role, [...(heldByContacts.get(role) ?? []), contact.full_name])
    }
  }
  const vacantSeats = CORE_SEATS.filter(role => !bySeat.has(role) && !heldByContacts.has(role))
  const contactHeldSeats = CORE_SEATS.filter(role => !bySeat.has(role) && heldByContacts.has(role)).map(role => ({
    role,
    names: heldByContacts.get(role) ?? [],
  }))
  const toVerify = seats.flatMap(seat => seat.members).filter(member => member.toVerify)
  return {
    seats,
    vacantSeats,
    contactHeldSeats,
    toVerify,
    memberCount: seats.reduce((n, seat) => n + seat.members.length, 0),
    graph: view.graph,
  }
}

/**
 * #3263.43 — LA VUE « MASQUÉS » du comité. `findByAccount` (contrairement à
 * `GET /contacts`) ne retire pas les contacts masqués : ils voyagent déjà
 * jusqu'ici, juste jamais REGROUPÉS. Aucun second mécanisme — `hidden` est le
 * même champ que `CompactContactRow`/`useHideContact` posent et lisent.
 * Triés par nom : ni séniorité ni score, jamais un ordre inventé (#3263.50).
 */
export function hiddenCommitteeContacts(contacts: readonly Contact[]): Contact[] {
  return contacts
    .filter(contact => contact.hidden === true)
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'fr'))
}
