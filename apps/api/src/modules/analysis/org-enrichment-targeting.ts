import type {
  ContactFamily,
  CoverageGap,
  OrgEnrichmentMeasured,
  OrgEnrichmentTargetParams,
  OrgHierarchyLevel,
} from '@bellum/contracts'
import { BUYER_ROLE_FAMILIES, ORG_ENRICHMENT_WAVE_SIZE, measured, unknownMeasure } from '@bellum/contracts'
import { classifyContact } from '../contacts/contact-classifier'

/**
 * Sélection des candidats d'une vague d'enrichissement (D812) — pure,
 * déterministe, ZÉRO appel réseau. Réutilise ce qui existe déjà plutôt que de
 * réinventer un score :
 *  - `contacts.priority` (déjà écrit par le pipeline) ordonne `next_batch` —
 *    aucun second scoring ne se recalcule ici ;
 *  - `classifyContact` (`contact-classifier.ts`, la « liste perso » — mots-clés
 *    sur le TITRE, sans LLM) résout `family`/`decision_level` sur un contact
 *    non encore enrichi, pour `missing_roles` et `hierarchy_level` ;
 *  - `BUYER_ROLE_FAMILIES` (déjà la table de correspondance famille slug ↔
 *    `ContactFamily`) relie une zone blanche de couverture (`CoverageGap.family`,
 *    minuscule) au vocabulaire du classifieur (`IT`, `Cyber`, …).
 *
 * BASE COMMUNE À TOUS LES MODES : un contact déjà classé (`family !== null`)
 * ne revient JAMAIS dans une vague — « pas de full rerun pour un simple gap »
 * (§11 FINAL). Seuls les contacts non encore enrichis sont candidats.
 */

export type TargetableContact = {
  id: string
  fullName: string
  title: string | null
  entity: string | null
  /** `null` = pas encore classé par la phase 3 — le SEUL état candidat. */
  family: string | null
  priority: number | null
}

export type EnrichmentSelection = {
  scopeLabel: string
  /** Les contactIds RETENUS pour la/les vague(s) — `full_account` n'est pas
   *  plafonné ici : le découpage en vagues de {@link ORG_ENRICHMENT_WAVE_SIZE}
   *  vagues est la responsabilité de l'appelant. */
  candidateIds: string[]
  contactsTargeted: OrgEnrichmentMeasured<number>
}

type EnrichmentSelectionContext = {
  /** Les zones blanches déjà calculées par `CoverageService.computeForAccount`
   *  (mode `missing_roles`). `null` = service indisponible (constructeur nu /
   *  `@Optional()` absent) — une absence RÉELLE, jamais un tableau vide qui la
   *  confondrait avec « compte entièrement couvert ». `undefined` = non fourni
   *  (mode qui n'en a pas besoin). */
  coverageGaps?: CoverageGap[] | null
}

/** `decision_level` du classifieur (5 paliers de séniorité) → `orgHierarchyLevelSchema`
 *  (L0-L5, structurel). Documenté une seule fois — voir le docblock du module. */
const DECISION_LEVEL_TO_HIERARCHY: Readonly<Record<string, readonly OrgHierarchyLevel[]>> = {
  c_level: ['L1'],
  direction: ['L2'],
  management: ['L3'],
  expert: ['L4'],
  operationnel: ['L4'],
}

/** L5 (« Achats/contrôle ») est un axe PARALLÈLE à la séniorité, pas un palier
 *  dessus — l'enum le dit lui-même. Résolu par la FAMILLE, jamais le niveau. */
const L5_FAMILY = 'Achat'

function normalizeLabel(raw: string): string {
  return raw.trim().toLowerCase()
}

function notYetEnriched(contacts: readonly TargetableContact[]): TargetableContact[] {
  return contacts.filter(c => c.family === null)
}

function byPriorityDesc(a: TargetableContact, b: TargetableContact): number {
  return (b.priority ?? -Infinity) - (a.priority ?? -Infinity)
}

function classifiedFamilyOf(contact: TargetableContact): ContactFamily | null {
  return classifyContact({
    full_name: contact.fullName,
    title: contact.title,
    entity: contact.entity,
    email: null,
    phone: null,
    linkedin_url: null,
  }).family
}

function selectNextBatch(pool: TargetableContact[]): EnrichmentSelection {
  const ordered = [...pool].sort(byPriorityDesc)
  const wave = ordered.slice(0, ORG_ENRICHMENT_WAVE_SIZE)
  return {
    scopeLabel: 'Les prochains contacts les plus utiles',
    candidateIds: wave.map(c => c.id),
    contactsTargeted: measured(wave.length),
  }
}

function selectDirection(pool: TargetableContact[], entity: string | undefined): EnrichmentSelection {
  if (!entity) {
    return { scopeLabel: 'Direction', candidateIds: [], contactsTargeted: unknownMeasure('Aucune direction choisie.') }
  }
  const target = normalizeLabel(entity)
  const matched = pool.filter(c => c.entity !== null && normalizeLabel(c.entity) === target)
  return {
    scopeLabel: entity,
    candidateIds: matched.map(c => c.id),
    contactsTargeted: measured(matched.length),
  }
}

function selectMissingRoles(pool: TargetableContact[], ctx: EnrichmentSelectionContext): EnrichmentSelection {
  if (ctx.coverageGaps === null || ctx.coverageGaps === undefined) {
    return {
      scopeLabel: 'Rôles manquants',
      candidateIds: [],
      contactsTargeted: unknownMeasure(
        'Les zones à couvrir ne sont pas calculables ici (service de couverture indisponible).',
      ),
    }
  }
  if (ctx.coverageGaps.length === 0) {
    return { scopeLabel: 'Aucune zone à couvrir', candidateIds: [], contactsTargeted: measured(0) }
  }

  // Les zones les plus importantes d'abord (priority=1 = la plus urgente),
  // au plus trois familles — assez pour composer une vague, pas assez pour
  // redevenir « tout le compte » sous un autre nom.
  const topGapFamilies = [...ctx.coverageGaps]
    .sort((a, b) => a.priority - b.priority)
    .map(g => g.family)
    .filter((family, index, all) => all.indexOf(family) === index)
    .slice(0, 3)

  const targetContactFamilies = new Set(
    topGapFamilies
      .map(slug => BUYER_ROLE_FAMILIES.find(f => f.key === slug)?.contactFamily)
      .filter((f): f is ContactFamily => f !== undefined),
  )
  const labels = topGapFamilies
    .map(slug => BUYER_ROLE_FAMILIES.find(f => f.key === slug)?.labelFr)
    .filter((label): label is string => label !== undefined)

  const matched = pool.filter(c => {
    const family = classifiedFamilyOf(c)
    return family !== null && targetContactFamilies.has(family)
  })

  return {
    scopeLabel: labels.length > 0 ? labels.join(' + ') : 'Rôles manquants',
    candidateIds: matched.map(c => c.id),
    contactsTargeted: measured(matched.length),
  }
}

function selectHierarchyLevel(pool: TargetableContact[], levels: OrgHierarchyLevel[] | undefined): EnrichmentSelection {
  if (!levels || levels.length === 0) {
    return {
      scopeLabel: 'Niveau hiérarchique',
      candidateIds: [],
      contactsTargeted: unknownMeasure('Aucun niveau choisi.'),
    }
  }

  const wantsL5 = levels.includes('L5')
  const seniorityLevels: OrgHierarchyLevel[] = levels.filter(l => l !== 'L0' && l !== 'L5')
  const unsupported = levels.filter(l => l === 'L0')

  if (seniorityLevels.length === 0 && !wantsL5) {
    return {
      scopeLabel: 'Niveau hiérarchique',
      candidateIds: [],
      contactsTargeted: unknownMeasure(
        'Le niveau L0 (gouvernance) ne se déduit pas du titre seul, sans appel au modèle.',
      ),
    }
  }

  const matchedIds = new Set<string>()
  for (const c of pool) {
    if (wantsL5 && classifiedFamilyOf(c) === L5_FAMILY) {
      matchedIds.add(c.id)
      continue
    }
    if (seniorityLevels.length === 0) continue
    const decisionLevel = classifyContact({
      full_name: c.fullName,
      title: c.title,
      entity: c.entity,
      email: null,
      phone: null,
      linkedin_url: null,
    }).decision_level
    const mapped = DECISION_LEVEL_TO_HIERARCHY[decisionLevel] ?? []
    if (mapped.some(l => seniorityLevels.includes(l))) matchedIds.add(c.id)
  }

  const scopeLabel = levels.join(' + ') + (unsupported.length > 0 ? ' (L0 non déterminable, ignoré)' : '')
  return { scopeLabel, candidateIds: [...matchedIds], contactsTargeted: measured(matchedIds.size) }
}

function selectFullAccount(pool: TargetableContact[]): EnrichmentSelection {
  return {
    scopeLabel: 'Tout le compte',
    candidateIds: pool.map(c => c.id),
    contactsTargeted: measured(pool.length),
  }
}

/**
 * Point d'entrée unique des cinq modes (D810). `contacts` porte TOUS les
 * contacts du compte (enrichis ou non) — le filtre « non encore enrichi »
 * est appliqué UNE fois, ici, jamais recopié dans chaque mode.
 */
export function selectEnrichmentCandidates(
  contacts: readonly TargetableContact[],
  params: OrgEnrichmentTargetParams,
  ctx: EnrichmentSelectionContext,
): EnrichmentSelection {
  const pool = notYetEnriched(contacts)
  switch (params.mode) {
    case 'next_batch':
      return selectNextBatch(pool)
    case 'direction':
      return selectDirection(pool, params.entity)
    case 'missing_roles':
      return selectMissingRoles(pool, ctx)
    case 'hierarchy_level':
      return selectHierarchyLevel(pool, params.hierarchyLevels)
    case 'full_account':
      return selectFullAccount(pool)
    default: {
      const _exhaustive: never = params.mode
      throw new Error(`Mode de ciblage inconnu : ${String(_exhaustive)}`)
    }
  }
}
