import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import type {
  BuyerRoleFamilyKey,
  ChatCoverageMapResponse,
  ChatCoverageRoleFamily,
  CoverageCell,
  CoverageEntityCell,
  CoverageFamilyStatus,
  CoverageGap,
  CoverageGapsResponse,
  CoverageLevel,
  CoverageLevelStatus,
} from '@bellum/contracts'
import {
  BUYER_ROLE_FAMILIES,
  isEntityResolutionAnchored,
  committeeSeatsHeldByContact,
  isTechnicalDeciderTitle,
  technicalSeatGap,
  normalizeBuyerRoleFamilyToken,
  readEntityResolution,
  resolveBuyerRoleFamily,
  resolveBuyerRoleFamilyFromTitle,
  resolveContactLevel,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { PERSON_ENTITY_TYPE, isPersonShapedEntityName } from './person-shaped-entity'
// #2308 — la carte de couverture du CHAT (périmètre × famille de rôle × étape
// commerciale), un calcul À PART qui réutilise `resolveFamily`/`resolveLevel`
// ci-dessous plutôt que d'en recopier une version.
import { computeChatCoverageMap } from './chat-coverage-map'

/* ================================================================== */
/*  Zones blanches / coverage gaps — target model (Drive backlog #5)  */
/*                                                                    */
/*  Théo's plan-de-compte method (METHODE-PLAN-DE-COMPTE-ESN + the    */
/*  V2 knowledge pack): a fully-covered account engages ~12 contacts  */
/*  across 3 hierarchy LEVELS (C-Level sponsor · N-1 decision-maker   */
/*  with budget · N-2 manager/user with the pain) and 2-3 business-   */
/*  unit FAMILIES, with ZERO single-champion dependency. Everything   */
/*  below is a small, EXPLICIT constant model — no data is invented;  */
/*  we only classify the account's existing `contacts` rows.          */
/* ================================================================== */

/** Théo's engaged-contact target ("une douzaine"). */
const TARGET_CONTACTS = 12
/** Minimum distinct TARGET families to aim for (Théo "2-3" → aim for 3). */
const FAMILIES_TARGET = 3
/** The 3 relative levels are the level target (C-Level / N-1 / N-2). */
const LEVELS_TARGET = 3
/** Never emit more than this many zones blanches — keep the list actionable. */
const MAX_GAPS = 6

const LEVELS: readonly CoverageLevel[] = ['c_level', 'n1', 'n2'] as const

const LEVEL_LABELS: Record<CoverageLevel, string> = {
  c_level: 'C-Level (sponsor)',
  n1: 'N-1 (décideur)',
  n2: 'N-2 (relais)',
}
const LEVEL_SHORT: Record<CoverageLevel, string> = { c_level: 'C-Level', n1: 'N-1', n2: 'N-2' }

/** Une famille de rôles acheteurs, telle que la matrice l'affiche.
 *
 *  ⚠️ Les onze familles, leurs libellés, leurs alias et leurs titres par niveau
 *  ne vivent PLUS ici : ils viennent du registre partagé
 *  `packages/contracts/src/schemas/buyer-role-families.ts`. Ils étaient déclarés
 *  cinq fois dans trois langages, et le silo coûtait ceci — mesuré le
 *  29/08/2026 : **9 des 10 libellés de famille que le prompt de classification demande au
 *  modèle d'écrire (« Data / BI / Analytics », « IA / ML », « RH / Talent »…) ne
 *  tombaient sur AUCUN alias**, parce que la comparaison est une égalité EXACTE
 *  et que les alias, eux, ne portaient que des mots isolés. L'API persiste
 *  pourtant la réponse du modèle telle quelle. Résultat : le champ `family` que
 *  la phase 3 avait rempli était jeté, la famille retombait sur les mots-clés du
 *  titre, et un contact dont le titre ne portait pas le mot comptait pour une
 *  INCOHÉRENCE dans la confiance donnée (`computeConfidence`, axe `consistency`).
 *
 *  `is_target` = compte vers l'objectif de largeur (les BU stratégiques du centre
 *  de décision) ; les fonctions support (PMO / Direction générale / RH) sont
 *  affichées mais ne comptent pas vers les « 2-3 familles ». */
type FamilyDef = {
  key: BuyerRoleFamilyKey
  label: string
  is_target: boolean
  titles: Readonly<Record<CoverageLevel, string>>
}

// L'ordre est celui du registre : familles CIBLES d'abord (BU spécifiques),
// fonctions support ensuite — un titre qui matche plusieurs indices résout sur
// la première.
const FAMILY_DEFS: readonly FamilyDef[] = BUYER_ROLE_FAMILIES.map(family => ({
  key: family.key,
  label: family.labelFr,
  is_target: family.isTarget,
  titles: family.titles,
}))

/** Normalise a token for exact family-value matching: deaccent, lower-case,
 *  strip everything but a-z0-9.
 *
 *  R\u00e9-export\u00e9 depuis le registre partag\u00e9 plut\u00f4t que recopi\u00e9 : deux
 *  normalisations qui divergent sur une apostrophe rapprochent deux choses
 *  diff\u00e9rentes, ou rien du tout. */
const norm = normalizeBuyerRoleFamilyToken

/** Resolve a contact's family key, or null. Trusts the classifier's `family`
 *  token first (the shared registry resolves it), then falls back to
 *  distinctive title keywords.
 *
 *  `null` veut dire « on n'a pas su situer ce contact » — jamais une famille
 *  devinée : une case cochée par ressemblance ferait lire « couvert » sur une
 *  zone blanche.
 *
 *  #2165.37 (17/09/2026) — le repli par mots-clés de titre vit désormais dans
 *  `@bellum/contracts` (`resolveBuyerRoleFamilyFromTitle`), partagé avec le
 *  filtre Expertise de Découvrir plutôt que recopié une seconde fois (GA-26). */
// #2308 — exportée (sans changement de comportement) pour que
// `chat-coverage-map.ts` réutilise EXACTEMENT cette résolution plutôt que
// d'en recopier une seconde (GA-26).
export function resolveFamily(contact: Pick<ContactEntity, 'family' | 'title'>): BuyerRoleFamilyKey | null {
  return resolveBuyerRoleFamily(contact.family) ?? resolveBuyerRoleFamilyFromTitle(contact.title)
}

/**
 * Resolve a contact's relative level (C / N-1 / N-2), or null.
 *
 * #2165.35 (17/09/2026) — la dérivation elle-même (texte libre → niveau,
 * raccourci de famille, repli sur le rôle décisionnel) vit désormais dans
 * `@bellum/contracts` (`resolveContactLevel`), partagée avec le filtre Niveau
 * de Découvrir plutôt que recopiée une seconde fois (GA-26).
 */
// #2308 — exportée (sans changement de comportement), même raison que
// `resolveFamily` ci-dessus.
export function resolveLevel(
  contact: Pick<ContactEntity, 'seniority' | 'title' | 'scope' | 'family' | 'decision_role'>,
): CoverageLevel | null {
  return resolveContactLevel({
    title: contact.title,
    seniority: contact.seniority,
    scope: contact.scope,
    family: contact.family,
    decisionRole: contact.decision_role,
  })
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Le comité d'achat de référence (knowledge pack, 8 rôles) — le dénominateur du
 *  « Rôles couverts 4/8 » de la maquette p33. */
const COMMITTEE_ROLES = [
  'economic',
  'technical',
  'user',
  'champion',
  'influencer',
  'blocker',
  'procurement',
  'sponsor',
] as const

/**
 * #2121.51 — les rôles du comité sans lesquels « rien ne nous manque » est faux :
 * sponsor, décideur économique, référent technique, achats. Tant que l'un d'eux
 * n'est tenu par personne, la couverture PLAFONNE sous 100 % — familles et
 * niveaux tous tenus ne suffisent pas à dire qu'on peut avancer.
 */
// #4324.2 — la famille qui porte le décideur technique (DSI / RSSI).
const TECHNICAL_FAMILY_KEY = 'it'

const CRITICAL_COMMITTEE_ROLES: readonly (typeof COMMITTEE_ROLES)[number][] = [
  'sponsor',
  'economic',
  'technical',
  'procurement',
]

/**
 * Le plafond ABSOLU tant qu'un rôle critique manque — l'énoncé explicite de
 * #2121.51, plus ce qui tient la règle.
 *
 * R15-13 (recette du 15/09/2026, prod `5ca597d5a`, QONTO) : il était
 * COSMÉTIQUE — « choisi pour que l'écran, qui arrondit, lise 99, jamais 100 ».
 * L'écran affichait donc « Couverture décisionnelle 99 % » au-dessus de cinq
 * axes qui disaient « Manque ». Un 99 % se lit « rien ne nous manque » bien
 * plus sûrement qu'un 100 % : le plafond rendait le mensonge crédible au lieu
 * de l'empêcher. Depuis que les rôles critiques COMPTENT dans le mélange
 * (ci-dessous), ce plafond n'est plus jamais atteint par un compte à qui il en
 * manque un ; il reste écrit parce qu'une règle nommée vaut mieux qu'une règle
 * qui découle d'une pondération.
 */
const SCORE_CAP_WITHOUT_CRITICAL_ROLE = 0.99

/** Au-delà de ~18 mois, une donnée contact n'est plus « actuelle » (p29 Fraîcheur).
 *  Exportée pour #2308 (`chat-coverage-map.ts`) — même horizon, un seul endroit (GA-26). */
export const FRESHNESS_HORIZON_MS = 18 * 30 * 24 * 60 * 60 * 1000

/** Providers dont la donnée est sourcée/recoupable (p29 Sources). L'IA seule ne
 *  compte pas : c'est une hypothèse, pas une source. */
const SOURCED_PROVIDERS = new Set(['apollo', 'pappers', 'salesql', 'dropcontact', 'manual', 'linkedin_apify'])

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
}

/**
 * Confiance DONNÉE /100 (grille p29) — ce qu'on peut croire, pas ce qu'on a.
 *
 * NOMMAGE — deux grilles de « confiance » coexistent, volontairement, parce
 * qu'elles notent des OBJETS différents. Elles portent donc des noms différents
 * et ne doivent jamais être fusionnées ni comparées :
 *
 *  - CELLE-CI — « Confiance donnée » / "Data confidence" (grille p29 de l'annexe
 *    TF1). Objet : les CONTACTS du compte. Axes : identité / fraîcheur /
 *    couverture / sources / cohérence. Affichée sur l'onglet « Zones blanches »
 *    (`coverage.confidenceStat` + le détail `confidenceComponents`).
 *
 *  - L'AUTRE — « Fiabilité du dossier » / "Dossier reliability". Objet :
 *    l'ANALYSE elle-même. Axes : technique / identité / sources / commerciale.
 *    Produite côté IA par `apps/ia/app/services/confidence.py`, stockée dans
 *    `raw_analysis.confidence`, affichée sur les onglets Aperçu et Évaluation
 *    (`score.dossierReliability`).
 *
 * Les deux sont /100 sur le même compte : un dossier peut être fiable (collecte
 * complète, entité résolue, faits sourcés) alors que sa base de contacts ne l'est
 * pas (périmée, injoignable, déduite par l'IA). C'est un état réel, pas une
 * contradiction — d'où deux noms plutôt qu'une moyenne.
 *
 * Cinq composants, chacun /100, moyennés à poids égal :
 *  - identité   : contacts joignables (email ou LinkedIn) — un nom seul ne prouve rien ;
 *  - fraîcheur  : donnée revue depuis moins de ~18 mois ;
 *  - couverture : le taux de couverture décisionnelle déjà calculé ;
 *  - sources    : contacts issus d'un provider sourcé (l'IA seule = hypothèse) ;
 *  - cohérence  : contacts sans contradiction interne (placés à la fois sur une
 *                 famille ET un niveau — un contact qu'on n'arrive pas à situer est
 *                 précisément une incohérence).
 *
 * Aucun contact ⇒ 0, jamais une note flatteuse sur un dossier vide.
 *
 * `verified` (#2307.7) — dimension « personnes vérifiées », DIAGNOSTIC
 * seulement : DISTINCTE de l'axe `identité` ci-dessus, qui mesure la
 * JOIGNABILITÉ (un email ou un LinkedIn posé), pas la VÉRIFICATION. Un
 * contact joignable peut porter une adresse jamais vérifiée — `verified`
 * compte les contacts dont `email_verified` est VRAI (rebond Resend absent
 * / vérification explicite), et ne participe PAS à `score` : le même
 * mécanisme que `corroboration` dans la grille sœur
 * `apps/ia/app/services/confidence.py` (surfacé pour l'explicabilité, hors
 * moyenne calibrée) — ajouter un sixième axe à la moyenne p29 déplacerait le
 * chiffre affiché sur tous les comptes existants sans arbitrage produit.
 *
 * `scope` (#2307.2) — dimension « scope résolu », même statut DIAGNOSTIC que
 * `verified` : 100 quand `raw_analysis.entity_resolution.state` est ANCRÉ
 * (`isEntityResolutionAnchored`, même liste que le contrat, GA-26), 0 quand
 * résolu mais NON ancré (ambigu, non résolu…), `undefined` quand
 * `entity_resolution` n'existe pas encore — jamais un 0 par défaut sur un
 * dossier qui n'a simplement pas encore ce champ (#2284 est postérieur à des
 * dossiers déjà en base).
 */
function computeConfidence(
  contacts: ContactEntity[],
  coverageScore: number,
  rawAnalysis?: Record<string, unknown> | null,
): {
  score: number
  identity: number
  freshness: number
  coverage: number
  sources: number
  consistency: number
  verified: number
  scope?: number
} {
  const resolution = readEntityResolution(rawAnalysis)
  const scope = resolution ? (isEntityResolutionAnchored(resolution.state) ? 100 : 0) : undefined
  const total = contacts.length
  if (total === 0) {
    return { score: 0, identity: 0, freshness: 0, coverage: 0, sources: 0, consistency: 0, verified: 0, scope }
  }
  const now = Date.now()
  let reachable = 0
  let fresh = 0
  let sourced = 0
  let placeable = 0
  let verifiedCount = 0
  for (const contact of contacts) {
    if (contact.email || contact.linkedin_url) reachable++
    const updated = contact.updated_at ? new Date(contact.updated_at).getTime() : NaN
    if (!Number.isNaN(updated) && now - updated <= FRESHNESS_HORIZON_MS) fresh++
    if (SOURCED_PROVIDERS.has((contact.source ?? '').toLowerCase())) sourced++
    if (resolveFamily(contact) && resolveLevel(contact)) placeable++
    if (contact.email_verified === true) verifiedCount++
  }
  const identity = pct(reachable, total)
  const freshness = pct(fresh, total)
  const coverage = Math.round(coverageScore * 100)
  const sources = pct(sourced, total)
  const consistency = pct(placeable, total)
  const verified = pct(verifiedCount, total)
  const score = Math.round((identity + freshness + coverage + sources + consistency) / 5)
  return { score, identity, freshness, coverage, sources, consistency, verified, scope }
}

/**
 * Pure coverage computation over an account's contacts. Kept side-effect-free so
 * the service is a thin repo wrapper and the whole model is unit-testable.
 */
function computeCoverage(
  accountId: string,
  contacts: ContactEntity[],
  /** NOMS des entités connues du compte (cartographie) — le dénominateur du
   *  « 2/7 » p33 et la liste des entités à ouvrir. Vide quand la cartographie est
   *  absente : la tuile se rabat sur ce qu'on sait, sans rien inventer.
   *  `excluded` porte ce qui a été lu et écarté parce que ce n'est pas une
   *  entité — écarté, pas supprimé, et NOMMÉ à l'écran. */
  mapped: { names: readonly string[]; excluded: readonly string[] } = { names: [], excluded: [] },
  /** #2307.2 — porte `entity_resolution` jusqu'à `computeConfidence`. */
  rawAnalysis?: Record<string, unknown> | null,
): CoverageGapsResponse {
  const mappedEntityNames = mapped.names
  const familyCounts = new Map<string, number>()
  const levelCounts = new Map<CoverageLevel, number>()
  // Per-family set of levels present — drives the "missing level within a
  // covered family" zones blanches.
  const familyLevels = new Map<string, Set<CoverageLevel>>()
  // Intersection famille × niveau — la seule donnée qui PROUVE qu'une cellule de
  // la matrice est couverte (rapport TF1 p32-33). Clé `famille:niveau`.
  const cellCounts = new Map<string, number>()
  // Rôles du comité effectivement tenus, et entités du compte où l'on a quelqu'un
  // (les deux compteurs de la maquette p33). L'entité garde son LIBELLÉ d'origine
  // — la maquette p19 nomme les entités couvertes, elle ne les compte pas
  // seulement ; la clé normalisée ne sert qu'au regroupement.
  const rolesSeen = new Set<string>()
  const entitiesSeen = new Map<string, { name: string; count: number }>()
  // Matrice ENTITÉ × famille × niveau. Clé `entitéNormalisée:famille:niveau`.
  const entityCellCounts = new Map<string, number>()
  let classified = 0
  let championCount = 0
  // #4324.2 — intitulés qui LISENT un décideur technique sans que le contact soit rangé dans la famille IT :
  // l'alignement est incertain, donc la zone blanche IT le dit au lieu d'affirmer « aucun contact ».
  const technicalTitleHints: string[] = []

  for (const contact of contacts) {
    const family = resolveFamily(contact)
    const level = resolveLevel(contact)
    if (family) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1)
    if (level) levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1)
    if (family && level) {
      if (!familyLevels.has(family)) familyLevels.set(family, new Set())
      familyLevels.get(family)!.add(level)
      const cellKey = `${family}:${level}`
      cellCounts.set(cellKey, (cellCounts.get(cellKey) ?? 0) + 1)
    }
    if (family || level) classified++
    const role = (contact.decision_role ?? '').toLowerCase()
    // R15-13 — « Champions identifiés 3 » cohabitait avec « Sponsor : Manque » :
    // ce compteur additionnait les deux rôles pendant que l'axe « Sponsor » lisait
    // `roles_missing`. Deux lectures du même mot, qui ne pouvaient que se
    // contredire (GA-26). Le sponsor se lit sur SON axe, et nulle part ailleurs.
    if (role === 'champion') championCount++
    if ((COMMITTEE_ROLES as readonly string[]).includes(role)) rolesSeen.add(role)
    // K.4 / #4324 — sans rôle posé, un intitulé équivalent (CISO, CIO, Head of IT, Responsable sécurité SI…)
    // tient le siège technique : « aucun DSI / RSSI » ne s'écrit qu'après ce rapprochement. Un rôle déjà posé
    // n'est jamais écrasé par le titre.
    // #4324.1 — la même lecture pour les TROIS sièges qui se lisent par l'intitulé (décideur économique, référent
    // technique, achats) : un titulaire d'intitulé voisin tient la place, MÊME rangé « à qualifier » (`unknown`) —
    // « à qualifier » veut dire qu'on n'a pas fini de le vérifier, pas qu'il n'existe pas. Le sponsor, lui, ne se
    // déduit pas d'un titre (posture, pas intitulé) : il ne se tient que sur un rôle posé.
    for (const seat of committeeSeatsHeldByContact(contact)) rolesSeen.add(seat)
    const rawTitle = (contact.title ?? '').trim()
    if (rawTitle && family !== TECHNICAL_FAMILY_KEY && isTechnicalDeciderTitle(rawTitle)) {
      if (!technicalTitleHints.includes(rawTitle)) technicalTitleHints.push(rawTitle)
    }
    const entityLabel = (contact.entity ?? '').trim()
    const entityKey = norm(entityLabel)
    if (entityKey) {
      const known = entitiesSeen.get(entityKey)
      entitiesSeen.set(entityKey, { name: known?.name ?? entityLabel, count: (known?.count ?? 0) + 1 })
      if (family && level) {
        const key = `${entityKey}:${family}:${level}`
        entityCellCounts.set(key, (entityCellCounts.get(key) ?? 0) + 1)
      }
    }
  }

  const families: CoverageFamilyStatus[] = FAMILY_DEFS.map(def => {
    const count = familyCounts.get(def.key) ?? 0
    return { family: def.key, label: def.label, covered: count > 0, contact_count: count, is_target: def.is_target }
  })

  const levels: CoverageLevelStatus[] = LEVELS.map(level => {
    const count = levelCounts.get(level) ?? 0
    return { level, label: LEVEL_LABELS[level], covered: count > 0, contact_count: count }
  })

  const familiesCovered = families.filter(f => f.is_target && f.covered).length
  const levelsCovered = levels.filter(l => l.covered).length

  /**
   * R15-13 — TROIS AXES, PAS DEUX : le taux nomme ce qu'il mesure.
   *
   * « Couverture décisionnelle » ne mesurait que la LARGEUR (familles) et la
   * PROFONDEUR (niveaux). Sur QONTO, trois familles sur trois et trois niveaux
   * sur trois donnaient 100 % — ramené à 99 % par le plafond — pendant que le
   * comité d'achat était vide : ni sponsor, ni décideur économique, ni référent
   * technique, ni achats. Le NOM du chiffre était plus large que ce qu'il
   * comptait, ce qui est exactement `c65_couverture_nest_pas_un_fait_de_marche`
   * d'un cran plus bas : un taux nomme ce qu'il mesure, ou il ment.
   *
   * Les rôles critiques deviennent donc le troisième axe, à poids égal. Un
   * comité vide plafonne mécaniquement à deux tiers, et chaque rôle tenu se
   * paie — on monte par paliers, on ne saute pas au plafond.
   *
   * ⚠️ Les QUATRE rôles critiques, pas les huit du comité : les quatre autres
   * (utilisateur, influenceur, bloqueur, champion) sont des rôles qu'on
   * découvre, pas des rôles sans lesquels « rien ne nous manque » est faux.
   * Les compter au dénominateur ferait mesurer au taux la complétude de NOTRE
   * carnet, pas la couverture du comité.
   *
   * Chaque axe est plafonné à sa cible pour qu'une largeur excédentaire ne
   * rattrape pas un niveau absent.
   */
  const familyScore = Math.min(familiesCovered, FAMILIES_TARGET) / FAMILIES_TARGET
  const levelScore = levelsCovered / LEVELS_TARGET
  const technicalGap = rolesSeen.has('technical') ? null : technicalSeatGap(contacts)
  const criticalRolesHeld = CRITICAL_COMMITTEE_ROLES.filter(role => rolesSeen.has(role)).length
  const criticalRoleScore = criticalRolesHeld / CRITICAL_COMMITTEE_ROLES.length
  const blended = round2((familyScore + levelScore + criticalRoleScore) / 3)
  // #2121.51 / #4324.2 — un rôle critique NON IDENTIFIÉ (pas trouvé ≠ poste vide) interdit le 100 %, dit explicitement.
  const criticalRoleMissing = criticalRolesHeld < CRITICAL_COMMITTEE_ROLES.length
  const score = criticalRoleMissing ? Math.min(blended, SCORE_CAP_WITHOUT_CRITICAL_ROLE) : blended

  // Théo: ZERO single-champion dependency — flag when decision access rests on a
  // single point of failure (one engaged contact, or a single covered family).
  const singleChampionRisk = classified <= 1 || familiesCovered <= 1

  const gaps = buildGaps(families, familyLevels, levelCounts, technicalTitleHints, technicalGap !== null)

  // Seules les cellules PEUPLÉES sont émises : une cellule absente = 0 contact,
  // et le payload ne porte pas 33 zéros.
  const cells: CoverageCell[] = [...cellCounts.entries()].map(([key, count]) => {
    const [family, level] = key.split(':') as [string, CoverageLevel]
    return { family, level, contact_count: count }
  })
  // Combien des contacts placés le sont dans une famille CIBLE. Sans ce chiffre,
  // « 9 contacts classés » et « 0 famille couverte » se contredisaient à l'écran
  // (p33) : les 9 étaient tous dans des familles support (PMO / C-Level / RH).
  const targetFamilyContacts = families.filter(f => f.is_target).reduce((sum, f) => sum + f.contact_count, 0)

  // Cellules ENTITÉ × famille × niveau, peuplées uniquement — l'axe qui manquait
  // pour dire QUELLE entité viser (p32 §2 / maquette p19).
  const entityCells: CoverageEntityCell[] = [...entityCellCounts.entries()].map(([key, count]) => {
    const [entityKey, family, level] = key.split(':') as [string, string, CoverageLevel]
    return { entity: entitiesSeen.get(entityKey)?.name ?? entityKey, family, level, contact_count: count }
  })

  // Entités NOMMÉES : couvertes (du mieux couvert au moins couvert, puis alpha)
  // et, côté cartographie, celles qu'aucun contact ne nomme. Le rapprochement est
  // une égalité stricte du nom normalisé : au moindre doute une entité est dite
  // NON couverte — jamais couverte à tort.
  const entitiesCoveredNames = [...entitiesSeen.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map(e => e.name)
  const entitiesUncoveredNames = mappedEntityNames.filter(name => !entitiesSeen.has(norm(name)))

  return {
    account_id: accountId,
    cells,
    entity_cells: entityCells,
    target_family_contacts: targetFamilyContacts,
    roles_covered: rolesSeen.size,
    roles_target: COMMITTEE_ROLES.length,
    roles_missing: COMMITTEE_ROLES.filter(role => !rolesSeen.has(role)),
    // #4324.1 — le siège technique vide dit POURQUOI (collecte ou niveau), jamais un « aucun DSI » muet.
    ...(technicalGap ? { technical_gap: { reason: technicalGap.reason, it_contacts: technicalGap.itContacts } } : {}),
    entities_covered: entitiesSeen.size,
    // Le total est l'UNION : ce qu'on couvre, PLUS ce qu'on sait exister sans
    // le couvrir. C'était `Math.max(cartographiées, vues)`, et le ratio devenait
    // mécaniquement parfait dès que les contacts nommaient plus d'entités que la
    // cartographie n'en connaît — ce qui est le cas ordinaire sur un grand
    // compte (filiales, directions, co-entreprises). La fiche d'un groupe
    // affichait ainsi « 40/40 » en listant juste en dessous cinq entités qu'aucun
    // contact ne touche : deux chiffres vrais séparément, contradictoires
    // ensemble, et un lecteur qui ne croit plus ni l'un ni l'autre.
    entities_total: entitiesSeen.size + entitiesUncoveredNames.length,
    entities_covered_names: entitiesCoveredNames,
    entities_uncovered_names: entitiesUncoveredNames,
    // Ce que la cartographie portait et qui n'est PAS une entité. Écarté du
    // ratio, jamais du dossier : « on archive, on ne supprime pas ».
    entities_excluded_names: [...mapped.excluded],
    confidence: computeConfidence(contacts, score, rawAnalysis),
    score,
    contacts_total: contacts.length,
    classified_contacts: classified,
    target_contacts: TARGET_CONTACTS,
    families,
    families_covered: familiesCovered,
    families_target: FAMILIES_TARGET,
    levels,
    levels_covered: levelsCovered,
    levels_target: LEVELS_TARGET,
    champion_count: championCount,
    single_champion_risk: singleChampionRisk,
    gaps,
  }
}

/** Noms des entités de la cartographie du compte (`entitiesExhaustive`), tolérant
 *  les deux formes rencontrées dans `raw_analysis` : chaîne nue ou objet `{name}`.
 *  Snake_case lu en premier (blob persisté), camelCase en repli. Dédupliqué sur le
 *  nom normalisé, ordre de la cartographie conservé. Rien d'exploitable ⇒ `[]` :
 *  aucune entité n'est inventée.
 *
 *  ⚠️ Rend DEUX listes : les entités, et ce qui a été écarté parce que ce n'en
 *  est pas une. Écarter en silence ferait passer « 26/27 » à « 26/26 » sans que
 *  personne ne puisse dire pourquoi — et un produit qui perd une entité sans le
 *  dire est pire qu'un produit qui en montre une de trop. */
function mappedEntityNames(rawAnalysis: unknown): { names: string[]; excluded: string[] } {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') return { names: [], excluded: [] }
  const blob = rawAnalysis as Record<string, unknown>
  const raw = blob.entities_exhaustive ?? blob.entitiesExhaustive
  if (!Array.isArray(raw)) return { names: [], excluded: [] }
  const seen = new Set<string>()
  const names: string[] = []
  const excluded: string[] = []
  for (const item of raw) {
    const node = (typeof item === 'object' && item !== null ? item : {}) as {
      name?: unknown
      entityType?: unknown
    }
    const name = typeof item === 'string' ? item : typeof node.name === 'string' ? node.name : ''
    const trimmed = name.trim()
    const key = norm(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    // Une PERSONNE n'est pas une entité (recette live du 29/08/2026, ROCHE :
    // « À ouvrir : Wafaa Mamilli — Chief Digital Technology Officer »). Deux
    // lectures, dans cet ordre :
    //   1. le TYPE calculé en amont (§24) — il porte aussi une correction
    //      humaine, et il tranche des cas que le nom seul ne trahit pas ;
    //   2. la FORME du nom — la seule lecture qu'un dossier DÉJÀ ÉCRIT puisse
    //      recevoir, puisque le correctif amont ne vaut que pour les analyses
    //      futures.
    if (node.entityType === PERSON_ENTITY_TYPE || isPersonShapedEntityName(trimmed)) {
      excluded.push(trimmed)
      continue
    }
    names.push(trimmed)
  }
  return { names, excluded }
}

/** Build the ranked, deduped list of concrete zones blanches (family×level). */
function buildGaps(
  families: CoverageFamilyStatus[],
  familyLevels: Map<string, Set<CoverageLevel>>,
  levelCounts: Map<CoverageLevel, number>,
  /** #4324.2 — intitulés voisins d'un décideur technique rangés hors de la famille IT. */
  technicalTitleHints: readonly string[] = [],
  /** #4324.1 — le siège DSI / RSSI est vide : la zone blanche IT reste ouverte, même si l'IT a un N-1. */
  technicalSeatEmpty = false,
): CoverageGap[] {
  // ⚠️ Typée sur `string` À DESSEIN. Depuis que les familles viennent du
  //    registre, `def.key` est une union étroite — et `push` reçoit une clé
  //    qui vient de la DONNÉE (une famille lue sur un contact), donc une
  //    chaîne quelconque. Resserrer la clé de la Map ferait porter à l'appelant
  //    une garantie qu'il n'a pas ; c'est le `if (!def) return` juste dessous
  //    qui décide, et lui seul peut le faire.
  const defByKey = new Map<string, (typeof FAMILY_DEFS)[number]>(FAMILY_DEFS.map(def => [def.key, def]))
  const seen = new Set<string>()
  const gaps: CoverageGap[] = []

  const push = (familyKey: string, level: CoverageLevel, reason: string, priority: number): void => {
    const key = `${familyKey}:${level}`
    if (seen.has(key)) return
    const def = defByKey.get(familyKey)
    if (!def) return
    seen.add(key)
    gaps.push({
      family: def.key,
      family_label: def.label,
      level,
      level_label: LEVEL_LABELS[level],
      label: `${def.label} — ${def.titles[level]} (${LEVEL_SHORT[level]})`,
      suggested_titles: def.titles[level],
      reason,
      priority,
    })
  }

  const targetFamilies = families.filter(f => f.is_target)

  // DEPTH first, then BREADTH: converting an existing foothold into a real
  // decision path (a sponsor + a budget-holder) outranks opening yet another
  // family — otherwise a footholded account drowns in "missing family" noise.

  // (P1) No executive sponsor ANYWHERE — anchor the C-Level gap on the strongest
  //      covered target family (the exec above your existing traction), else IT.
  if ((levelCounts.get('c_level') ?? 0) === 0) {
    const anchor =
      [...targetFamilies].filter(f => f.contact_count > 0).sort((a, b) => b.contact_count - a.contact_count)[0]
        ?.family ??
      targetFamilies[0]?.family ??
      'it'
    push(anchor, 'c_level', 'Aucun sponsor exécutif — sécuriser un relais C-Level au-dessus des contacts actuels.', 1)
  }

  // (P1) Covered family stuck at the operational level (only N-2) — remonter au
  //      décideur budgétaire (N-1) pour transformer le pied dans la porte.
  for (const family of targetFamilies) {
    if (family.contact_count === 0) continue
    const present = familyLevels.get(family.family) ?? new Set<CoverageLevel>()
    if (!present.has('n1') && !present.has('c_level')) {
      push(family.family, 'n1', 'Contacts uniquement opérationnels — remonter au décideur budgétaire (N-1).', 1)
    }
  }

  // (P1) #4324.1 — DHL, recette 22/10 : un contact IT de niveau N-1 (non direction) fermait le gap
  //      « opérationnels » et « IT / DSI » disparaissait des angles morts, sans DSI nommé. Tant que le siège
  //      technique est vide, la famille IT dit qu'il manque la direction — jamais ni un DSI ni une raison.
  const itFamily = targetFamilies.find(f => f.family === TECHNICAL_FAMILY_KEY)
  if (technicalSeatEmpty && itFamily && itFamily.contact_count > 0) {
    push(
      TECHNICAL_FAMILY_KEY,
      'c_level',
      'Aucun DSI / RSSI identifié — des contacts IT existent mais aucun au niveau direction : identifier le DSI.',
      1,
    )
  }

  // (P2) Whole target families with no contact at all — the account has no door
  //      into this business unit. Enter at N-1 (the budget-holding decision-maker).
  for (const family of targetFamilies) {
    if (family.contact_count === 0) {
      // #4324.2 — un intitulé voisin existe : on dit l'incertitude, on n'affirme pas l'absence.
      const hint = family.family === TECHNICAL_FAMILY_KEY ? technicalTitleHints[0] : undefined
      push(
        family.family,
        'n1',
        hint
          ? `Pas de contact classé dans cette famille — l'intitulé « ${hint} » pourrait y correspondre, à confirmer avant d'engager le décideur.`
          : 'Aucun contact dans cette famille — engager le décideur pour ouvrir le compte.',
        2,
      )
    }
  }

  // (P3) Covered family with a decision-maker but no field relay (missing N-2).
  for (const family of targetFamilies) {
    if (family.contact_count === 0) continue
    const present = familyLevels.get(family.family) ?? new Set<CoverageLevel>()
    if (!present.has('n2') && (present.has('n1') || present.has('c_level'))) {
      push(
        family.family,
        'n2',
        'Pas de relais terrain (N-2) — identifier un utilisateur/manager qui porte le besoin.',
        3,
      )
    }
  }

  return gaps.sort((a, b) => a.priority - b.priority).slice(0, MAX_GAPS)
}

@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name)

  constructor(
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  /**
   * Compute the account's decision-coverage map from its existing contacts.
   * Contacts are read WORKSPACE-scoped (multi-user Phase 2) so a caller only
   * ever aggregates rows their team owns; the controller has already verified
   * the account itself belongs to the workspace (404 otherwise).
   */
  async computeForAccount(
    accountId: string,
    workspaceId: string,
    /** Le `raw_analysis` que l'appelant vient DÉJÀ de lire (garde de propriété) :
     *  fourni, il évite de relire le compte — l'analyse est le plus gros champ
     *  de la table. Absent, le comportement est celui d'avant (P5, 29/09). */
    known?: { rawAnalysis: Record<string, unknown> | null | undefined },
  ): Promise<CoverageGapsResponse> {
    try {
      const [contacts, account] = await Promise.all([
        this.contacts.find({
          // #4324.1 — un contact archivé (homonyme écarté) ou supprimé ne compte ni au total ni dans les rôles tenus.
          where: {
            account_id: accountId,
            ...workspaceScopeWhere(workspaceId),
            deleted_at: IsNull(),
            excluded_at: IsNull(),
          },
        }),
        known
          ? Promise.resolve({ raw_analysis: known.rawAnalysis ?? null })
          : this.accounts.findOne({
              where: { id: accountId, ...workspaceScopeWhere(workspaceId) },
              select: { id: true, raw_analysis: true },
            }),
      ])
      // Cartographie du compte = le dénominateur des « entités couvertes » ET la
      // liste des entités à ouvrir. Absente (analyse ancienne / partielle) ⇒ vide,
      // et la tuile ne prétend rien.
      return computeCoverage(accountId, contacts, mappedEntityNames(account?.raw_analysis), account?.raw_analysis)
    } catch (err) {
      this.logger.error('computeForAccount error', { error: err, tags: { accountId } })
      // Fail soft to an all-missing map rather than 500 — a coverage read must
      // never take down the dossier view.
      return computeCoverage(accountId, [])
    }
  }

  /**
   * #2308 — la carte de couverture du CHAT (périmètre × famille de rôle ×
   * étape commerciale), pour UN compte. Mêmes contacts, même portée
   * workspace que `computeForAccount` ; `commercial_status` en plus, seul
   * champ compte qu'exploite cet axe (`relation`).
   *
   * `marketMemoryObservedRoleFamilies` (#2308.32, corrigé 23/09/2026) : à
   * fournir par l'APPELANT, jamais résolu ici. `MarketMemoryService` reste
   * injectée dans le CONTRÔLEUR (GA-07 — le cliquet des frontières de
   * modules est au plafond ; une première écriture de ce lot l'avait injectée
   * ici et la garde l'a refusée, même raison que `market_role_families_observed`
   * dans `coverage.controller.ts`). Vide par défaut : un appelant qui ne la
   * fournit pas garde le comportement d'avant ce correctif à l'octet près.
   */
  async computeChatCoverageMapForAccount(
    accountId: string,
    workspaceId: string,
    marketMemoryObservedRoleFamilies: ReadonlySet<ChatCoverageRoleFamily> = new Set(),
  ): Promise<ChatCoverageMapResponse> {
    try {
      const [contacts, account] = await Promise.all([
        this.contacts.find({
          where: {
            account_id: accountId,
            ...workspaceScopeWhere(workspaceId),
            deleted_at: IsNull(),
            excluded_at: IsNull(),
          },
        }),
        this.accounts.findOne({
          where: { id: accountId, ...workspaceScopeWhere(workspaceId) },
          select: { id: true, commercial_status: true },
        }),
      ])
      return computeChatCoverageMap(accountId, contacts, account, new Date(), marketMemoryObservedRoleFamilies)
    } catch (err) {
      this.logger.error('computeChatCoverageMapForAccount error', { error: err, tags: { accountId } })
      // Même doctrine que `computeForAccount` : dégrader vers une carte vide
      // plutôt que de faire tomber la conversation.
      return computeChatCoverageMap(accountId, [], null)
    }
  }
}
