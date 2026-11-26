import type { LinkKind, RelationalWarmth } from './link-kind.js'

/**
 * #3403 — LES ONZE VOIES D'ACCÈS PERSONNELLES, ET ONZE SEULEMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE VOCABULAIRE, ET POURQUOI IL N'EST PAS `AccessMode`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet Accès savait déjà dire COMMENT une ESN entre chez un compte — les
 * sept `ACCESS_MODES` (`access.ts`), une affaire de STRUCTURE commerciale
 * (référencement, filiale, rang 2, portage…). Le retour #3403 demande autre
 * chose : PAR QUI on entre — la voie RELATIONNELLE, portée par une personne ou
 * un lien du workspace, jamais par la structure du compte. Deux questions,
 * deux vocabulaires, comme `ecosystem-relation.js` (ce qu'une ESN EST) et
 * `link-kind.js` (ce qu'une personne est pour une autre) ne se recouvrent pas.
 *
 * L'ordre est celui du retour, et il est ADDITIF (GA-08) : une voie ne s'insère
 * jamais au milieu.
 *
 * Huit de ces onze voies ont une dérivation RÉELLE dans ce dépôt dès ce commit
 * (`account-access.service.ts` les câble) :
 *  - `consultant_en_place` / `ancien_collegue` / `relation_commune` /
 *    `recommandation_directe` / `ancien_manager` / `evenement_rencontre` /
 *    `reseau_alumni` ← `LINK_KINDS` (déclaré par un humain sur
 *    `introduction_authorizations.link_kind`, #3403.7) ;
 *  - `client_existant` ← l'état de relation CRM déjà lu par
 *    `readRelationshipState` (`org-graph-path.ts`) ;
 *  - `partenaire_rang2` / `esn_referencee` ← `account_partners` (rang 2 /
 *    rang 1, déjà persisté par l'onglet Écosystème) ;
 *  - `personne_changement_poste` ← le signal déjà écrit par
 *    `openDoorFromMove` (`crm-routines.service.ts`) dans `opportunities`.
 */
export const PERSONAL_ACCESS_VOIES = [
  /** 1. Un consultant de l'ESN déjà en poste qui connaît la cible. */
  'consultant_en_place',
  /** 2. Un ancien collègue de la cible ou du commercial. */
  'ancien_collegue',
  /** 3. Une relation commune, sans qu'elle ait agi. */
  'relation_commune',
  /** 4. Le compte est déjà client — une relation CRM active. */
  'client_existant',
  /** 5. Une ESN partenaire, en rang 2 confirmé sur ce compte. */
  'partenaire_rang2',
  /** 6. Une ESN déjà référencée en rang 1 sur ce compte. */
  'esn_referencee',
  /** 7. Un ancien manager de la cible ou du commercial. */
  'ancien_manager',
  /** 8. Quelqu'un qu'on connaît vient de rejoindre ce compte. */
  'personne_changement_poste',
  /** 9. Rencontré lors d'un événement ou d'une conférence. */
  'evenement_rencontre',
  /** 10. Un lien issu d'un réseau d'anciens élèves. */
  'reseau_alumni',
  /** 11. Une recommandation explicite, nommée. */
  'recommandation_directe',
] as const
export type PersonalAccessVoie = (typeof PERSONAL_ACCESS_VOIES)[number]

/**
 * #3403.7 — les SEPT `LinkKind` qui correspondent à une voie nommée par le
 * retour. Les six autres (`proposed_introduction`, `workspace_colleague`,
 * `linkedin_interaction`, `historic_contact`, `probable_relation`,
 * `plain_homonymy`) restent HORS de cette carte : forcer une correspondance
 * renommerait une catégorie pour la faire rentrer dans une case, ce que
 * `ecosystem-relation.js` refuse déjà en toutes lettres.
 */
export const LINK_KIND_TO_VOIE: Readonly<Partial<Record<LinkKind, PersonalAccessVoie>>> = {
  consultant: 'consultant_en_place',
  former_colleague: 'ancien_collegue',
  common_relation: 'relation_commune',
  explicit_recommendation: 'recommandation_directe',
  former_manager: 'ancien_manager',
  event_encounter: 'evenement_rencontre',
  alumni_network: 'reseau_alumni',
}

/**
 * #3403.13 — les cinq distinctions demandées par le retour, réduites à quatre
 * ICI : « absence d'information » n'est pas une valeur qu'un chemin PORTE — un
 * chemin qui existe porte toujours au moins une des quatre autres. L'absence
 * d'information se lit dans l'absence même de ligne (voir
 * {@link groupPersonalAccessPathsByVoie}), jamais dans une cinquième étiquette
 * posée sur un chemin qui, par définition, a été trouvé.
 */
export const PERSONAL_ACCESS_CERTAINTIES = [
  /** Accès vérifié — une preuve tient : accord confirmé, placement réel,
   *  relation CRM active. */
  'verified_access',
  /** Relation probable — nommée, jamais confirmée. */
  'probable_relation',
  /** Simple affinité (#3403.13, X68) — un lien déclaré, non vérifié, que l'équipe
   *  elle-même juge DISTANT : un point commun, pas une relation sur laquelle
   *  s'appuyer. Dérivée de la chaleur DÉCLARÉE, jamais devinée. */
  'simple_affinity',
  /** Observation historique — vue par le pipeline ou un signal détecté,
   *  jamais déclarée par un humain. */
  'historic_observation',
] as const
export type PersonalAccessCertainty = (typeof PERSONAL_ACCESS_CERTAINTIES)[number]

export const PERSONAL_ACCESS_RISKS = ['stale', 'unconfirmed', 'undeclared_detection'] as const
export type PersonalAccessRisk = (typeof PERSONAL_ACCESS_RISKS)[number]

/**
 * #3403.7 — demi-vie d'une voie personnelle, en jours.
 *
 * MÊME seuil que `RELATION_STALE_AFTER_DAYS` (`warmIntroGovernance.ts`,
 * #2373.7) — un réglage vit à un seul endroit (GA-26) : celui-ci ré-exporte
 * cette constante plutôt que d'en garder une copie qui diverge au premier
 * ajustement.
 */
export const PERSONAL_LINK_STALE_AFTER_DAYS = 180

export type PersonalAccessFreshness = 'fresh' | 'stale' | 'undated'

/** Non daté = `undated`, jamais `fresh` : l'absence de date n'est pas une
 *  preuve de fraîcheur (même règle que `accessFreshness`, `access.ts`). */
export function personalAccessFreshness(observedAt: string | null, now: Date): PersonalAccessFreshness {
  if (!observedAt) return 'undated'
  const observed = new Date(observedAt)
  if (Number.isNaN(observed.getTime())) return 'undated'
  const days = (now.getTime() - observed.getTime()) / 86_400_000
  return days > PERSONAL_LINK_STALE_AFTER_DAYS ? 'stale' : 'fresh'
}

/**
 * #3667.R1 — LE SOURCEKIND D'UNE LIGNE `account_partners`, À UN SEUL ENDROIT.
 *
 * Des placements RÉELS priment sur la simple déclaration, qui prime sur la
 * seule observation du pipeline — `account-access.service.ts` et
 * `account-strategy-5p.ts` (ESN citées par la stratégie) lisent la MÊME table
 * et doivent calculer le MÊME sourceKind (GA-26) : une ESN a un statut
 * identique, qu'on la retrouve dans Accès ou dans la stratégie 5P.
 */
export function partnerRegistrySourceKind(row: {
  placements: number
  source: string
}): Extract<PersonalAccessSourceKind, `partner_registry_${string}`> {
  if (row.placements > 0) return 'partner_registry_proven'
  return row.source === 'declared' ? 'partner_registry_declared' : 'partner_registry_observed'
}

/** D'où vient la ligne — ce qui décide de sa certitude AVANT sa fraîcheur. */
export type PersonalAccessSourceKind =
  /** `introduction_authorizations.link_kind`, déclaré par un humain. */
  | 'workspace_declared_link'
  /** `account_partners`, avec des placements RÉELS — la seule preuve qu'une
   *  relation existe vraiment (docblock de `AccountPartnerEntity.placements`). */
  | 'partner_registry_proven'
  /** `account_partners`, `source = 'declared'`, sans placement. */
  | 'partner_registry_declared'
  /** `account_partners`, `source = 'analysis'` — vu par le pipeline, jamais
   *  confirmé par un humain. */
  | 'partner_registry_observed'
  /** L'état de relation CRM (`readRelationshipState`) dit `client_actif`. */
  | 'crm_relationship'
  /** Un signal détecté (`openDoorFromMove`), jamais déclaré. */
  | 'detected_signal'

/**
 * #3403.13/.14 — LA CERTITUDE D'UNE VOIE, JAMAIS UNE GARANTIE SANS PREUVE.
 *
 * Périmé fait TOUJOURS retomber en observation historique en premier : une
 * relation CRM active d'il y a trois ans ne dit plus rien d'aujourd'hui, quelle
 * que soit sa source.
 */
export function personalAccessCertainty(args: {
  sourceKind: PersonalAccessSourceKind
  verified: boolean
  freshness: PersonalAccessFreshness
  /** Chaleur DÉCLARÉE du lien (seul `workspace_declared_link` en porte une). */
  warmth?: RelationalWarmth | null
}): PersonalAccessCertainty {
  // #3473 — la relation du registre partenaires est la MÊME que celle de la
  // liste « Les ESN présentes », qui ne la vieillit pas : une déclaration
  // d'équipe reste « déclarée » à 190 jours. Seule la voie SANS registre
  // (lien déclaré, CRM, signal) retombe en observation quand elle est périmée.
  // La péremption reste dite, par `freshness` et le risque `stale`.
  const fromPartnerRegistry = args.sourceKind.startsWith('partner_registry_')
  if (args.freshness === 'stale' && !fromPartnerRegistry) return 'historic_observation'
  switch (args.sourceKind) {
    case 'workspace_declared_link':
      if (args.verified) return 'verified_access'
      return args.warmth === 'distant' ? 'simple_affinity' : 'probable_relation'
    case 'partner_registry_proven':
      return 'verified_access'
    case 'partner_registry_declared':
      return 'probable_relation'
    case 'partner_registry_observed':
      // Vue par le pipeline À UNE DATE = la « source actuelle » de la liste :
      // nommée, jamais confirmée. Sans date, elle ne prouve rien.
      return args.freshness === 'undated' ? 'historic_observation' : 'probable_relation'
    case 'crm_relationship':
      return 'verified_access'
    case 'detected_signal':
      return 'historic_observation'
  }
}

/**
 * #3403.16 — LE RISQUE NOMMÉ, JAMAIS UN CHIFFRE INVENTÉ.
 *
 * Générique sur la CERTITUDE et la FRAÎCHEUR, jamais sur la voie : un risque
 * par voie inventerait une raison qu'aucune donnée ne porte.
 */
export function personalAccessRisk(args: {
  certainty: PersonalAccessCertainty
  freshness: PersonalAccessFreshness
}): PersonalAccessRisk | null {
  if (args.freshness === 'stale') return 'stale'
  if (args.certainty === 'probable_relation' || args.certainty === 'simple_affinity') return 'unconfirmed'
  if (args.certainty === 'historic_observation') return 'undeclared_detection'
  return null
}

/**
 * #3403.4 — LA VOIE « CLIENT EXISTANT » : L'ÉTAT DE RELATION CRM.
 *
 * Déplacé ici depuis `org-graph-path.ts` (apps/api), qui le re-exporte tel
 * quel : un réglage vit à un seul endroit (GA-26), et le placer dans
 * `@bellum/contracts` permet à `account-access.service.ts` de le lire SANS
 * importer un autre module NestJS (règle #7 — chaque module reste autonome).
 *
 * Lit `raw_analysis.salesContext.relationship.state`. Absent ou illisible =
 * `null`, jamais une valeur devinée.
 */
export function readRelationshipState(rawAnalysis: unknown): string | null {
  if (!rawAnalysis || typeof rawAnalysis !== 'object') return null
  const sc = (rawAnalysis as Record<string, unknown>)['salesContext']
  if (!sc || typeof sc !== 'object') return null
  const rel = (sc as Record<string, unknown>)['relationship']
  if (!rel || typeof rel !== 'object') return null
  const state = (rel as Record<string, unknown>)['state']
  return typeof state === 'string' ? state : null
}

export type PersonalAccessPath = {
  id: string
  voie: PersonalAccessVoie
  /** Le périmètre : qui, précisément, porte cette voie. */
  subject: string
  /** La preuve lisible, ou `null` quand la source n'en porte aucune de plus
   *  précis que son existence même. */
  proof: string | null
  observedAt: string | null
  freshness: PersonalAccessFreshness
  certainty: PersonalAccessCertainty
  risk: PersonalAccessRisk | null
  /** D'où vient la ligne — l'écran la NOMME (« Déclarée par ton équipe »,
   *  « Source actuelle »…) pour qu'elle ne contredise jamais la liste des ESN,
   *  qui parle de la même ligne avec le vocabulaire de sa provenance. */
  sourceKind: PersonalAccessSourceKind
  /** #3403.12 — chaleur relationnelle DÉCLARÉE sur le lien ; absente quand
   *  personne ne l'a déclarée (jamais devinée, les autres sources n'en portent pas). */
  warmth?: RelationalWarmth | null
  /** #3777 — le rôle de décision du contact qui porte la voie (`contacts.decision_role`),
   *  pour la pastille « Décideur » de la liste Contacts. Absent quand la voie ne
   *  repose pas sur un contact (ESN, CRM, signal) : jamais deviné. */
  decisionRole?: string | null
}

/**
 * #3403.1 / doctrine — DANS UNE LISTE, UNE ABSENCE NE FAIT AUCUNE LIGNE.
 *
 * Onze voies existent dans le VOCABULAIRE ; l'écran n'en montre jamais une
 * sans instance réelle — ni un groupe vide, ni un « 0 » qui se lirait comme un
 * fait. L'ordre rendu suit celui du retour (`PERSONAL_ACCESS_VOIES`), jamais
 * l'ordre d'arrivée des lignes en base.
 */
export function groupPersonalAccessPathsByVoie(
  paths: readonly PersonalAccessPath[],
): { voie: PersonalAccessVoie; items: PersonalAccessPath[] }[] {
  return PERSONAL_ACCESS_VOIES.map(voie => ({ voie, items: paths.filter(p => p.voie === voie) })).filter(
    group => group.items.length > 0,
  )
}
