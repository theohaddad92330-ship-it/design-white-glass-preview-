import { LAYOUT_TRANSITION } from '@bellum/ui'
export type RawEntity = {
  name?: string
  label?: string
  type?: string
  parent?: string
  region?: string
}

export type GraphEntity = {
  id: string
  name: string
  type: string
  parent: string | null
  region: string | null
  level: number
  // Théo p.6 : les entités non actionnables (SPV / cédées / homonymes / bruit)
  // vivent dans un onglet secondaire — ce flag pilote le filtre par défaut.
  actionable: boolean
  // #2966 (#2119.36-38) — QUI a produit cette ligne : jamais le nom du
  // fournisseur (doctrine — nos fournisseurs ne se nomment jamais), le PRODUIT
  // qui l'a écrite. `'analysis'` = la recherche Claude (`entitiesExhaustive`),
  // `'registry'` = le registre légal des filiales (Pappers). Stampé une seule
  // fois, à la construction (`entityData.ts`), jamais recalculé à l'affichage.
  source: EntitySource
  /** #4327.2 — l'hôte de la page qui nomme une filiale non confirmée (`source: 'web'`) ; absent = non nommé. */
  sourceHost?: string
  // #2966 (#2119.36-38) — la DISTINCTION périmètre commercial / implantation /
  // équipe que #2119 demande. Dérivée du `type` déjà connu (`deriveScopeKind`),
  // jamais une donnée neuve : un site reste un site, un département reste une
  // équipe, tout le reste est un périmètre commercial.
  scopeKind: ScopeKind
}

// #4327.2 — `'web'` = filiale nommée par le web, sans SIREN : affichée, étiquetée « non confirmée ».
export type EntitySource = 'analysis' | 'registry' | 'web'

export type ScopeKind = 'commercial' | 'implantation' | 'equipe'

/**
 * #2966 (#2119.36-38) — « Distinguer le périmètre commercial / l'implantation /
 * l'équipe ».
 *
 * Pure fonction du `type` déjà posé par le moteur : un `site` EST une
 * implantation (lieu physique, jamais un niveau de décision — voir
 * `TYPE_STYLES.site`) ; un `departement`/`equipe` EST l'échelon équipe
 * (`apps/ia/app/services/entities.py::_ENTITY_TREE_RANK` range déjà
 * `"equipe"` au même rang que `departement`) ; tout le reste — groupe / filiale
 * / BU / direction / JV / GIE / siège régional / marque / filiale stratégique /
 * opérationnelle / programme — reste un périmètre COMMERCIAL, celui que #2119
 * vise en premier. Aucune donnée neuve : trois lectures du même champ.
 */
export function deriveScopeKind(type: string | null | undefined): ScopeKind {
  const key = normaliseTypeKey(type)
  if (key === 'site') return 'implantation'
  if (key === 'departement' || key === 'equipe') return 'equipe'
  return 'commercial'
}

type TypeKey =
  | 'groupe'
  | 'filiale'
  | 'bu'
  | 'direction'
  | 'departement'
  | 'jv'
  | 'gie'
  | 'siege_regional'
  | 'operational'
  | 'marque'
  | 'filiale_strategique'
  | 'spv'
  | 'cedee'
  | 'homonyme'
  | 'bruit'
  | 'unknown'
  // Ajoutés en FIN d'union le 14/09/2026 : `accountOrg:entityType.site` et
  // `.programme` existaient dans les DEUX langues, mais aucune clé ici — donc
  // `normaliseTypeKey` les renvoyait sur `unknown` et l'écran affichait
  // « Autre ». Mesuré en production sur `E B TRANS ASSISTANCE` (deux entités
  // de type `site`, section Périmètres).
  | 'site'
  | 'programme'
  // #2966 (#2119.38) — l'échelon ÉQUIPE que #2119 demande de distinguer.
  // `apps/ia/app/services/entities.py::_ENTITY_TREE_RANK` range déjà
  // `"equipe"` (rang 3, comme `departement`) : le moteur peut déjà l'émettre,
  // et jusqu'ici `normaliseTypeKey` le renvoyait sur `unknown` faute de clé
  // ici — même défaut que `site`/`programme` avant le 14/09/2026 (voir plus
  // haut).
  | 'equipe'
  // #2919 — `orgEntityTypeSchema` (org-graph.ts) porte `partenaire` depuis ce
  // lot (une organisation TIERCE liée au compte — co-traitant, sous-traitant,
  // ESN concurrente — jamais un fournisseur à nous). `accountOrg:entityType.
  // partenaire` existait déjà dans les DEUX langues, mais aucune clé ici :
  // même défaut que `site`/`programme`/`equipe` ci-dessus, cette fois entre
  // deux consommateurs du MÊME espace i18n (`OrgNodeTypeBadge` et ce fichier).
  | 'partenaire'

// Les libellés de type sont résolus côté composant via i18n (`accountOrg:entityType.<TypeKey>`).
export const TYPE_STYLES: Record<TypeKey, { ring: string; badge: string; dot: string }> = {
  groupe: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-primary-500)_26%,transparent)]',
    badge:
      'bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-700)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_14%,transparent)] dark:text-[var(--bellum-primary-300)]',
    dot: 'bg-[var(--bellum-primary-500)]',
  },
  filiale: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
  bu: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-success)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-success)_10%,transparent)] text-[var(--bellum-success)]',
    dot: 'bg-[var(--bellum-success)]',
  },
  direction: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-warning)_28%,transparent)]',
    badge:
      'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] text-[var(--bellum-warning-text)] dark:text-[var(--bellum-warning)]',
    dot: 'bg-[var(--bellum-warning)]',
  },
  departement: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-warning)_28%,transparent)]',
    badge:
      'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] text-[var(--bellum-warning-text)] dark:text-[var(--bellum-warning)]',
    dot: 'bg-[var(--bellum-warning)]',
  },
  jv: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
  gie: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
  siege_regional: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-primary-500)_22%,transparent)]',
    badge:
      'bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-700)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_14%,transparent)] dark:text-[var(--bellum-primary-300)]',
    dot: 'bg-[var(--bellum-primary-500)]',
  },
  // ── Qualification Théo p.6 : actionnables ──────────────────────────────────
  operational: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
  marque: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-primary-500)_22%,transparent)]',
    badge:
      'bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-700)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_14%,transparent)] dark:text-[var(--bellum-primary-300)]',
    dot: 'bg-[var(--bellum-primary-500)]',
  },
  filiale_strategique: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-success)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-success)_10%,transparent)] text-[var(--bellum-success)]',
    dot: 'bg-[var(--bellum-success)]',
  },
  // ── Qualification Théo p.6 : non actionnables (onglet secondaire) ───────────
  spv: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-border)_55%,transparent)] text-[var(--bellum-text-secondary)]',
    dot: 'bg-[var(--bellum-text-muted)]',
  },
  cedee: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-border)_55%,transparent)] text-[var(--bellum-text-secondary)]',
    dot: 'bg-[var(--bellum-text-muted)]',
  },
  homonyme: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-warning)_28%,transparent)]',
    badge:
      'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] text-[var(--bellum-warning-text)] dark:text-[var(--bellum-warning)]',
    dot: 'bg-[var(--bellum-warning)]',
  },
  bruit: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-border)_55%,transparent)] text-[var(--bellum-text-muted)]',
    dot: 'bg-[var(--bellum-text-muted)]',
  },
  unknown: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-border)_55%,transparent)] text-[var(--bellum-text-primary)]',
    dot: 'bg-[var(--bellum-text-secondary)]',
  },
  // Un SITE est un lieu, pas un niveau de décision : jeton neutre, comme `spv`.
  site: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-text-muted)_30%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-border)_55%,transparent)] text-[var(--bellum-text-secondary)]',
    dot: 'bg-[var(--bellum-text-muted)]',
  },
  // Un PROGRAMME est transverse et actionnable : même jeton que `operational`.
  programme: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
  // Une ÉQUIPE est un échelon interne, comme `departement` : même jeton.
  equipe: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-warning)_28%,transparent)]',
    badge:
      'bg-[color-mix(in_srgb,var(--bellum-warning)_12%,transparent)] text-[var(--bellum-warning-text)] dark:text-[var(--bellum-warning)]',
    dot: 'bg-[var(--bellum-warning)]',
  },
  // #2919 — un PARTENAIRE est une organisation TIERCE actionnable (co-traitant,
  // sous-traitant, ESN concurrente sur le compte) : même jeton qu'`operational`.
  partenaire: {
    ring: 'ring-[color-mix(in_srgb,var(--bellum-info)_24%,transparent)]',
    badge: 'bg-[color-mix(in_srgb,var(--bellum-info)_10%,transparent)] text-[var(--bellum-info)]',
    dot: 'bg-[var(--bellum-info)]',
  },
}

export const rowTransition = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const
export const layoutTransition = LAYOUT_TRANSITION

export function normaliseTypeKey(type: string | null | undefined): TypeKey {
  if (!type) return 'unknown'
  // ⚠️ Plier la CASSE ne suffit pas : le moteur rend aussi bien `BU` que
  // `département`, et `'département' !== 'departement'`. C'est la forme web du
  // défaut déjà payé côté SQL — `ILIKE` est insensible à la casse, PAS aux
  // diacritiques. Deux entités d'AIRBUS s'affichaient « Autre » pour cet accent.
  // `NFD` sépare la lettre de son accent, la plage U+0300-U+036F retire l'accent.
  const key = type
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (key === 'holding') return 'groupe'
  if (key === 'subsidiary') return 'filiale'
  if (key === 'business_unit') return 'bu'
  if (key === 'department') return 'departement'
  return key in TYPE_STYLES ? (key as TypeKey) : 'unknown'
}

export function styleForType(type: string | null | undefined) {
  return TYPE_STYLES[normaliseTypeKey(type)]
}
