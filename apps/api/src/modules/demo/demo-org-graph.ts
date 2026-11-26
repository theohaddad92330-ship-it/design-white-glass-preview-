import type {
  EntityKind,
  OrgDecisionRole,
  OrgEntity,
  OrgGraph,
  OrgHierarchyLevel,
  OrgInfluenceStance,
  OrgSourceKind,
} from '@bellum/contracts'
import { orgGraphSchema } from '@bellum/contracts'
import { orgPersonSlug } from '@bellum/utils'

/**
 * Construit le `raw_analysis.org.orgGraph` d'un dossier de démonstration.
 *
 * Pourquoi un constructeur plutôt que trois graphes écrits à la main : le graphe
 * est un objet à intégrité RÉFÉRENTIELLE (une arête pointe des identifiants de
 * personnes, un siège de comité aussi, le chemin recommandé également). Écrit à
 * la main, chaque dossier serait ~200 lignes d'identifiants recopiés, et un
 * caractère de travers ne casse rien de visible : `buildOrgGraphViewData` fait
 * `safeParse` puis rend `null`, donc la carte s'affiche SANS AUCUN TRAIT — ce
 * qu'un lecteur interprète comme « Bellum ne connaît aucun lien », pas comme un
 * bug. C'est exactement ce qui manquait à la démonstration : les trois dossiers
 * n'avaient pas de graphe du tout, la carte d'influence montrait des cartes
 * posées côte à côte sans un seul lien.
 *
 * La spec est donc écrite en NOMS de personnes, et les identifiants sont dérivés
 * par la même normalisation que côté web (`orgPersonSlug`, `@bellum/utils`) —
 * c'est elle qui rapproche le graphe des contacts affichés.
 *
 * Le résultat est validé par `orgGraphSchema` AVANT d'être rendu : un graphe de
 * démonstration invalide doit tomber ici, à l'écriture, et pas silencieusement à
 * l'écran devant un prospect.
 *
 * ⚠️ CE QUI EST VIDE À DESSEIN : le bloc `colouring` (le plancher de gris,
 * `T5.md:798-802`). Il ne se mesure QUE sur les personnes que l'enrichissement
 * n'a pas touchées, et toutes celles de la démonstration sont `actionable` —
 * coordonnées, messages, chemin d'accès. Le mentionner ici demanderait de
 * dégrader des contacts en identités brutes pour faire apparaître un
 * avertissement, c'est-à-dire de fabriquer du gris : exactement ce que la règle
 * interdit. Le badge « déduit », lui, EST semé ci-dessous : il ne dépend pas de
 * l'enrichissement et il se voit sur chaque carte.
 */

/** Une preuve, telle qu'elle serait collectée sur un vrai compte. */
type DemoEvidence = {
  kind: OrgSourceKind
  ref: string
  /** A = vérifié (site officiel/registre), B = probable (LinkedIn/presse), C = hypothèse. */
  grounding: 'A' | 'B' | 'C'
  date: string
}

type DemoOrgEntitySpec = {
  id: string
  name: string
  type: 'groupe' | 'filiale' | 'bu' | 'departement' | 'programme' | 'site'
  parentId?: string | null
  confidence: number
  evidence: DemoEvidence
  /** #2284.7 — le kind qui AFFINE le type (une direction métier rangée en `bu`).
   *  Jamais la répétition du type : le contrat la refuse (GA-26). */
  entityKind?: EntityKind
  /** Recette 12/10/2026 — le pays de l'entité (code ISO) ; absent = « FR », comme tout le semis jusqu'ici. */
  country?: string
}

type DemoOrgPersonSpec = {
  /** Nom complet — DOIT être celui d'un contact seedé du même dossier. */
  name: string
  title: string
  entityId: string
  family: string
  level: OrgHierarchyLevel
  roles: OrgDecisionRole[]
  confidence: number
  evidence: DemoEvidence
  /**
   * Le rôle d'achat a-t-il été DÉCLARÉ par quelqu'un ?
   *
   * Par défaut non, et c'est le cas réaliste : la preuve que porte chaque
   * personne de ces graphes établit son IDENTITÉ (site officiel, presse,
   * registre) — aucune n'a observé qui décide du budget. Le rôle est donc lu sur
   * l'intitulé du poste, et la carte porte le badge « déduit » (`T5.md:804-813`).
   * Le mettre à `true` simule une correction humaine : le badge tombe.
   */
  roleDeclared?: boolean
  /**
   * #3434 — DERNIÈRE vérification de cette personne (date calendaire ISO).
   * Absente par défaut : « jamais vérifié », jamais une date inventée. Une date
   * ANCIENNE rend la mention « Information du … , à vérifier » de l'organigramme
   * déclenchable en démonstration (la recette prod ne pouvait pas la voir).
   */
  lastVerifiedAt?: string
}

/** Un lien de rattachement, exprimé en noms. `verified` ⇒ trait plein. */
type DemoOrgEdgeSpec = {
  from: string
  to: string
  type?: 'reports_to' | 'member_of' | 'sponsors' | 'owns_budget' | 'procures_for'
  confidence: number
  verified: boolean
}

/** Un edge RELATIONNEL (#2310.13/.15/.19/.20/.21, .27, .28) — projet, blocage,
 *  mise en relation ou lien workspace, entre deux nœuds existants du graphe
 *  (personne ou entité). `from`/`to` acceptent les deux, comme `edges` plus
 *  haut. `author` n'est jamais déduit : sans lui le contrat refuse l'edge. */
type DemoOrgRelationalEdgeSpec = {
  from: string
  to: string
  type: 'works_with' | 'owns_project' | 'blocks' | 'introduced_by' | 'related_workspace'
  scope: 'workspace' | 'market_memory'
  author: string
  confidence: number
}

type DemoOrgInfluenceSpec = {
  from: string
  to: string
  topic: string
  stance: OrgInfluenceStance
  confidence: number
  reasoning: string
}

type DemoOrgCommitteeSpec = {
  name: string
  role: OrgDecisionRole
  reason: string
  accessScore: number
}

type DemoOrgPathSpec = {
  name: string
  objective: string
  /** Absent quand le dossier ne dit pas par où entrer — jamais un canal deviné (recette 12/10/2026). */
  channel?: string
  unlocks?: string
  fallback?: string
}

type DemoOrgZoneSpec = {
  entityId?: string | null
  family?: string
  level?: OrgHierarchyLevel
  importance: 'critique' | 'importante' | 'secondaire'
  reason: string
  suggestedTitles: string[]
  estimatedAvailable: number
}

/**
 * D'où part le chemin, dans la démonstration (`T5.md:815-831`).
 *
 * Déclaré plutôt que dérivé, pour deux raisons : le jeu de démonstration doit
 * MONTRER les trois formes, y compris celles qu'un compte donné ne produirait
 * pas ; et une origine incohérente ne passerait pas — `orgGraphSchema` vérifie
 * que l'intermédiaire est bien une personne du graphe et qu'il n'est pas rejeté.
 */
type DemoOrgOriginSpec = {
  form: 'direct' | 'one_hop' | 'cold'
  owner?: string
  relation?: string
  /** `YYYY-MM-DD`. Absente = relation jamais datée, qui se lit « inconnu ». */
  relationDate?: string
  relationFreshness: 'frais' | 'vieillissant' | 'perime' | 'inconnu'
  /** Le nom de la personne par qui l'on passe — résolu comme le reste. */
  hopName?: string
  hopBasis?: 'same_entity' | 'hierarchy' | 'influence'
}

/** Non exporté : seul `buildDemoOrgGraph` le consomme, et un type exporté sans
 *  consommateur externe est ce que `pnpm lint:exports:types` refuse. */
type DemoOrgGraphSpec = {
  entities: DemoOrgEntitySpec[]
  people: DemoOrgPersonSpec[]
  edges: DemoOrgEdgeSpec[]
  influences: DemoOrgInfluenceSpec[]
  committee: DemoOrgCommitteeSpec[]
  path: DemoOrgPathSpec[]
  zones?: DemoOrgZoneSpec[]
  /** #2919/#2310 — absent/vide (défaut) = pas de clé `relationalEdges`, comme
   *  côté assembleur IA (`org_graph_assembler.py`, `llm_relational_edges`). */
  relationalEdges?: DemoOrgRelationalEdgeSpec[]
  origin?: DemoOrgOriginSpec
  /** #2284.14 — les entités écartées et ce qu'elles SONT (un homonyme…). */
  rejected?: { sourceId: string; reason: string; entityKind?: EntityKind }[]
  /** Complément SG du 28/09/2026 — des nœuds DÉJÀ au format du contrat (lus
   *  d'un CSV importé : `sg-csv-complement.ts`), ajoutés après ceux du spec.
   *  Leur `parentId` doit désigner une entité du spec — `orgGraphSchema.parse`
   *  le vérifie plus bas. */
  extraEntities?: OrgEntity[]
}

/** Identifiant de la preuve d'une personne — une seule par personne suffit ici. */
function personSourceId(name: string): string {
  return `s-${orgPersonSlug(name).slice(2)}`
}

export function buildDemoOrgGraph(spec: DemoOrgGraphSpec): OrgGraph {
  const knownPeople = new Set(spec.people.map(p => p.name))
  const knownEntities = new Set(spec.entities.map(e => e.id))

  /** Nom de personne → identifiant `p-…` ; identifiant d'entité → lui-même.
   *  Une arête `member_of` / `sponsors` pointe une ENTITÉ, pas une personne. */
  const require = (nameOrEntityId: string, where: string) => {
    if (knownPeople.has(nameOrEntityId)) return orgPersonSlug(nameOrEntityId)
    if (knownEntities.has(nameOrEntityId)) return nameOrEntityId
    throw new Error(`demo orgGraph: "${nameOrEntityId}" (${where}) n'est ni une personne ni une entité du graphe`)
  }

  /** Le comité d'achat et le chemin recommandé ne portent QUE des personnes
   *  (le contrat le vérifie aussi ; on le dit plus tôt et plus clairement). */
  const requirePerson = (name: string, where: string) => {
    if (!knownPeople.has(name)) throw new Error(`demo orgGraph: "${name}" (${where}) n'est pas dans people[]`)
    return orgPersonSlug(name)
  }

  const graph = {
    graphVersion: 1,
    entities: [
      ...spec.entities.map(entity => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        parentId: entity.parentId ?? null,
        country: entity.country ?? 'FR',
        status: 'operating' as const,
        confidence: entity.confidence,
        ...(entity.entityKind ? { entityKind: entity.entityKind } : {}),
        sources: [
          {
            id: `s-${entity.id}`,
            kind: entity.evidence.kind,
            ref: entity.evidence.ref,
            grounding: entity.evidence.grounding,
            date: entity.evidence.date,
          },
        ],
      })),
      ...(spec.extraEntities ?? []),
    ],
    people: spec.people.map(person => ({
      id: orgPersonSlug(person.name),
      fullName: person.name,
      title: person.title,
      entityId: person.entityId,
      family: person.family,
      hierarchyLevel: person.level,
      decisionRoles: person.roles,
      // Le badge « déduit » (`T5.md:804-813`) : la preuve de chaque personne
      // établit son IDENTITÉ, jamais son pouvoir d'achat — le rôle est lu sur
      // l'intitulé. C'est exactement ce qu'un vrai compte produit, et la
      // démonstration doit le montrer plutôt que de présenter des rôles comme
      // des faits observés.
      roleInferred: person.roleDeclared !== true,
      // Tous les contacts de démonstration portent leurs coordonnées et leurs
      // messages : ils sont actionnables, pas des identités brutes.
      identityStatus: 'actionable' as const,
      ...(person.lastVerifiedAt ? { lastVerifiedAt: person.lastVerifiedAt } : {}),
      confidence: person.confidence,
      sources: [
        {
          id: personSourceId(person.name),
          kind: person.evidence.kind,
          ref: person.evidence.ref,
          grounding: person.evidence.grounding,
          date: person.evidence.date,
        },
      ],
    })),
    hierarchyEdges: spec.edges.map(edge => ({
      fromId: require(edge.from, 'edges.from'),
      toId: require(edge.to, 'edges.to'),
      type: edge.type ?? ('reports_to' as const),
      // La preuve d'un rattachement est portée par la personne RATTACHÉE : c'est
      // sa page/son profil qui nomme son responsable. Un lien inféré n'en cite
      // aucune — c'est précisément ce que le pointillé dit à l'écran.
      sourceIds: edge.verified ? [personSourceId(edge.from)] : [],
      confidence: edge.confidence,
      verified: edge.verified,
    })),
    influenceEdges: spec.influences.map(influence => ({
      fromId: requirePerson(influence.from, 'influences.from'),
      toId: requirePerson(influence.to, 'influences.to'),
      topic: influence.topic,
      stance: influence.stance,
      confidence: influence.confidence,
      reasoning: influence.reasoning,
    })),
    buyingCommittee: spec.committee.map(seat => ({
      personId: requirePerson(seat.name, 'committee'),
      role: seat.role,
      reason: seat.reason,
      accessScore: seat.accessScore,
    })),
    uncoveredZones: (spec.zones ?? []).map(zone => ({
      entityId: zone.entityId ?? null,
      family: zone.family,
      hierarchyLevel: zone.level,
      importance: zone.importance,
      reason: zone.reason,
      suggestedTitles: zone.suggestedTitles,
      suggestedQueries: [],
      estimatedAvailable: zone.estimatedAvailable,
    })),
    recommendedPath: spec.path.map((step, index) => ({
      step: index + 1,
      personId: requirePerson(step.name, 'path'),
      objective: step.objective,
      ...(step.channel !== undefined ? { channel: step.channel } : {}),
      ...(step.unlocks !== undefined ? { unlocks: step.unlocks } : {}),
      ...(step.fallback !== undefined ? { fallback: step.fallback } : {}),
    })),
    rejectedItems: spec.rejected ?? [],
    ...(spec.relationalEdges?.length
      ? {
          relationalEdges: spec.relationalEdges.map(edge => ({
            fromId: require(edge.from, 'relationalEdges.from'),
            toId: require(edge.to, 'relationalEdges.to'),
            type: edge.type,
            scope: edge.scope,
            author: edge.author,
            sourceIds: [],
            confidence: edge.confidence,
          })),
        }
      : {}),
    // D'où part le chemin. Absent quand le jeu n'en déclare pas — la carte se
    // tait alors, exactement comme sur un dossier réel qui n'a pas été
    // recalculé depuis le chantier. C'est un état qui doit se voir en démo
    // aussi : il n'est PAS « entrée froide ».
    ...(spec.origin
      ? {
          pathOrigin: {
            form: spec.origin.form,
            owner: spec.origin.owner,
            relation: spec.origin.relation,
            relationDate: spec.origin.relationDate,
            relationFreshness: spec.origin.relationFreshness,
            ...(spec.origin.hopName && spec.origin.hopBasis
              ? {
                  hop: {
                    personId: requirePerson(spec.origin.hopName, 'origin.hopName'),
                    basis: spec.origin.hopBasis,
                    sourceIds: [personSourceId(spec.origin.hopName)],
                  },
                }
              : {}),
          },
        }
      : {}),
  }

  // Parse et non safeParse : une démonstration qui part avec un graphe invalide
  // s'afficherait vide devant un prospect, sans le moindre message d'erreur.
  return orgGraphSchema.parse(graph)
}

/** Ce qu'un contact du jeu doit porter pour être compté. */
type DemoCoverageContact = { family: string; lifecycle_state: string }

/**
 * Le bandeau de couverture d'un dossier de démonstration.
 *
 * Il est calculé À PARTIR des contacts réellement seedés, jamais écrit à la
 * main : le bandeau annonce « N découverts » et « Voir tous les contacts »
 * ouvre la liste juste en dessous. Deux nombres saisis séparément divergent au
 * premier contact ajouté, et l'écart se découvre devant un prospect qui clique.
 *
 * Ce que chaque compteur veut dire ici, et pourquoi il est VRAI :
 *  - `discovered` : tous les contacts du dossier, densification comprise.
 *  - `deterministicClassified` : ceux qui portent une famille — c'est
 *    exactement ce qu'un classement par le titre produit, et c'est 0 crédit.
 *  - `llmEnriched` : ceux dont l'identité est résolue. Un siège encore à
 *    `detecte` est découvert et cherchable, pas approfondi — la distinction que
 *    la fonctionnalité entière sert à montrer.
 *
 * `attachedToEntity` reste ABSENT, comme en production : le graphe rattache les
 * personnes qu'il porte, le corpus n'est pas rattaché. Écrire un nombre ici
 * ferait passer un compte d'enrichis pour un compte de rattachés.
 *
 * #2543.5f — `sourceStatus` / `sourceTotalEntries` / `fallback` restent ABSENTS
 * pour la même raison : un dossier de démonstration est SEEDÉ, il n'a jamais
 * fait tourner une vraie recherche Apollo ni un vrai repli web — écrire un
 * statut ici fabriquerait une collecte qui n'a jamais eu lieu (« JAMAIS de
 * données fictives »), et romprait la promesse « zéro appel réseau » de cet
 * espace.
 *
 * #2658.1 (décision Louis, 21/09/2026) — l'écran qui lisait ce bloc,
 * `EngineCoverageFunnelBand` (apps/web), a été retiré de l'onglet Contacts,
 * délibérément (revient sur #2552.1) : cette fonction reste, la MESURE reste
 * VRAIE côté API — seul l'affichage a disparu. Gardé par
 * `demo-org-coverage.spec.ts`.
 */
export function withDemoOrgCoverage<T extends { raw_analysis?: unknown }>(
  account: T,
  contacts: readonly DemoCoverageContact[],
): T {
  const raw = (account.raw_analysis ?? {}) as Record<string, unknown>
  const org = (raw['org'] ?? {}) as Record<string, unknown>
  const parsed = orgGraphSchema.safeParse(org['orgGraph'])
  // Un dossier sans graphe n'a pas de bandeau à porter — et surtout pas un
  // bandeau à zéro, qui affirmerait qu'on n'a trouvé personne.
  if (!parsed.success) return account

  const graph: OrgGraph = {
    ...parsed.data,
    coverage: {
      discovered: contacts.length,
      deterministicClassified: contacts.filter(c => c.family.trim().length > 0).length,
      llmEnriched: contacts.filter(c => c.lifecycle_state !== 'detecte').length,
      // La vague par défaut du produit (`CONTACTS_ENRICH_MAX`). En démonstration
      // elle n'est pas lue de l'environnement : la salle publique doit montrer
      // le réglage LIVRÉ, pas celui de la machine qui a seedé.
      enrichmentBatchSize: 50,
    },
  }

  return { ...account, raw_analysis: { ...raw, org: { ...org, orgGraph: orgGraphSchema.parse(graph) } } }
}
