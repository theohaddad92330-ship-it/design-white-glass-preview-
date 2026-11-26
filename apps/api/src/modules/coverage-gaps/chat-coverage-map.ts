import type {
  ChatCoverageGap,
  ChatCoverageGapActionKind,
  ChatCoverageGapPriorityCategory,
  ChatCoverageMapResponse,
  ChatCoveragePerimeterStatus,
  ChatCoveragePerimeterType,
  ChatCoverageRoleFamily,
  ChatCoverageRoleFamilyStatus,
  ChatCoverageSalesStage,
  ChatCoverageSalesStageStatus,
  ChatCoverageState,
} from '@bellum/contracts'
import {
  ALL_CHAT_COVERAGE_PERIMETER_TYPES,
  ALL_CHAT_COVERAGE_ROLE_FAMILIES,
  ALL_CHAT_COVERAGE_SALES_STAGES,
  CHAT_COVERAGE_PERIMETER_LABELS,
  CHAT_COVERAGE_ROLE_FAMILY_LABELS,
  CHAT_COVERAGE_SALES_STAGE_LABELS,
  capStateForSources,
  deriveContactState,
  resolveBuyerRoleFamily,
  suggestGapAction,
} from '@bellum/contracts'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { resolveFamily, resolveLevel } from './coverage.service'

/* ------------------------------------------------------------------------ */
/*  #2308 (LAU-FINAL-049) — la carte de couverture du CHAT, assemblée sur    */
/*  les MÊMES signaux que `coverage.service.ts` : rien n'est réinventé       */
/*  (GA-26), `resolveFamily`/`resolveLevel`/`FRESHNESS_HORIZON_MS` en sont   */
/*  importés tels quels. Ce fichier porte trois axes NOUVEAUX (périmètre    */
/*  typé, famille de rôle d'achat, étape commerciale) — voir                */
/*  `@bellum/contracts/chat-coverage-map` pour les enums et les règles      */
/*  pures (GA-259) qu'il applique ici.                                     */
/* ------------------------------------------------------------------------ */

export type ChatCoverageContactInput = Pick<
  ContactEntity,
  'decision_role' | 'family' | 'title' | 'entity' | 'updated_at' | 'seniority' | 'scope'
>

type ChatCoverageAccountInput = { commercial_status?: string | null } | null

/** #2308.7-16 — `contacts.decision_role` (rôle MEDDIC déjà persisté, court)
 *  vers la famille de rôle du chat. `blocker`/`to_qualify`/valeur inconnue ne
 *  mappent nulle part : un rôle qui ne dit rien ne doit compter pour rien. */
const DECISION_ROLE_TO_ROLE_FAMILY: Readonly<Record<string, ChatCoverageRoleFamily>> = {
  champion: 'sponsor',
  sponsor: 'sponsor',
  economic: 'decideur_economique',
  technical: 'referent_technique',
  user: 'utilisateur',
  procurement: 'achats',
  influencer: 'relais',
}

/** #2308.7 / #2308.8 — au sein du niveau N-2 (« relais opérationnel », pack
 *  v2), un mot-clé de MANAGEMENT réel dans le titre distingue `manager` de
 *  `operationnel`. Mêmes mots-clés que `N2_RE` (`contact-level.ts`) pour
 *  « manager »/« responsable » : on ne réinterprète pas un signal qui a déjà
 *  décidé le niveau, on l'affine. Jamais deviné sans titre. */
const MANAGEMENT_TITLE_RE = /\b(manager|responsable|chef\s+de|lead|head\s+of|directeur\s+adjoint)\b/i

function classifyRoleFamilies(contact: ChatCoverageContactInput): ChatCoverageRoleFamily[] {
  const out: ChatCoverageRoleFamily[] = []
  const role = (contact.decision_role ?? '').toLowerCase()
  const mapped = DECISION_ROLE_TO_ROLE_FAMILY[role]
  if (mapped) out.push(mapped)
  // #2308.13 — réutilise la famille de DOMAINE `cyber` déjà classée, jamais un
  // second classificateur de rôle.
  if (resolveFamily(contact) === 'cyber') out.push('securite_conformite')
  if (resolveLevel(contact) === 'n2') {
    out.push(MANAGEMENT_TITLE_RE.test(contact.title ?? '') ? 'manager' : 'operationnel')
  }
  // #2308.15 — `partenaire` : AUCUN classificateur ne l'émet ici, à dessein.
  // Les partenaires sont un module externe (`apps/api/src/modules/partners`) ;
  // en inventer un signal ferait cocher une case par ressemblance.
  return out
}

/** #2308.3-6 — classe le libellé D'ENTITÉ (jamais réécrit) au type de
 *  périmètre le plus probable. `null` = aucune entité renseignée (ne
 *  contribue à aucun sous-type nommé, seulement à `groupe` en agrégat).
 *  Un libellé renseigné mais NON reconnu retombe sur `filiale` — c'est déjà
 *  le comportement de `coverageEntityCellSchema` (#2308.2, déjà là) : toute
 *  entité nommée comptait déjà comme une filiale avant ce lot. */
const PERIMETER_PATTERNS: ReadonlyArray<readonly [RegExp, ChatCoveragePerimeterType]> = [
  [/\bfiliale\b|\bsubsidiary\b/i, 'filiale'],
  [/\bbusiness\s+unit\b|\bbu\b/i, 'bu'],
  [/\bdirection\b|\bd[ée]partement\b/i, 'direction'],
  [/\bprogramme\b|\bprogram\b/i, 'programme'],
  [/\bsite\b|\busine\b|\bagence\b/i, 'site'],
]

function classifyPerimeter(entity: string | null | undefined): ChatCoveragePerimeterType | null {
  const label = (entity ?? '').trim()
  if (!label) return null
  for (const [pattern, type] of PERIMETER_PATTERNS) {
    if (pattern.test(label)) return type
  }
  return 'filiale'
}

function updatedAtMs(contact: Pick<ChatCoverageContactInput, 'updated_at'>): number | null {
  const value = contact.updated_at ? new Date(contact.updated_at).getTime() : NaN
  return Number.isNaN(value) ? null : value
}

function buildRoleFamilies(contacts: readonly ChatCoverageContactInput[], now: Date): ChatCoverageRoleFamilyStatus[] {
  const counts = new Map<ChatCoverageRoleFamily, number>()
  const freshest = new Map<ChatCoverageRoleFamily, number>()
  for (const contact of contacts) {
    const ts = updatedAtMs(contact)
    for (const family of classifyRoleFamilies(contact)) {
      counts.set(family, (counts.get(family) ?? 0) + 1)
      if (ts !== null) freshest.set(family, Math.max(freshest.get(family) ?? -Infinity, ts))
    }
  }
  return ALL_CHAT_COVERAGE_ROLE_FAMILIES.map(role_family => {
    const contact_count = counts.get(role_family) ?? 0
    const freshestMs = freshest.get(role_family)
    const state = deriveContactState({
      contactCount: contact_count,
      freshestUpdatedAtMs: freshestMs !== undefined && Number.isFinite(freshestMs) ? freshestMs : null,
      nowMs: now.getTime(),
    })
    return { role_family, label: CHAT_COVERAGE_ROLE_FAMILY_LABELS[role_family], state, contact_count }
  })
}

function buildPerimeters(contacts: readonly ChatCoverageContactInput[], now: Date): ChatCoveragePerimeterStatus[] {
  const counts = new Map<ChatCoveragePerimeterType, number>()
  const freshest = new Map<ChatCoveragePerimeterType, number>()
  const names = new Map<ChatCoveragePerimeterType, Set<string>>()
  let overallFreshest: number | null = null

  for (const contact of contacts) {
    const ts = updatedAtMs(contact)
    if (ts !== null) overallFreshest = overallFreshest === null ? ts : Math.max(overallFreshest, ts)
    const type = classifyPerimeter(contact.entity)
    if (!type) continue
    counts.set(type, (counts.get(type) ?? 0) + 1)
    if (ts !== null) freshest.set(type, Math.max(freshest.get(type) ?? -Infinity, ts))
    const label = (contact.entity ?? '').trim()
    if (label) {
      if (!names.has(type)) names.set(type, new Set())
      names.get(type)!.add(label)
    }
  }

  return ALL_CHAT_COVERAGE_PERIMETER_TYPES.map(perimeter_type => {
    // #2308.1 (déjà là) — le compte LUI-MÊME est le périmètre "groupe" : son
    // état reflète l'ensemble des contacts, pas un sous-ensemble classé.
    if (perimeter_type === 'groupe') {
      const state = deriveContactState({
        contactCount: contacts.length,
        freshestUpdatedAtMs: overallFreshest,
        nowMs: now.getTime(),
      })
      return {
        perimeter_type,
        label: CHAT_COVERAGE_PERIMETER_LABELS.groupe,
        state,
        contact_count: contacts.length,
        entity_names: [],
      }
    }
    const contact_count = counts.get(perimeter_type) ?? 0
    const freshestMs = freshest.get(perimeter_type)
    const state = deriveContactState({
      contactCount: contact_count,
      freshestUpdatedAtMs: freshestMs !== undefined && Number.isFinite(freshestMs) ? freshestMs : null,
      nowMs: now.getTime(),
    })
    return {
      perimeter_type,
      label: CHAT_COVERAGE_PERIMETER_LABELS[perimeter_type],
      state,
      contact_count,
      entity_names: [...(names.get(perimeter_type) ?? [])].sort((a, b) => a.localeCompare(b)),
    }
  })
}

/** #2308.23 — `relation` lit `accounts.commercial_status` (cinq valeurs
 *  stockées, `commercialStatusSchema`) TEL QUEL : aucun second calcul. */
const COMMERCIAL_STATUS_TO_STATE: Readonly<Record<string, ChatCoverageState>> = {
  customer: 'covered_verified',
  opportunity: 'partial',
  watching: 'to_verify',
  inbox: 'unknown',
  archived: 'not_relevant',
}

function buildSalesStages(
  account: ChatCoverageAccountInput,
  roleFamilies: readonly ChatCoverageRoleFamilyStatus[],
): ChatCoverageSalesStageStatus[] {
  const sponsor = roleFamilies.find(f => f.role_family === 'sponsor')
  return ALL_CHAT_COVERAGE_SALES_STAGES.map(sales_stage => {
    const label = CHAT_COVERAGE_SALES_STAGE_LABELS[sales_stage]
    if (sales_stage === 'relation') {
      const key = (account?.commercial_status ?? '').toLowerCase()
      const state = COMMERCIAL_STATUS_TO_STATE[key] ?? 'unknown'
      return { sales_stage, label, state, reason: state === 'unknown' ? null : `Statut commercial : ${key}` }
    }
    if (sales_stage === 'sponsor_identifie') {
      const state = sponsor?.state ?? 'unknown'
      return {
        sales_stage,
        label,
        state,
        reason: state === 'unknown' ? null : 'Dérivé de la couverture du rôle sponsor.',
      }
    }
    // #2308.17/18/20-22/24 — AUCUN signal câblé aujourd'hui (mesuré le
    // 18/09/2026 : ni `terrain compris`, ni `problème qualifié`, ni `budget
    // confirmé`, ni `décision`, ni `achat`, ni `prochaine action` n'ont de
    // colonne ou de mécanisme qui les alimente pour LA carte de couverture).
    // `unknown`, NOMMÉ, jamais un état inventé — le TROU que #2308 demande de
    // rendre visible plutôt que de masquer.
    return { sales_stage, label, state: 'unknown', reason: null }
  })
}

type GapRule = { category: ChatCoverageGapPriorityCategory; action: ChatCoverageGapActionKind; reason: string }

const ROLE_FAMILY_GAP_RULES: Readonly<Record<ChatCoverageRoleFamily, GapRule>> = {
  sponsor: {
    category: 'bloque_action',
    action: 'recherche_ciblee',
    reason: "Aucun sponsor identifié — la décision n'a personne pour la porter en interne.",
  },
  decideur_economique: {
    category: 'bloque_action',
    action: 'recherche_ciblee',
    reason: "Aucun décideur économique identifié — le budget n'a pas d'interlocuteur.",
  },
  referent_technique: {
    category: 'bloque_action',
    action: 'recherche_ciblee',
    reason: "Aucun référent technique identifié — la faisabilité n'est validée par personne.",
  },
  achats: {
    category: 'bloque_action',
    action: 'recherche_ciblee',
    reason: "Aucun contact achats identifié — le circuit d'achat n'a pas de porte.",
  },
  utilisateur: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: "Aucun utilisateur identifié — le besoin terrain n'est confirmé par personne.",
  },
  relais: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: 'Aucun relais identifié — personne ne porte le sujet en interne au quotidien.',
  },
  operationnel: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: 'Aucun contact opérationnel identifié.',
  },
  manager: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: 'Aucun manager identifié à ce niveau.',
  },
  securite_conformite: {
    category: 'ameliore_confiance',
    action: 'recherche_ciblee',
    reason: 'Aucun contact sécurité / conformité identifié.',
  },
  partenaire: {
    category: 'information_secondaire',
    action: 'demande_equipe',
    reason: 'Aucun signal de partenaire côté contacts — hors périmètre de ce dossier (module partenaires distinct).',
  },
}

const PERIMETER_GAP_RULES: Readonly<Record<ChatCoveragePerimeterType, GapRule>> = {
  groupe: { category: 'ameliore_confiance', action: 'enrichissement', reason: 'Aucun contact sur ce compte.' },
  filiale: {
    category: 'ameliore_confiance',
    action: 'enrichissement',
    reason: 'Aucune filiale identifiée dans les contacts.',
  },
  bu: {
    category: 'bloque_etape_suivante',
    action: 'import_crm',
    reason: 'Aucune Business Unit identifiée — vérifier si le CRM en connaît une non encore importée.',
  },
  direction: {
    category: 'bloque_etape_suivante',
    action: 'verification',
    reason: 'Aucune direction identifiée dans les contacts.',
  },
  programme: {
    category: 'bloque_etape_suivante',
    action: 'import_crm',
    reason: 'Aucun programme identifié — vérifier si le CRM en connaît un non encore importé.',
  },
  site: {
    category: 'bloque_etape_suivante',
    action: 'verification',
    reason: 'Aucun site identifié dans les contacts.',
  },
}

const SALES_STAGE_GAP_RULES: Readonly<Record<ChatCoverageSalesStage, GapRule>> = {
  terrain_compris: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: "Le terrain n'est pas confirmé compris — à valider avant d'avancer.",
  },
  probleme_qualifie: {
    category: 'bloque_action',
    action: 'question_contact',
    reason: "Aucun problème qualifié — l'action commerciale n'a pas de prise.",
  },
  sponsor_identifie: {
    category: 'bloque_action',
    action: 'recherche_ciblee',
    reason: 'Sponsor non identifié pour cette étape commerciale.',
  },
  budget_confirme: {
    category: 'bloque_action',
    action: 'question_contact',
    reason: "Budget non confirmé — l'action commerciale n'a pas de prise.",
  },
  decision: {
    category: 'bloque_etape_suivante',
    action: 'question_contact',
    reason: 'Le processus de décision reste à comprendre.',
  },
  achat: {
    category: 'information_secondaire',
    action: 'verification',
    reason: "L'étape achat n'est pas confirmée.",
  },
  relation: {
    category: 'ameliore_confiance',
    action: 'enrichissement',
    reason: 'Aucun statut de relation exploitable sur ce compte.',
  },
  prochaine_action: {
    category: 'bloque_etape_suivante',
    action: 'demande_equipe',
    reason: "Aucune prochaine action connue — demander à l'équipe ce qui est prévu.",
  },
}

/** #2308.25-31 — un axe COUVERT ou NON PERTINENT ne produit jamais de gap
 *  (doctrine « on n'affiche pas ce qu'on n'a pas » : une liste ne porte QUE
 *  ce qui manque). `partial` reste un gap : une couverture incomplète est
 *  encore un trou à combler. */
const GAP_WORTHY_STATES: ReadonlySet<ChatCoverageState> = new Set(['missing', 'to_verify', 'unknown', 'partial'])

const GAP_CATEGORY_RANK: Readonly<Record<ChatCoverageGapPriorityCategory, number>> = {
  bloque_action: 0,
  bloque_etape_suivante: 1,
  ameliore_confiance: 2,
  information_secondaire: 3,
}

/** Aucun écran ne se dépouille au-delà d'une poignée de gaps actionnables —
 *  même doctrine que `MAX_GAPS` (`coverage.service.ts`), élargie parce que
 *  cette carte porte trois axes au lieu d'un. */
const MAX_CHAT_COVERAGE_GAPS = 8

function buildGaps(
  roleFamilies: readonly ChatCoverageRoleFamilyStatus[],
  perimeters: readonly ChatCoveragePerimeterStatus[],
  salesStages: readonly ChatCoverageSalesStageStatus[],
): ChatCoverageGap[] {
  const gaps: ChatCoverageGap[] = []

  for (const status of roleFamilies) {
    if (!GAP_WORTHY_STATES.has(status.state)) continue
    const rule = ROLE_FAMILY_GAP_RULES[status.role_family]
    gaps.push({
      id: `role_family:${status.role_family}`,
      axis: 'role_family',
      key: status.role_family,
      label: status.label,
      reason: rule.reason,
      state: status.state,
      priority_category: rule.category,
      suggested_action: suggestGapAction(rule.category, rule.action),
    })
  }

  for (const status of perimeters) {
    if (!GAP_WORTHY_STATES.has(status.state)) continue
    const rule = PERIMETER_GAP_RULES[status.perimeter_type]
    gaps.push({
      id: `perimeter:${status.perimeter_type}`,
      axis: 'perimeter',
      key: status.perimeter_type,
      label: status.label,
      reason: rule.reason,
      state: status.state,
      priority_category: rule.category,
      suggested_action: suggestGapAction(rule.category, rule.action),
    })
  }

  for (const status of salesStages) {
    if (!GAP_WORTHY_STATES.has(status.state)) continue
    const rule = SALES_STAGE_GAP_RULES[status.sales_stage]
    gaps.push({
      id: `sales_stage:${status.sales_stage}`,
      axis: 'sales_stage',
      key: status.sales_stage,
      label: status.label,
      reason: rule.reason,
      state: status.state,
      priority_category: rule.category,
      suggested_action: suggestGapAction(rule.category, rule.action),
    })
  }

  return gaps
    .sort((a, b) => GAP_CATEGORY_RANK[a.priority_category] - GAP_CATEGORY_RANK[b.priority_category])
    .slice(0, MAX_CHAT_COVERAGE_GAPS)
}

/**
 * #2308.32 — un signal Market Memory n'étend un axe QU'À `to_verify`, jamais
 * plus haut, et seulement quand l'axe est encore `unknown` (une preuve
 * contact directe, elle, n'est jamais dégradée). `capStateForSources` prouve
 * le plafond en évaluant un état hypothétique « couvert » sourcé UNIQUEMENT
 * par la mémoire marché — c'est la même fonction que `@bellum/contracts`
 * teste en isolation, réutilisée ici plutôt que réimplémentée (GA-26).
 */
export function applyMarketMemoryContext(
  roleFamilies: readonly ChatCoverageRoleFamilyStatus[],
  observed: ReadonlySet<ChatCoverageRoleFamily>,
): ChatCoverageRoleFamilyStatus[] {
  return roleFamilies.map(status => {
    if (status.state !== 'unknown' || !observed.has(status.role_family)) return status
    return { ...status, state: capStateForSources('covered_verified', ['market_memory']) }
  })
}

/**
 * #2308.32 (corrigé 23/09/2026, réfuté sur la prod 7e7105fb7) — traduit les
 * familles de rôles OBSERVÉES par la mémoire marché (`MarketMemoryService
 * .coverageFor`, vocabulaire de DOMAINE : « Data / IA », « Infra / Cloud »,
 * « PMO »… — voir `market-memory-import.spec.ts`) vers l'UNIQUE famille de
 * rôle D'ACHAT (`ChatCoverageRoleFamily`) qui a une correspondance réelle :
 * `securite_conformite`. C'est exactement la règle que `classifyRoleFamilies`
 * applique déjà aux CONTACTS (#2308.13 — « réutilise la famille de domaine
 * cyber déjà classée, jamais un second classificateur de rôle »), reprise
 * via le même résolveur d'alias que tout le dépôt (`resolveBuyerRoleFamily`,
 * GA-26 : un réglage vit à un seul endroit).
 *
 * Les neuf autres familles (sponsor, décideur économique, référent
 * technique, achats, utilisateur, relais, opérationnel, manager, partenaire)
 * sont des RÔLES DE COMITÉ D'ACHAT, orthogonaux au DOMAINE que la mémoire
 * marché observe (`buyer-role-families.ts`, docblock de tête — « une famille
 * de rôles acheteurs est un DOMAINE… orthogonal au RÔLE DÉCISIONNEL »). Leur
 * attribuer un signal ici inventerait une correspondance que la donnée ne
 * porte pas : elles ne reçoivent donc jamais rien de cette fonction.
 */
export function resolveMarketMemoryRoleFamilies(
  rows: readonly { family: string }[],
): ReadonlySet<ChatCoverageRoleFamily> {
  const observed = new Set<ChatCoverageRoleFamily>()
  for (const row of rows) {
    if (resolveBuyerRoleFamily(row.family) === 'cyber') observed.add('securite_conformite')
  }
  return observed
}

/**
 * Assemble la carte de couverture du chat pour UN compte, à partir de SES
 * contacts et de SON statut commercial — jamais un second calcul, jamais une
 * donnée inventée (GA-26 / doctrine « jamais de donnée fictive »).
 *
 * `marketMemoryObservedRoleFamilies` (#2308.32, corrigé 23/09/2026) : vide
 * par défaut, donc un appelant qui ne le passe pas garde le comportement
 * d'avant ce correctif à l'octet près. Appliqué AVANT `salesStages`/`gaps`
 * pour que l'élévation ondule jusqu'à `sponsor_identifie` (dérivé de l'état
 * du rôle sponsor) et jusqu'à la liste des gaps — jamais après, sur un
 * résultat déjà figé (contrairement à `market_role_families_observed`, sur
 * l'AUTRE matrice, qui elle ne participe jamais au calcul).
 */
export function computeChatCoverageMap(
  accountId: string,
  contacts: readonly ChatCoverageContactInput[],
  account: ChatCoverageAccountInput,
  now: Date = new Date(),
  marketMemoryObservedRoleFamilies: ReadonlySet<ChatCoverageRoleFamily> = new Set(),
): ChatCoverageMapResponse {
  const contactRoleFamilies = buildRoleFamilies(contacts, now)
  const roleFamilies =
    marketMemoryObservedRoleFamilies.size === 0
      ? contactRoleFamilies
      : applyMarketMemoryContext(contactRoleFamilies, marketMemoryObservedRoleFamilies)
  const perimeters = buildPerimeters(contacts, now)
  const salesStages = buildSalesStages(account, roleFamilies)
  const gaps = buildGaps(roleFamilies, perimeters, salesStages)
  return {
    account_id: accountId,
    generated_at: now.toISOString(),
    // GA-259 — phrase POSITIVE : ce qu'on affirme SAVOIR, jamais un fait de
    // marché ni une négation qui deviendrait une affirmation au remaniement
    // suivant.
    meaning: 'Cette carte dit ce que nous savons de ce compte à partir de ses contacts, jamais ce que le marché fait.',
    role_families: roleFamilies,
    perimeters,
    sales_stages: salesStages,
    gaps,
  }
}
