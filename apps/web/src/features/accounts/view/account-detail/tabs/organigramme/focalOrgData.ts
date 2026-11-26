import {
  ORG_GREY_NODE_FLOOR,
  deriveOrgCoverage,
  isKnownContact,
  orgLinkOrigin,
  orgInferredReportings,
  orgNodeRefinedKind,
  orgReportingHypotheses,
  readOrgColouring,
  type OrgCoverageHeader,
  type EntityKind,
  type OrgDecisionRole,
  type OrgEntity,
  type OrgEntityType,
  type OrgGraph,
  type OrgHierarchyLevel,
  type OrgLinkOrigin,
  type OrgPerson,
  type OrgSource,
} from '@bellum/contracts'
import { orgSourceResolver } from './orgGraphData'

/**
 * Le read-model de la VUE FOCALE PAR DIRECTION — l'écran par défaut de
 * l'organigramme (OrgGraph FINAL du 27/08, décisions 3, 4 et 5).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LES DEUX RÈGLES QUI COMMANDENT CE FICHIER, ET QUI AVAIENT ÉTÉ INVERSÉES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * **1. La géométrie de l'arbre est L0-L4. Ce ne sont PAS les rôles.**
 * L'écran d'avant faisait de Sponsor / Influenceur / Opérationnel les trois
 * RANGÉES de l'organigramme. Le FINAL le nomme et le refuse : « cela recréerait
 * exactement le défaut dénoncé ». Un organigramme répond à « qui dépend de
 * qui » ; le rôle commercial répond à « qui décide quoi ». Les confondre fait
 * lire une dépendance là où il n'y a qu'une étiquette de vente — et c'est sur
 * cette lecture qu'on choisit qui appeler en premier.
 *
 *   · la HAUTEUR d'une carte vient de `hierarchyLevel`, et de rien d'autre ;
 *   · le rôle commercial vit dans un BADGE posé sur la carte ({@link decisionBadgeOf}) ;
 *   · une personne sans niveau n'est rangée à AUCUN niveau — elle sort de
 *     l'arbre par {@link FocalOrgView.unleveled}, plutôt que d'être posée à un
 *     étage choisi pour elle.
 *
 * **2. L5 reste dans l'énumération ; les Achats sortent de l'ARBRE.**
 * ⚠️ Le piège à ne pas retomber dedans : rétrécir `orgHierarchyLevelSchema` à
 * L0-L4. L'archive 05 porte `L5 — achats, canal parallèle`, `org-mapping-plan`
 * fige « L0-L5 » et un test du contrat le garde. L'arbitrage de Louis n'est pas
 * de supprimer le niveau, c'est de le sortir de la COLONNE VERTICALE : les
 * achats sont un canal parallèle, pas un sixième étage sous les opérationnels.
 * Ils vivent donc dans {@link FocalOrgView.procurement}, à côté de l'arbre.
 *
 * Le module est PUR : il ne complète rien, n'invente rien, et rend `null`
 * partout où le graphe ne sait pas — jamais un zéro ni un intitulé de repli.
 */

/* ------------------------------------------------------------------ */
/*  Badges de décision                                                 */
/* ------------------------------------------------------------------ */

/**
 * Le rôle COMMERCIAL d'une personne, tel qu'il s'affiche sur sa carte.
 *
 * Quatre valeurs, et le vocabulaire du FINAL §4. Ce sont des BADGES : ils se
 * posent sur une carte, ils ne déterminent jamais sa position.
 */
export type OrgDecisionBadge = 'sponsor' | 'influencer' | 'operational' | 'blocker'

/** Les étages de l'arbre. L5 n'y est pas : les Achats ont leur colonne. */
export const FOCAL_TREE_LEVELS: readonly OrgHierarchyLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4']

/** Ce qu'il faut connaître du graphe pour badger une personne. */
type BadgeContext = {
  /** Les personnes qui tiennent un siège au comité d'achat. */
  committee: ReadonlySet<string>
  /** Les personnes qui SPONSORISENT explicitement un programme (edge `sponsors`). */
  sponsors: ReadonlySet<string>
}

/**
 * Le badge d'une personne — les règles déterministes du FINAL §4, dans l'ordre.
 *
 * | Sponsor      | economic_buyer OU sponsor explicite d'un programme/périmètre. |
 * | Influenceur  | champion, technical_buyer, influencer, procurement, ou user_buyer AVEC poids de décision. |
 * | Opérationnel | L3-L4 sans autorité explicite, utilisateur terrain, ou `unknown` reconnu. |
 * | Bloqueur     | s'oppose. Jamais dans le chemin ; reste visible dans la structure. |
 *
 * Deux points que la spec écrit noir sur blanc et qu'on a tenus :
 *
 *  · **« Un champion n'est pas automatiquement sponsor. »** Un champion fait
 *    avancer un dossier ; il ne signe pas. Le promouvoir enverrait le commercial
 *    demander un budget à quelqu'un qui n'en a pas, et lui ferait perdre son
 *    seul allié en le mettant en porte-à-faux.
 *  · **« user buyer AVEC poids de décision. »** Le poids ne se devine pas : la
 *    seule preuve que le graphe en porte est un SIÈGE au comité d'achat. Sans
 *    siège, l'utilisateur est un relais terrain — un Opérationnel.
 *
 * `null` = le graphe ne dit rien de cette personne. Ce n'est pas « Opérationnel
 * par défaut » : Opérationnel affirme « pas d'autorité connue à ce niveau »,
 * `null` affirme qu'on ne sait pas où elle se situe. Cette distinction est
 * exactement ce que {@link measureGeneratorColouring} compte.
 */
/**
 * #3423.7 — LE rôle décisionnel d'une personne, dans le vocabulaire de la FICHE
 * contact (`contacts:roles.*` : « Référent technique », « Décideur économique »…).
 * La carte l'affiche tel quel ; le badge commercial à quatre valeurs en reste
 * distinct et se NOMME « Rôle dans la vente ». Une correction humaine (la valeur
 * de la fiche) gagne sur le graphe. `null` = rien d'établi — jamais « Inconnu ».
 */
const GRAPH_ROLE_TO_CONTACT_ROLE: ReadonlyArray<readonly [string, string]> = [
  ['blocker', 'blocker'],
  ['economic_buyer', 'economic'],
  ['technical_buyer', 'technical'],
  ['champion', 'champion'],
  ['influencer', 'influencer'],
  ['procurement', 'procurement'],
  ['user_buyer', 'user'],
]

export function personDecisionRole(roles: readonly string[], contactRole?: string | null): string | null {
  if (contactRole && contactRole !== 'unknown') return contactRole
  return GRAPH_ROLE_TO_CONTACT_ROLE.find(([graphRole]) => roles.includes(graphRole))?.[1] ?? null
}

export function decisionBadgeOf(person: OrgPerson, ctx: BadgeContext): OrgDecisionBadge | null {
  const roles = person.decisionRoles
  if (roles.includes('blocker')) return 'blocker'
  // ⚠️ `unknown` est un rôle NOMMÉ, pas un rôle discret : il dit « le générateur
  // n'a rien pu établir ». Il rendait « Opérationnel », qui affirme au contraire
  // « pas d'autorité connue À CE NIVEAU » — une affirmation de terrain posée sur
  // une absence de donnée, et le nœud sortait donc du gris qu'il devait rester.
  if (roles.includes('unknown')) return null
  if (roles.includes('economic_buyer') || ctx.sponsors.has(person.id)) return 'sponsor'
  if (
    roles.includes('champion') ||
    roles.includes('technical_buyer') ||
    roles.includes('influencer') ||
    roles.includes('procurement')
  ) {
    return 'influencer'
  }
  if (roles.includes('user_buyer')) return ctx.committee.has(person.id) ? 'influencer' : 'operational'
  if (person.hierarchyLevel === 'L3' || person.hierarchyLevel === 'L4') return 'operational'
  return null
}

/* ------------------------------------------------------------------ */
/*  Les formes rendues                                                 */
/* ------------------------------------------------------------------ */

/**
 * D'OÙ vient le rattachement affiché sur la carte.
 *
 * `hierarchy`  — une `hierarchyEdge` de type `reports_to`. Le graphe la porte
 *                comme une ligne d'organigramme (vérifiée, ou inférée mais
 *                étayée par une preuve qui a observé le lien).
 * `hypothesis` — une influence de topic `rattachement hiérarchique` : le N+1 que
 *                le modèle a SUPPOSÉ à partir du poste, et que personne n'a
 *                observé. Ce n'est pas une ligne de l'organigramme, et l'écran
 *                ne doit jamais la dessiner comme telle.
 *
 * Les deux ne se confondent pas, et c'est tout l'objet de la distinction : le
 * correctif P0 du 29/08 a fait passer TOUS les `reportingTo` du premier cas au
 * second. Les mélanger reviendrait à ré-afficher une supposition comme un fait.
 *
 * `inferred`   — #4016 L4.2 (décision Louis 11/10/2026) : un N+1 PROBABLE DÉDUIT
 *                des intitulés (`orgInferredReportings`, provenance `inferred`)
 *                quand ni le graphe ni l'analyse n'en portent. Badgé
 *                « probable », en pointillés, jamais écrit dans le graphe.
 */
type FocalReportingOrigin = 'hierarchy' | 'hypothesis' | 'inferred'

/** Le rattachement d'une personne, tel que le graphe le PROUVE (ou pas). */
type FocalReporting = {
  /** L'identifiant du N+1 — c'est lui qui donne une CIBLE à « vérifier ce lien ». */
  managerId: string
  managerName: string
  /** Trait plein quand la ligne est vérifiée et sourcée ; pointillé sinon. */
  verified: boolean
  /**
   * La confiance du graphe, ou `null` quand il n'y a PAS de score à montrer.
   *
   * ⚠️ Une hypothèse rend `null`, et ce n'est pas une omission. Le graphe porte
   * bien un nombre sur l'influence (15 sur un `reportingTo` typique, 0 quand
   * aucun facteur ne joue) — mais ce nombre est NU : il ne porte aucun axe, et
   * « sous 3 axes, il n'y a pas de score ». Affiché à côté d'un nom de N+1, il
   * se lirait de surcroît comme une chance que le rattachement soit vrai, ce
   * qu'on n'affiche jamais. Ce qui est vrai et suffisant à dire, c'est que
   * personne n'a observé ce lien — et {@link reasoning} le dit en toutes lettres.
   */
  confidence: number | null
  origin: FocalReportingOrigin
  /**
   * CE QUE LE TRAIT A LE DROIT D'AFFIRMER — la règle du CONTRAT, lue ici.
   *
   * ⚠️ `verified` juste au-dessus répond à « qu'est-ce que le graphe DÉCLARE
   * prouvé ? » ; `linkOrigin` répond à « qu'est-ce que l'écran peut MONTRER ? ».
   * Les deux divergent sur un cas réel et fréquent : un lien déclaré vérifié
   * dont les `sourceIds` ne retombent sur AUCUNE source réellement émise. Le
   * premier dit « vrai », le second dit `assumed` — parce qu'afficher un trait
   * plein reviendrait à montrer une provenance fabriquée.
   *
   * Il vit sur la carte, et non dans chaque écran, pour une raison mesurée :
   * les trois vues commutables du 31/08 dessinent toutes ce même rattachement.
   * Trois lectures de la même règle finissent par diverger, et le jour où elles
   * divergent, une supposition se dessine comme un fait sur l'un des écrans.
   */
  linkOrigin: OrgLinkOrigin
  /**
   * Les preuves du LIEN lui-même, RÉSOLUES — celles que l'écran peut montrer.
   *
   * Vide quand le graphe n'en cite aucune, ou quand celles qu'il cite ne
   * retombent sur rien. C'est la même liste qui décide de `linkOrigin` : un
   * trait qui dit « hypothèse appuyée sur … » doit pouvoir montrer sur QUOI.
   */
  sources: OrgSource[]
  /** Ce que l'analyse a écrit pour expliquer une HYPOTHÈSE. `null` pour une
   *  ligne hiérarchique, qui n'est pas une supposition à justifier. */
  reasoning: string | null
}

/** #4072.1 — ce que l'espace sait d'une personne : pourquoi on la connaît, et depuis quand (`null` = date inconnue). */
export type FocalKnown = { reasons: readonly ('crm' | 'mission')[]; lastDate: string | null }

export type FocalPersonCard = {
  id: string
  /** #4072.1 — connue de l'espace (CRM, mission passée) ; `null` = rien de connu, rien d'affiché. */
  known: FocalKnown | null
  fullName: string
  title: string | null
  /** `null` quand le graphe ne sait pas situer la personne. Jamais un étage deviné. */
  level: OrgHierarchyLevel | null
  entityId: string | null
  entityName: string | null
  badge: OrgDecisionBadge | null
  /** #3423.7 — le rôle décisionnel de la FICHE (clé `contacts:roles.*`), `null` si non établi. */
  decisionRole: string | null
  /**
   * Le badge « déduit » de `T5.md:804-813` — « ✓ si inféré », toujours.
   *
   * `true` = aucune source n'a OBSERVÉ ce rôle : il vient d'une règle nommée
   * lue sur le titre. « Sponsor » posé sur une carte se lit comme un fait ; il
   * faut donc dire quand c'est une déduction, sinon le commercial va demander un
   * budget à quelqu'un dont personne n'a vu qu'il en avait un.
   */
  roleInferred: boolean
  /**
   * Les rôles d'achat BRUTS, tels que le contrat les nomme.
   *
   * ⚠️ Le badge ci-dessus en est la LECTURE COMMERCIALE (quatre valeurs) ; ceci
   * est le vocabulaire du graphe (huit valeurs, `orgDecisionRoleSchema`). La vue
   * Hiérarchie du 31/08 affiche les rôles bruts sur ses cartes, exactement comme
   * la maquette le demande — et elle les prend ICI plutôt que de s'en fabriquer
   * un second jeu. Deux vocabulaires pour la même chose, c'est deux écrans qui
   * appellent « champion » deux choses différentes.
   */
  roles: readonly OrgDecisionRole[]
  confidence: number
  identityStatus: OrgPerson['identityStatus']
  sources: OrgSource[]
  /**
   * Quand cette personne a été vérifiée pour la dernière fois (#2553.3) —
   * `null` = jamais. La carte transporte la date BRUTE ; c'est
   * {@link readOrgFreshness} qui décide si elle est encore fraîche, au moment
   * du RENDU (« aujourd'hui » ne se fige pas dans un read-model).
   */
  lastVerifiedAt: string | null
  /**
   * Le N+1 que le graphe porte, avec son statut de preuve. `null` = aucun lien.
   *
   * « Aucun trait : relation non prouvée. Le silence est un état correct »
   * (FINAL §6). L'écran le DIT plutôt que de laisser croire à un oubli.
   */
  reporting: FocalReporting | null
  /**
   * La carte est-elle ATTÉNUÉE ? — décision 5 du FINAL.
   *
   * ⚠️ La v3 demandait de retirer un bloqueur du graphe. Le FINAL refuse
   * exactement l'inverse : « masquer complètement un blocker hiérarchiquement
   * réel falsifie l'organigramme ; on l'exclut du chemin, pas de la structure ».
   * Un bloqueur retiré, c'est un commercial qui ne comprend pas pourquoi son
   * dossier n'avance pas — la personne qui le freine n'est nulle part.
   */
  attenuated: boolean
}

type FocalLevelRow = {
  level: OrgHierarchyLevel
  people: FocalPersonCard[]
}

type FocalDirection = {
  id: string
  name: string
  type: OrgEntityType
  /** Personnes de la direction ET de ses entités descendantes — le périmètre lu. */
  peopleCount: number
  /** Personnes rattachées DIRECTEMENT à cette entité. */
  directPeopleCount: number
}

type FocalPathStep = {
  step: number
  person: FocalPersonCard
  objective: string
  channel: string | null
  unlocks: string | null
  fallback: string | null
}

/** Le verdict de l'écran : par qui commencer, pourquoi, et ce que ça débloque.
 *  Entièrement composé de champs du graphe — aucune phrase n'est fabriquée. */
type FocalVerdict = {
  name: string
  objective: string
  unlocks: string | null
}

/**
 * Le bandeau de couverture — celui du CONTRAT, tel quel.
 *
 * ⚠️ Ce fichier en portait sa PROPRE version, et elle mentait (D278, 30/08/2026).
 * Six compteurs recomptés à la main sur `graph.people` — la PROJECTION, celle
 * que la vague d'enrichissement borne à cinquante — dont deux faux :
 *
 *   · « rattachés », que `orgCoverageSchema` et l'assembleur Python REFUSENT
 *     tous deux de produire, avec la même raison écrite au-dessus du champ. Sur
 *     AIRBUS, l'écran affichait « 2 241 découverts · 43 rattachés » — mot pour
 *     mot l'exemple que le contrat donne pour expliquer son refus.
 *   · « enrichis IA », qui annonçait 9 (les nœuds projetés) là où le run en avait
 *     mesuré 16 — mesuré sur le dossier de démonstration Société Générale.
 *
 * D'où le type importé plutôt que redéclaré : « une dérivation vit à un seul
 * endroit » n'est pas une préférence d'organisation, c'est la seule chose qui
 * empêche deux écrans d'annoncer deux nombres et de laisser l'utilisateur
 * choisir lequel croire.
 */
type FocalCoverage = OrgCoverageHeader

/**
 * Le PLANCHER DE GRIS, tel que l'écran le LIT — la vraie règle des 60 %.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE LA SOURCE DEMANDE, ET CE QUE LE DÉPÔT EN AVAIT FAIT
 * ─────────────────────────────────────────────────────────────────────────
 * `T5.md:798-802` pose un PLANCHER SUR LE GÉNÉRATEUR : « au moins 60 % des
 * NŒUDS sont gris sans enrichissement ; si le générateur colore plus, il
 * invente. »
 *
 * `orgGraphData.ts` en avait fait un PLAFOND D'ÉTIQUETTE AU LECTEUR, porté par
 * les ARÊTES inférées : `inferred / (verified + inferred) ≥ 0,6`. Numérateur,
 * dénominateur et sens, tous les trois changés. Conséquence mesurée : un graphe
 * dont 100 % des liens sont officiels n'affichait aucune mention **tout en
 * colorant 100 % des personnes** d'un rôle déduit de leur titre. La phrase la
 * plus fausse de l'écran était donc parfaitement silencieuse.
 *
 * ⚠️ Et une première correction avait déplacé la mesure ICI, côté écran, en
 * l'avouant à demi-mot : « ce que cette fonction ne peut pas faire, c'est
 * réparer le générateur ». C'était encore la mauvaise adresse — un plancher qui
 * ACCUSE le générateur doit être calculé PAR lui, sur ce qu'il vient de
 * produire, sinon il ne fait jamais échouer que la lecture. La mesure vit
 * désormais dans `apps/ia/app/services/org_graph_colouring.py`, voyage AVEC le
 * graphe (`orgColouringSchema`) et est GARDÉE sur les comptes de référence
 * (`apps/ia/tests/test_org_grey_floor.py`). L'écran la LIT.
 *
 * Le repli ci-dessous n'existe que pour les dossiers analysés AVANT ce
 * chantier : leur graphe ne porte pas le bloc, et recalculer vaut mieux que se
 * taire. Il applique la MÊME définition — sinon les deux nombres divergeraient,
 * ce qui est exactement comme `MOSTLY_INFERRED_RATIO` s'est mis à compter des
 * arêtes.
 *
 * `null` quand il n'y a rien à mesurer (aucune personne non enrichie). Un
 * « 0 % » y serait faux : ce n'est pas que rien n'est gris, c'est que la
 * question ne se pose pas.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ ET UNE SECONDE ABSENCE, QUE LE REPLI CONFONDAIT AVEC UNE MESURE (D267)
 * ─────────────────────────────────────────────────────────────────────────
 * Mesuré en production sur le dossier ROCHE, le 30/08/2026 :
 *
 *   > « sur les 35 personnes que l'analyse n'a pas enrichies, seules **0 %** ne
 *   >   portent aucun rôle de décision, alors que le plancher est de 60 % »
 *
 * Ce « 0 % » n'était pas une mesure. Le repli applique la définition NEUVE du
 * gris — « aucun rôle autre que `unknown` » — à un graphe écrit par le
 * générateur d'AVANT, dont le vocabulaire ne contenait pas `unknown` : il ne
 * pouvait pas dire « je ne sais pas ». Un générateur muet produit mécaniquement
 * zéro nœud gris, et en conclure qu'il a tout colorié sans preuve est un verdict
 * tiré d'un silence.
 *
 * D'où `grey`, `share` et `meetsFloor` NULLABLES. Trois états, et non deux :
 *
 *   · `null` (la fonction) — rien à mesurer, aucune personne non enrichie ;
 *   · `meetsFloor: null`   — on n'a PAS PU mesurer : l'écran se tait ;
 *   · `meetsFloor: false`  — on A mesuré, et c'est sous le plancher : l'écran
 *                            alerte, et c'est le cas qu'il ne faut surtout pas
 *                            perdre en faisant taire le précédent.
 */
export type GeneratorColouring = {
  /** Personnes que l'IA n'a pas enrichies — le seul ensemble que la règle vise. */
  unenriched: number
  /** Parmi elles, celles dont le rôle de décision reste `unknown`. `null` = non mesurable. */
  grey: number | null
  /** Part grise, 0-1. `null` = non mesurable — surtout pas `0`. */
  share: number | null
  /** Le plancher appliqué, 0-1 — celui que le graphe transporte. */
  floor: number
  /** `true` tenu · `false` mesuré et sous le plancher · `null` non mesurable. */
  meetsFloor: boolean | null
}

/**
 * Ce que l'écran montre des DIRECTIONS d'un groupe, et ce qu'il ne montre pas.
 *
 * `T5.md:1051`, cas limite « Groupe à 1 000 filiales (VINCI) » :
 *
 *   > **4 entités maximum affichées**, les mieux scorées, avec « + 996 autres ».
 *
 * Deux choses que ce type oblige à tenir, et qui font toute la différence entre
 * un plafond honnête et une troncature muette :
 *
 *  1. **« + 996 autres » est un COMPTE, donc il est EXACT.** C'est le nombre de
 *     directions que ce graphe porte et que la rangée ne montre pas — ni une
 *     estimation, ni le nombre de filiales du groupe, que personne n'a mesuré.
 *     Le libellé le dit : « autres directions cartographiées ». Annoncer un total
 *     qu'on n'a pas collecté serait le même défaut que « non mesuré = 0 ».
 *  2. **Il y a un chemin pour voir les autres.** Le sélecteur reste exhaustif :
 *     la rangée est un raccourci vers les quatre plus peuplées, pas un mur.
 */
const MAX_VISIBLE_DIRECTIONS = 4

export type FocalOrgView = {
  directions: FocalDirection[]
  /** Les quatre mieux peuplées — la rangée de raccourcis (`T5.md:1051`). */
  topDirections: FocalDirection[]
  /** EXACT : les directions que la rangée ne montre pas. 0 = elle les montre toutes. */
  hiddenDirections: number
  direction: FocalDirection
  /**
   * #4177.2 — l'entité DEMANDÉE n'a aucune personne dans son périmètre : la vue
   * affichée est une autre (`direction`), et l'écran DIT que la couverture de
   * celle-ci manque au lieu de s'y substituer en silence. `null` = la direction
   * demandée est celle qu'on lit.
   */
  requestedWithoutPeople: { id: string; name: string } | null
  /** L0→L4, uniquement les étages que la direction porte réellement. */
  levelRows: FocalLevelRow[]
  /** Rattachées à la direction, sans niveau connu — hors de l'arbre, et dites. */
  unleveled: FocalPersonCard[]
  /** Achats et contrôle : canal PARALLÈLE, hors de la colonne hiérarchique. */
  procurement: FocalPersonCard[]
  /** Le chemin recommandé, bloqueurs retirés et étapes renumérotées. */
  path: FocalPathStep[]
  /** Les bloqueurs que le chemin proposait : retirés, et NOMMÉS. */
  excludedBlockers: FocalPersonCard[]
  verdict: FocalVerdict | null
  /** Toutes les personnes de la direction, ordre de lecture (niveau, confiance). */
  contacts: FocalPersonCard[]
  coverage: FocalCoverage
  colouring: GeneratorColouring | null
}

/* ------------------------------------------------------------------ */
/*  Dérivations                                                        */
/* ------------------------------------------------------------------ */

/** Une personne relève-t-elle du canal ACHATS ? — le niveau L5 ou le rôle. */
function isProcurement(person: OrgPerson): boolean {
  return person.hierarchyLevel === 'L5' || person.decisionRoles.includes('procurement')
}

const ENRICHED_STATUSES: ReadonlySet<OrgPerson['identityStatus']> = new Set(['enriched', 'actionable'])

/** Un nœud est GRIS quand aucun rôle de décision ne l'affirme — liste vide
 *  (graphes anciens) ou rôle `unknown` explicitement NOMMÉ (ce que le générateur
 *  émet depuis qu'il ne colorie plus sans preuve). Même définition que
 *  `org_graph_colouring.is_grey`, mot pour mot. */
function isGreyNode(person: OrgPerson): boolean {
  return !person.decisionRoles.some(role => role !== 'unknown')
}

/** Les personnes qui sponsorisent explicitement un programme/périmètre. */
function sponsorIds(graph: OrgGraph): Set<string> {
  const out = new Set<string>()
  for (const edge of graph.hierarchyEdges) {
    if (edge.type === 'sponsors' || edge.type === 'owns_budget') out.add(edge.fromId)
  }
  return out
}

function badgeContext(graph: OrgGraph): BadgeContext {
  return {
    committee: new Set(graph.buyingCommittee.map(seat => seat.personId)),
    sponsors: sponsorIds(graph),
  }
}

/**
 * Le graphe SAIT-il dire « je ne sais pas » ?
 *
 * C'est la question que le repli doit se poser AVANT de compter des nœuds gris,
 * et qu'il ne se posait pas (D267). Le gris est une affirmation d'ignorance : un
 * graphe dont AUCUNE personne ne porte ni `unknown` ni une liste de rôles vide
 * n'a pas les mots pour l'exprimer. Compter zéro gris sur un tel graphe ne
 * mesure pas le générateur, ça mesure son vocabulaire.
 *
 * ⚠️ La question se pose sur TOUTES les personnes, pas seulement les non
 * enrichies : le vocabulaire appartient au graphe entier. Un graphe où seules
 * des personnes enrichies portent `unknown` sait quand même le dire.
 */
function speaksGrey(graph: OrgGraph): boolean {
  return graph.people.some(person => person.decisionRoles.length === 0 || person.decisionRoles.includes('unknown'))
}

export function measureGeneratorColouring(graph: OrgGraph): GeneratorColouring | null {
  // Le graphe porte SA mesure : le générateur l'a calculée sur ce qu'il venait
  // de produire. On la lit, on ne la refait pas. Elle est SOUVERAINE — le
  // générateur, lui, a pu mesurer, y compris pour conclure à zéro gris.
  const measured = readOrgColouring(graph)
  if (measured) return measured

  // Repli — dossiers analysés avant ce chantier. Même définition, sinon les deux
  // nombres divergent et personne ne sait lequel croire.
  const unenriched = graph.people.filter(person => !ENRICHED_STATUSES.has(person.identityStatus))
  if (unenriched.length === 0) return null

  // Le graphe n'a pas les mots : on dit qu'on n'a pas pu mesurer, et le nombre
  // de personnes concernées reste vrai. Écrire « 0 % de gris » ici accuserait le
  // générateur d'avoir inventé, sur la seule foi d'un vocabulaire absent.
  if (!speaksGrey(graph)) {
    return { unenriched: unenriched.length, grey: null, share: null, floor: ORG_GREY_NODE_FLOOR, meetsFloor: null }
  }

  const grey = unenriched.filter(isGreyNode).length
  const share = grey / unenriched.length
  return {
    unenriched: unenriched.length,
    grey,
    share,
    floor: ORG_GREY_NODE_FLOOR,
    meetsFloor: share >= ORG_GREY_NODE_FLOOR,
  }
}

/** Les descendants d'une entité, elle comprise. Un cycle ne boucle pas. */
function subtreeOf(entities: readonly OrgEntity[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>()
  for (const entity of entities) {
    if (!entity.parentId || entity.parentId === entity.id) continue
    childrenOf.set(entity.parentId, [...(childrenOf.get(entity.parentId) ?? []), entity.id])
  }
  const out = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    const id = queue.shift() as string
    for (const child of childrenOf.get(id) ?? []) {
      if (out.has(child)) continue
      out.add(child)
      queue.push(child)
    }
  }
  return out
}

/**
 * Les directions proposables : les entités qui portent DIRECTEMENT au moins une
 * personne. Une entité vide n'est pas une direction commerciale — la proposer
 * ferait choisir un périmètre où il n'y a personne à appeler.
 *
 * #3121 (beta, 27/09/2026) — triées par NOMBRE DE PERSONNES décroissant (le
 * sous-arbre, celui que le sélecteur affiche à côté du nom) : « toujours
 * afficher l'entité qui a le plus grand nombre de personnes ». À égalité, tri
 * STABLE (aucune clé secondaire) : l'ordre ACTUEL décide, jamais l'alphabet.
 */
export function listFocalDirections(graph: OrgGraph): FocalDirection[] {
  const entityById = new Map(graph.entities.map(entity => [entity.id, entity]))
  const direct = new Map<string, number>()
  for (const person of graph.people) {
    if (!person.entityId || !entityById.has(person.entityId)) continue
    direct.set(person.entityId, (direct.get(person.entityId) ?? 0) + 1)
  }
  return [...direct.entries()]
    .map(([id, directPeopleCount]) => {
      const entity = entityById.get(id) as OrgEntity
      const scope = subtreeOf(graph.entities, id)
      return {
        id,
        name: entity.name,
        type: entity.type,
        peopleCount: graph.people.filter(person => person.entityId && scope.has(person.entityId)).length,
        directPeopleCount,
      }
    })
    .sort((a, b) => b.peopleCount - a.peopleCount)
}

/**
 * La direction ouverte par défaut.
 *
 * #3121 (beta, 27/09/2026) — retour bêta TRANCHÉ : « toujours afficher
 * l'entité qui a le plus grand nombre de personnes ». C'est donc la première
 * de {@link listFocalDirections} (déjà triée par personnes décroissant, égalité
 * → ordre actuel), quel que soit le chemin recommandé — un chemin peut très
 * bien commencer chez une entité minoritaire, ce n'est plus elle qui choisit
 * l'onglet ouvert par défaut.
 *
 * À défaut de personne rattachée, `null` — jamais une entité prise au hasard.
 */
export function defaultFocalDirectionId(graph: OrgGraph): string | null {
  const directions = listFocalDirections(graph)
  if (directions.length === 0) return null
  return (directions[0] as FocalDirection).id
}

export function buildFocalOrgView(
  graph: OrgGraph,
  directionId: string | null,
  options: {
    discovered?: number | null
    /**
     * #2121.15 / #2121.54 — l'ordre du CHEMIN RECOMMANDÉ DE CONTACTS
     * (`useContactRanking`, `GET /contacts/account/:id/ranking`), la MÊME
     * vérité que l'onglet Contacts (GA-26 : un classement vit à un seul
     * endroit). Identifiants de PERSONNES du graphe (`FocalPersonCard.id`),
     * dans l'ordre d'utilité — position 0 = le plus utile.
     *
     * Absent ou vide ⇒ défaut CONSERVATEUR inchangé : le tri retombe
     * intégralement sur `byLevelThenConfidence`, exactement le comportement
     * d'avant ce point. Une liste partielle (certains contacts classés,
     * d'autres non) est un état normal, jamais une erreur : les classés
     * passent en tête dans leur ordre, les autres suivent, triés comme avant.
     */
    topContactIds?: readonly string[] | null
    /** #3423.7 — `decision_role` des fiches contact par id de personne : la correction humaine gagne. */
    contactRoleByPersonId?: ReadonlyMap<string, string | null>
    /**
     * #4072.1 — les personnes que l'espace CONNAÎT déjà chez ce compte (contacts
     * du CRM, interlocuteurs de missions passées), par id de personne du graphe.
     * Elles sont MARQUÉES et passent devant DANS leur niveau : le niveau reste la
     * géométrie (GA-100), la connaissance ne fait que départager. Absent ou vide ⇒
     * l'ordre d'avant ce point, au caractère près.
     */
    knownByPersonId?: ReadonlyMap<string, FocalKnown>
  } = {},
): FocalOrgView | null {
  const directions = listFocalDirections(graph)
  if (directions.length === 0) return null

  const entityById = new Map(graph.entities.map(entity => [entity.id, entity]))
  const requestedEntity = directionId ? entityById.get(directionId) : undefined
  // #4177.1 — une entité sans personne EN PROPRE mais dont les filiales en
  // portent (le groupe) ouvre SON périmètre : le sous-arbre est déjà la
  // définition du périmètre d'une direction (`subtreeOf`).
  const requestedScope = requestedEntity ? subtreeOf(graph.entities, requestedEntity.id) : null
  const requestedPeople = requestedScope
    ? graph.people.filter(person => person.entityId && requestedScope.has(person.entityId)).length
    : 0
  const wanted =
    directions.find(direction => direction.id === directionId) ??
    (requestedEntity && requestedPeople > 0
      ? {
          id: requestedEntity.id,
          name: requestedEntity.name,
          type: requestedEntity.type,
          peopleCount: requestedPeople,
          directPeopleCount: 0,
        }
      : undefined)
  const fallbackId = defaultFocalDirectionId(graph)
  const direction =
    wanted ?? directions.find(candidate => candidate.id === fallbackId) ?? (directions[0] as FocalDirection)
  // #4177.2 — l'entité existe mais n'a personne dans son périmètre : jamais
  // lue à la place d'une autre sans le dire.
  const requestedWithoutPeople =
    !wanted && requestedEntity ? { id: requestedEntity.id, name: requestedEntity.name } : null

  const scope = subtreeOf(graph.entities, direction.id)
  const ctx = badgeContext(graph)

  // Le N+1 tel que le graphe le PROUVE. Une seule ligne par personne : la mieux
  // établie (vérifiée d'abord, puis la plus confiante). Deux `reports_to`
  // concurrents sur la même personne ne se moyennent pas — on montre le plus
  // solide, et l'autre reste lisible dans les quatre vues.
  type ReportingLink = { toId: string; verified: boolean; confidence: number | null } & Pick<
    FocalReporting,
    'origin' | 'linkOrigin' | 'sources' | 'reasoning'
  >
  // Les preuves d'un edge sont des IDENTIFIANTS ; ce résolveur les retombe sur
  // les `OrgSource` réellement émises par un nœud. Il vit dans `orgGraphData` et
  // il est LU ici : deux résolveurs qui divergeraient feraient dire à un lien
  // « sourcé » sur un écran et « hypothèse » sur l'autre.
  const resolveSources = orgSourceResolver(graph)
  const bestReporting = new Map<string, ReportingLink>()
  for (const edge of graph.hierarchyEdges) {
    if (edge.type !== 'reports_to') continue
    const current = bestReporting.get(edge.fromId)
    const better =
      !current ||
      (edge.verified && !current.verified) ||
      (edge.verified === current.verified && edge.confidence > (current.confidence ?? -1))
    if (better) {
      const sources = resolveSources(edge.sourceIds)
      bestReporting.set(edge.fromId, {
        toId: edge.toId,
        verified: edge.verified,
        confidence: edge.confidence,
        origin: 'hierarchy',
        // LA règle du contrat, appliquée à ce trait — pas une seconde lecture.
        linkOrigin: orgLinkOrigin({ nature: 'reports_to', verified: edge.verified, sources }),
        sources,
        reasoning: null,
      })
    }
  }

  // ── Le N+1 SUPPOSÉ, quand le graphe n'en porte aucun de prouvé (D360) ──────
  //
  // ⚠️ C'est le cas de TOUS les dossiers analysés depuis le correctif P0 du
  // 29/08 : un `reportingTo` est une supposition du modèle, sa provenance est
  // `llm`, donc grounding C, donc le resolver la range en INFLUENCE. Mesuré le
  // 30/08 sur la sortie réelle de l'assembleur : `reports_to` produits = 0,
  // influences « rattachement hiérarchique » = une par `reportingTo`.
  //
  // Sans cette lecture, la carte d'une personne n'affichait plus aucun
  // rattachement — et « vérifier ce lien », qui ne se rend que sur un
  // rattachement non vérifié, ne se rendait donc JAMAIS sur l'écran d'arrivée.
  // Le produit savait recueillir une affirmation humaine (le tiroir de
  // correction) et ne savait plus proposer de vérifier une hypothèse machine :
  // l'exact inverse de « on propose, l'utilisateur tranche ».
  //
  // La ligne hiérarchique GAGNE toujours : une hypothèse ne remplace jamais un
  // lien que le graphe porte, même faiblement noté.
  for (const hypothesis of orgReportingHypotheses(graph)) {
    if (bestReporting.has(hypothesis.fromId)) continue
    bestReporting.set(hypothesis.fromId, {
      toId: hypothesis.toId,
      verified: false,
      confidence: null,
      origin: 'hypothesis',
      // Une hypothèse ne se dessine JAMAIS comme un fait, quelle que soit sa
      // provenance : le contrat rend `assumed` dès que `verified` est faux.
      linkOrigin: orgLinkOrigin({ nature: 'reports_to', verified: false, sources: [] }),
      // Personne n'a OBSERVÉ ce rattachement : il n'y a rien à montrer, et une
      // preuve fabriquée pour meubler la ligne serait pire que le vide.
      sources: [],
      reasoning: hypothesis.reasoning,
    })
  }

  // ── #4016 L4.2 — le N+1 PROBABLE des intitulés, en DERNIER recours ────────
  //
  // La preuve gagne, puis la supposition de l'analyse, puis seulement la
  // déduction (`orgInferredReportings` exclut déjà toute personne rattachée par
  // l'une des deux). Provenance `inferred` : jamais vérifiée, aucune source —
  // elle n'a rien observé — et un trait `assumed` (pointillés).
  for (const inferred of orgInferredReportings(graph)) {
    if (bestReporting.has(inferred.fromId)) continue
    bestReporting.set(inferred.fromId, {
      toId: inferred.toId,
      verified: false,
      confidence: null,
      origin: 'inferred',
      linkOrigin: orgLinkOrigin({ nature: 'reports_to', verified: false, sources: [] }),
      sources: [],
      reasoning: null,
    })
  }

  const nameOf = (id: string): string | null =>
    graph.people.find(person => person.id === id)?.fullName ?? entityById.get(id)?.name ?? null

  const toCard = (person: OrgPerson): FocalPersonCard => {
    const badge = decisionBadgeOf(person, ctx)
    const link = bestReporting.get(person.id)
    const managerName = link ? nameOf(link.toId) : null
    return {
      id: person.id,
      known: options.knownByPersonId?.get(person.id) ?? null,
      fullName: person.fullName,
      title: person.title?.trim() || null,
      level: person.hierarchyLevel ?? null,
      entityId: person.entityId ?? null,
      entityName: person.entityId ? (entityById.get(person.entityId)?.name ?? null) : null,
      badge,
      decisionRole: personDecisionRole(person.decisionRoles, options.contactRoleByPersonId?.get(person.id)),
      // `roleInferred === true` ET un badge à qualifier. Un bloqueur porte aussi
      // la mention : sa posture est une lecture, pas une observation.
      roleInferred: badge !== null && person.roleInferred === true,
      roles: [...person.decisionRoles],
      confidence: person.confidence,
      identityStatus: person.identityStatus,
      sources: person.sources,
      lastVerifiedAt: person.lastVerifiedAt ?? null,
      reporting:
        link && managerName
          ? {
              managerId: link.toId,
              managerName,
              verified: link.verified,
              confidence: link.confidence,
              origin: link.origin,
              linkOrigin: link.linkOrigin,
              sources: link.sources,
              reasoning: link.reasoning,
            }
          : null,
      attenuated: badge === 'blocker',
    }
  }

  const inScope = graph.people.filter(person => person.entityId != null && scope.has(person.entityId))
  const cards = inScope.map(toCard)

  // ⚠️ `indexOf` rend −1 pour L5, qui n'est pas un étage de l'arbre : sans ce
  // garde-fou, l'acheteur passait DEVANT le PDG dans tous les tris de l'écran.
  // C'est le test « triés par niveau puis par confiance » qui l'a attrapé.
  const levelRank = (level: OrgHierarchyLevel | null): number => {
    if (!level) return FOCAL_TREE_LEVELS.length + 1
    const index = FOCAL_TREE_LEVELS.indexOf(level)
    return index === -1 ? FOCAL_TREE_LEVELS.length : index
  }
  const byLevelThenConfidence = (a: FocalPersonCard, b: FocalPersonCard) =>
    levelRank(a.level) - levelRank(b.level) ||
    // #4072.1 — à niveau égal, la personne que l'espace connaît déjà passe devant.
    Number(b.known !== null) - Number(a.known !== null) ||
    b.confidence - a.confidence ||
    a.fullName.localeCompare(b.fullName)

  // #2121.15 / #2121.54 — le tableau du bas montre les contacts UTILES en
  // premier, dans l'ordre du MÊME classement que l'onglet Contacts — jamais un
  // second calcul d'utilité. `??` : sans classement (compte pas encore
  // classé, requête en cours, `accountId` absent), le tri est celui d'avant.
  const usefulRank = new Map((options.topContactIds ?? []).map((id, index) => [id, index]))
  const byUsefulness = (a: FocalPersonCard, b: FocalPersonCard) => {
    const rankA = usefulRank.get(a.id)
    const rankB = usefulRank.get(b.id)
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB
    if (rankA !== undefined) return -1
    if (rankB !== undefined) return 1
    return byLevelThenConfidence(a, b)
  }

  const procurement = cards.filter(card => {
    const person = inScope.find(p => p.id === card.id) as OrgPerson
    return isProcurement(person)
  })
  const procurementIds = new Set(procurement.map(card => card.id))
  const structural = cards.filter(card => !procurementIds.has(card.id))

  const levelRows: FocalLevelRow[] = FOCAL_TREE_LEVELS.map(level => ({
    level,
    people: structural.filter(card => card.level === level).sort(byLevelThenConfidence),
  })).filter(row => row.people.length > 0)

  const unleveled = structural.filter(card => card.level === null).sort(byLevelThenConfidence)

  // ── Le chemin recommandé ────────────────────────────────────────────────
  // Un bloqueur n'y entre JAMAIS (décision 5). Le serveur les exclut déjà ;
  // l'écran le refait parce que c'est lui qui porte la promesse devant
  // l'utilisateur, et parce qu'un chemin arrivant d'un dossier ancien n'a pas
  // été filtré. Ce qui est retiré est NOMMÉ — un silence se lirait comme un
  // oubli, et le commercial doit savoir que quelqu'un bloque son périmètre.
  const cardById = new Map(cards.map(card => [card.id, card]))
  const allCards = new Map(graph.people.map(person => [person.id, toCard(person)]))
  const ordered = [...graph.recommendedPath].sort((a, b) => a.step - b.step)
  const excludedBlockers: FocalPersonCard[] = []
  const path: FocalPathStep[] = []
  for (const step of ordered) {
    const card = cardById.get(step.personId) ?? allCards.get(step.personId)
    if (!card) continue
    if (card.badge === 'blocker') {
      excludedBlockers.push(card)
      continue
    }
    path.push({
      step: path.length + 1,
      person: card,
      objective: step.objective,
      channel: step.channel?.trim() || null,
      unlocks: step.unlocks?.trim() || null,
      fallback: step.fallback?.trim() || null,
    })
  }

  const head = path[0]
  const verdict: FocalVerdict | null = head
    ? { name: head.person.fullName, objective: head.objective, unlocks: head.unlocks }
    : null

  const discovered = typeof options.discovered === 'number' ? options.discovered : null

  // Les quatre mieux scorées (`listFocalDirections` trie déjà par périmètre puis
  // par nom), PLUS la direction ouverte si elle n'y est pas : une rangée de
  // raccourcis qui ne contient pas celui qu'on regarde est un repère qui ment.
  const topDirections = directions.slice(0, MAX_VISIBLE_DIRECTIONS)
  if (!topDirections.some(candidate => candidate.id === direction.id)) {
    topDirections.splice(MAX_VISIBLE_DIRECTIONS - 1, 1, direction)
  }
  const shownIds = new Set(topDirections.map(candidate => candidate.id))

  return {
    directions,
    topDirections,
    hiddenDirections: directions.filter(candidate => !shownIds.has(candidate.id)).length,
    direction,
    requestedWithoutPeople,
    levelRows,
    unleveled,
    procurement: [...procurement].sort(byLevelThenConfidence),
    path,
    excludedBlockers,
    verdict,
    contacts: [...cards].sort(byUsefulness),
    // LA dérivation, pas une seconde. Le seul apport de l'écran est le corpus
    // VIVANT : le dossier connaît sa liste de contacts en direct, le run n'en
    // porte qu'un instantané. Tout le reste appartient au contrat.
    coverage: deriveOrgCoverage(graph, { discovered }),
    colouring: measureGeneratorColouring(graph),
  }
}

/* ------------------------------------------------------------------ */
/*  La vue GROUPE — la structure du groupe, et sa qualité             */
/* ------------------------------------------------------------------ */

/**
 * Une entité du groupe, telle que la vue Groupe la dessine.
 *
 * ⚠️ `linkOrigin` est `'structure'` sur toute entité qui a un parent, et `null`
 * sur une racine — jamais `'sourced'`. L'appartenance d'une filiale à son groupe
 * est la FORME du groupe, pas une observation sur une personne : la faire passer
 * pour un lien vérifié rendrait le trait plein ambigu d'un écran à l'autre,
 * alors qu'il ne dit qu'une chose dans tout le produit — « quelqu'un l'a
 * observé ». La règle vient du contrat ({@link orgLinkOrigin}), pas d'ici.
 */
export type OrgGroupNode = {
  id: string
  name: string
  type: OrgEntityType
  /** #2284.5-.9 — le kind qui AFFINE le type (une marque rangée en filiale),
   *  sinon `null`. GA-26 : l'écran affiche l'un OU l'autre. */
  kind: EntityKind | null
  /** #4327.2 — aucune source n'appuie cette entité : une filiale s'y étiquette « non confirmée ». */
  unconfirmed: boolean
  /** `null` = racine du groupe (ou parent introuvable — voir plus bas). */
  parentId: string | null
  /** 0 pour une racine. Sert l'indentation, jamais un classement de personnes. */
  depth: number
  /** Personnes de l'entité ET de ses descendantes. */
  peopleCount: number
  /** Personnes rattachées DIRECTEMENT à elle. */
  directPeopleCount: number
  hasChildren: boolean
  linkOrigin: OrgLinkOrigin | null
}

/**
 * Le panneau « Couverture & qualité » de la maquette Groupe.
 *
 * ⚠️ Les deux parts sont NULLABLES, et ce n'est pas de la prudence : la maquette
 * affiche « 90 % rattachés », or le contrat REFUSE de produire le rattachement
 * (`attachedToEntity` est un trou nommé, pas un zéro). Une part dont le
 * numérateur est inconnu vaut `null` — écrire « 0 % » affirmerait que personne
 * n'est rattaché, ce qui est une tout autre phrase.
 */
type OrgGroupQuality = {
  /** Part des contacts découverts rattachés à une entité. `null` = non mesurée. */
  attachedShare: number | null
  /** Part des personnes du graphe rangées à un niveau. `null` = aucune personne. */
  leveledShare: number | null
  /** Personnes du graphe portant un `hierarchyLevel`. 0 y est VRAI. */
  leveled: number
  /** Personnes du graphe. 0 y est VRAI — le graphe est alors vide. */
  people: number
}

export type OrgGroupView = {
  /** L'arbre APLATI, en ordre de lecture : racine, puis ses filles, en profondeur. */
  nodes: OrgGroupNode[]
  /** Personnes qu'aucune entité ne porte. 0 y est VRAI : toutes sont rattachées. */
  unattachedPeople: number
  coverage: OrgCoverageHeader
  colouring: GeneratorColouring | null
  quality: OrgGroupQuality
}

/**
 * Les entités RACINES d'un graphe — celles dont le parent est absent,
 * introuvable, ou reboucle sur elles-mêmes.
 *
 * #2837 : la ligne mémoire marché (`market_company_signal`, un agrégat PAR
 * ENTREPRISE, jamais ventilé par entité fille — GA-391) ne se pose QUE sur une
 * entité racine, dans les 4 vues de l'organigramme. `OrgInfluenceMap` le
 * savait déjà par construction (`view.roots`, un concept propre à sa carte) ;
 * `HierarchyOrgView`/`FocalOrgView` ont besoin de la MÊME notion pour la
 * "direction" qu'ils affichent, qui peut très bien être une entité fille —
 * d'où cette fonction, partagée plutôt que redérivée trois fois.
 */
export function orgRootEntityIds(graph: OrgGraph): Set<string> {
  const entityById = new Map(graph.entities.map(entity => [entity.id, entity]))
  const roots = new Set<string>()
  for (const entity of graph.entities) {
    // Même règle que `buildOrgGroupView` : un parent introuvable ou réflexif
    // ne fait pas disparaître l'entité, elle devient une racine.
    const parentId = entity.parentId && entity.parentId !== entity.id ? entity.parentId : null
    if (!parentId || !entityById.has(parentId)) roots.add(entity.id)
  }
  return roots
}

/**
 * LA VUE GROUPE — « comment ce groupe est-il fait ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ELLE NE RECALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * Les périmètres viennent de {@link listFocalDirections}, la couverture de
 * `deriveOrgCoverage` (le contrat), le plancher de gris de
 * {@link measureGeneratorColouring}. Ce que cette fonction AJOUTE tient en deux
 * choses que rien d'autre ne portait : la forme de l'arbre des entités, et les
 * deux parts du panneau qualité.
 *
 * `null` quand le graphe ne porte AUCUNE entité — il n'y a alors pas de groupe à
 * dessiner, et fabriquer une racine « le groupe » serait inventer un nœud.
 */
export function buildOrgGroupView(graph: OrgGraph, options: { discovered?: number | null } = {}): OrgGroupView | null {
  if (graph.entities.length === 0) return null

  const entityById = new Map(graph.entities.map(entity => [entity.id, entity]))
  const scopes = listFocalDirections(graph)
  const directById = new Map(scopes.map(scope => [scope.id, scope]))

  // Le sous-arbre d'une entité SANS personne directe n'est pas dans `scopes` :
  // on le compte ici, sur la même définition (`subtreeOf`), pour qu'un groupe
  // vide en propre annonce quand même le périmètre de ses filles.
  const peopleIn = (id: string): number => {
    const known = directById.get(id)
    if (known) return known.peopleCount
    const scope = subtreeOf(graph.entities, id)
    return graph.people.filter(person => person.entityId != null && scope.has(person.entityId)).length
  }

  // Un parent introuvable (ou soi-même) ne fait pas disparaître l'entité : elle
  // devient une RACINE (`orgRootEntityIds`). La masquer effacerait ses personnes
  // de l'écran, alors que ce qui manque est seulement le chemin qui y mène.
  const rootIds = orgRootEntityIds(graph)
  const childrenOf = new Map<string, string[]>()
  for (const entity of graph.entities) {
    const parentId = entity.parentId && entity.parentId !== entity.id ? entity.parentId : null
    if (parentId && entityById.has(parentId)) {
      childrenOf.set(parentId, [...(childrenOf.get(parentId) ?? []), entity.id])
    }
  }
  const roots: string[] = [...rootIds]

  const byWeightThenName = (a: string, b: string): number =>
    peopleIn(b) - peopleIn(a) || (entityById.get(a)?.name ?? '').localeCompare(entityById.get(b)?.name ?? '')

  const nodes: OrgGroupNode[] = []
  const visited = new Set<string>()
  const walk = (id: string, depth: number, parentId: string | null): void => {
    // Un cycle parent/enfant ne boucle pas — même garde que `subtreeOf`.
    if (visited.has(id)) return
    visited.add(id)
    const entity = entityById.get(id)
    if (!entity) return
    const children = [...(childrenOf.get(id) ?? [])].sort(byWeightThenName)
    nodes.push({
      id,
      name: entity.name,
      type: entity.type,
      kind: orgNodeRefinedKind(entity),
      unconfirmed: entity.sources.length === 0,
      parentId,
      depth,
      peopleCount: peopleIn(id),
      directPeopleCount: directById.get(id)?.directPeopleCount ?? 0,
      hasChildren: children.length > 0,
      linkOrigin: parentId ? orgLinkOrigin({ nature: 'entity_tree', verified: false, sources: [] }) : null,
    })
    for (const child of children) walk(child, depth + 1, id)
  }
  for (const root of [...roots].sort(byWeightThenName)) walk(root, 0, null)
  // Un cycle pur (A parent de B, B parent de A) n'a AUCUNE racine : ses entités
  // ne seraient nulle part. On les rattrape à plat plutôt que de les perdre.
  for (const entity of graph.entities) if (!visited.has(entity.id)) walk(entity.id, 0, null)

  const coverage = deriveOrgCoverage(graph, {
    discovered: typeof options.discovered === 'number' ? options.discovered : null,
  })
  const people = graph.people.length
  const leveled = graph.people.filter(person => person.hierarchyLevel != null).length

  return {
    nodes,
    unattachedPeople: graph.people.filter(person => !person.entityId || !entityById.has(person.entityId)).length,
    coverage,
    colouring: measureGeneratorColouring(graph),
    quality: {
      // `null` dès qu'un des deux termes manque : une part n'est pas mesurable
      // sans son numérateur, et 0 % affirmerait le contraire de « non mesuré ».
      attachedShare:
        coverage.attachedToEntity !== null && coverage.discovered !== null && coverage.discovered > 0
          ? coverage.attachedToEntity / coverage.discovered
          : null,
      leveledShare: people > 0 ? leveled / people : null,
      leveled,
      people,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  #2512 — les non-enrichis, par défaut                               */
/* ------------------------------------------------------------------ */

/** Une carte NON ENRICHIE — le contact tel qu'il a été découvert, rien de plus.
 *  Non exportée : seule `unenrichedOrgContacts`, dans ce même fichier, la produit. */
type UnenrichedOrgContact = {
  id: string
  fullName: string
  /** `null` = le contact ne porte pas de titre connu — jamais inventé. */
  title: string | null
}

/** Même clé de rapprochement que l'assembleur IA (`normalize_person_name`,
 *  `org_graph_assembler.py`) : accents, casse et ponctuation neutralisés. Les
 *  deux mondes ne partagent AUCUN id commun — `OrgPerson.id` est un id
 *  synthétisé depuis le nom, `Contact.id` un UUID de la table — donc le
 *  rapprochement ne peut se faire que sur le nom. */
export function normaliseOrgPersonName(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * #2512 — Louis, en recette : « par défaut, mettre aussi les gens NON
 * ENRICHIS dans l'organigramme ; aujourd'hui certains paraissent vides et
 * avec peu de profondeur ».
 *
 * MESURÉ : `graph.people` ne porte QUE la vague d'enrichissement IA (bornée,
 * `enrichmentBatchSize` — `org_graph_assembler.assemble_org_graph` itère
 * `contacts`, jamais `discovered_contacts`). Un contact découvert mais encore
 * non enrichi n'a donc AUCUN nœud `OrgPerson` — il n'apparaissait nulle part
 * sur l'écran, quelle que soit sa profondeur potentielle. C'est la cause
 * exacte de « certains paraissent vides » : le graphe qu'ils lisent est déjà
 * amputé de tout ce que l'enrichissement n'a pas encore touché.
 *
 * CE QUE CETTE DÉRIVATION AJOUTE, ET CE QU'ELLE N'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────
 * Elle ajoute les contacts découverts absents du graphe, avec SEULEMENT ce
 * qu'ils portent déjà (nom, titre) — jamais un niveau, un rôle ou un
 * rattachement d'entité, qu'aucune analyse n'a mesurés pour eux. La
 * PROFONDEUR de l'organigramme (les classer dans L0-L4) resterait à deviner
 * sans cette mesure : ce chantier-là est côté IA (classification des
 * niveaux), pas ici.
 */
export function unenrichedOrgContacts(
  graph: OrgGraph,
  contacts: readonly {
    id: string
    full_name: string
    title?: string | null
    entity?: string | null
    source?: string | null
  }[],
  // V4-CORRECTIFS-C 4292.6 — l'entité DEMANDÉE n'a personne dans le graphe : ses contacts (ceux dont `entity` la
  // nomme) restent listés, même rattachés ailleurs par le graphe — ils sont gardés, jamais perdus derrière l'avis.
  requestedEntityName?: string | null,
): UnenrichedOrgContact[] {
  const known = new Set(graph.people.map(person => normaliseOrgPersonName(person.fullName)))
  const wanted = requestedEntityName ? normaliseOrgPersonName(requestedEntityName) : ''
  const seen = new Set<string>()
  const out: UnenrichedOrgContact[] = []
  for (const contact of contacts) {
    // #4679 (G1) — un contact CONNU (import / CRM) est une relation, pas un « non enrichi » : il a sa place
    // (`knownOrgContacts`), jamais ce seau.
    if (isKnownContact(contact)) continue
    const key = normaliseOrgPersonName(contact.full_name)
    const namesRequested = wanted !== '' && normaliseOrgPersonName(contact.entity ?? '') === wanted
    if (!key || (known.has(key) && !namesRequested) || seen.has(key)) continue
    seen.add(key)
    out.push({ id: contact.id, fullName: contact.full_name, title: contact.title?.trim() || null })
  }
  return out
}

/**
 * #4749 — ce que l'organigramme n'a PAS pu placer, pour le NOMMER.
 *
 * MESURÉ en production (29/10/2026) : un compte à 1 658 contacts dont le graphe porte 1 673
 * personnes mais AUCUNE avec `entityId` ni arête hiérarchique. `listFocalDirections` ne retient
 * que les entités portant au moins une personne : aucune direction, `buildFocalOrgView` rend
 * `null`, et l'écran se taisait. Un rendu structuré NOMME ce qu'il n'a pas pu évaluer.
 *
 * Aucun rattachement n'est déduit ici : « non rattaché » = l'IA n'a posé aucune entité connue
 * sur la personne, rien d'autre. Ni nom, ni secteur, ni intitulé n'entrent dans le calcul.
 *
 * `contacts` absent ⇒ on ne sait pas combien de contacts le dossier porte : seules les personnes
 * du graphe comptent, jamais un « 0 » affirmé pour ce qu'on n'a pas mesuré.
 */
export function unplacedOrgSummary(
  graph: OrgGraph,
  contacts: readonly { id: string; full_name: string; title?: string | null; entity?: string | null }[] | undefined,
): { known: number; unplaced: number; unplacedInGraph: number } {
  const entityIds = new Set(graph.entities.map(entity => entity.id))
  const unplacedInGraph = graph.people.filter(person => !person.entityId || !entityIds.has(person.entityId)).length
  const unenriched = contacts ? unenrichedOrgContacts(graph, contacts).length : 0
  return {
    known: graph.people.length + unenriched,
    unplaced: unplacedInGraph + unenriched,
    unplacedInGraph,
  }
}
