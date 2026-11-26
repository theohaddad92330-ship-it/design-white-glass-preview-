import { z } from 'zod'

/**
 * Shared enums and primitives for the analysis payload.
 *
 * Source of truth lives in the BELLUM-* Claude prompts (apps/ia/app/prompts).
 * We stay laxer than the prompts at the schema layer — Claude is not always
 * perfectly type-stable, and we'd rather drop an unknown enum value than
 * reject the whole analysis. Unknown enum values fall back to `unknown`.
 */

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low'])
export type Severity = z.infer<typeof severitySchema>

export const timeframeSchema = z.enum(['immediat', '6 mois', '12 mois', 'strategique'])
export type Timeframe = z.infer<typeof timeframeSchema>

export const urgencySchema = z.enum(['critique', 'haute', 'moyenne', 'basse'])
export type Urgency = z.infer<typeof urgencySchema>

export const importanceSchema = z.enum(['strategique', 'haute', 'moyenne', 'basse'])
export type Importance = z.infer<typeof importanceSchema>

// Entity type taxonomy. The first six are structural (LLM-set); the last six are
// the qualification Théo asked for (restitution p.6: "Chaque entité doit porter un
// type : BU, marque, filiale stratégique, SPV, cédée, homonyme, bruit") so the
// cartography can badge / de-prioritise non-actionable nodes.
export const entityTypeSchema = z.enum([
  'filiale',
  'BU',
  'direction',
  'departement',
  'JV',
  'GIE',
  'operational',
  'marque',
  'filiale_strategique',
  'SPV',
  'cedee',
  'homonyme',
  'bruit',
])
export type EntityType = z.infer<typeof entityTypeSchema>

// Deterministic relevance stamped by the IA gate (mirrors app/services/entities.py).
export const entityRelevanceSchema = z.enum(['operating', 'noise', 'out_of_sector'])
export type EntityRelevance = z.infer<typeof entityRelevanceSchema>

export const itAutonomySchema = z.enum(['autonome', 'partage', 'centralise'])
export type ItAutonomy = z.infer<typeof itAutonomySchema>

/**
 * Niveau de territoire commercial (#2302, LAU-FINAL-043) — le résolveur de
 * territoire recommande un PÉRIMÈTRE parmi ces niveaux pour une approche
 * commerciale (quel niveau du compte adresser).
 *
 * ⚠️ ARBITRAGE LOUIS 18/09/2026 (doctrine `c83…`, `doctrine-registry.ts`) :
 * « territoire » (NIVEAU DE COMPTE, ICI) et « nœud de graphe d'organisation »
 * (`orgEntityTypeSchema`, `org-graph.ts`) sont DEUX AXES SÉPARÉS, jamais
 * fondus. `'programme'` et `'projet'` N'APPARAISSENT PAS ici : ce sont des
 * nœuds/overlays de l'AUTRE axe (`orgEntityTypeSchema` porte déjà
 * `'programme'`). Un point qui demanderait « niveau de territoire : programme »
 * renvoie vers cet autre schéma plutôt que de dupliquer la valeur (GA-26).
 *
 * Les six premières valeurs REPRENNENT le vocabulaire déjà posé ailleurs —
 * `'groupe'`/`'filiale'`/`'bu'`/`'direction'`/`'marque'` déjà utilisées par
 * `entityTypeSchema` ci-dessus, `'entite_juridique'` = le SIREN que chaque
 * entité analysée porte déjà (`apps/ia/app/services/entities.py`). Les cinq
 * dernières sont NEUVES : `'maison_mere'`/`'sous_filiale'` affinent la
 * hiérarchie plate de `entityTypeSchema` (filiale d'une filiale) ;
 * `'etablissement'`/`'region'`/`'pays'` couvrent les granularités
 * géographiques/légales qu'aucun schéma existant ne portait.
 *
 * Miroir Python : `apps/ia/app/services/compilers/territory_resolver.py`
 * (`TERRITORY_LEVELS`) — verrouillé par `primitives.test.ts` et
 * `tests/test_territory_resolver.py::TestTerritoryLevels`.
 */
export const territoryLevelSchema = z.enum([
  'groupe',
  'maison_mere',
  'filiale',
  'sous_filiale',
  'bu',
  'direction',
  'entite_juridique',
  'marque',
  'etablissement',
  'region',
  'pays',
])
export type TerritoryLevel = z.infer<typeof territoryLevelSchema>

/**
 * Le type d'un site — le MÊME vocabulaire des deux côtés du produit : celui que
 * l'IA observe sur un compte (`sitesFrance[].type`) et celui qu'un vendeur
 * CIBLE (`offer_portfolio.target_site.types`). En créer un second, fût-il mieux
 * rangé, garantirait qu'un ciblage « usine » ne rapproche jamais un site que le
 * pipeline a typé « usine » — le défaut « lire et écrire dans deux tables »,
 * transposé au vocabulaire.
 *
 * Extrait en constante NOMMÉE (il était inline dans le `z.enum`) : une liste
 * anonyme est invisible de GA-08, qui ne lit que les `export const X = [...] as
 * const` — c'est ainsi que deux contraintes CHECK ont pu rétrécir sans être vues.
 *
 * ⚠️ ADDITIF, ajouts EN FIN (GA-08) : ces valeurs sont écrites dans les
 * `raw_analysis` de production et y restent pour toujours.
 *
 * ⚠️ L'apostrophe de « bureau d’études » est TYPOGRAPHIQUE (U+2019) et non
 * ASCII : l'extracteur de GA-08 délimite les valeurs sur l'apostrophe simple,
 * si bien qu'un `'bureau d\'études'` se lirait « bureau d\ » et gèlerait une
 * valeur tronquée. Les lecteurs tolèrent de toute façon la chaîne libre.
 */
export const SITE_TYPES = [
  'siege',
  'R&D',
  'usine',
  'datacenter',
  'agence',
  'bureau commercial',
  'centre de services',
  // Ajouts ingénierie industrielle (addendum Stelya §8) — un bureau d'études
  // n'est pas de la R&D (l'un conçoit sur commande, l'autre cherche), et un
  // site d'énergie ni une usine ni un datacenter.
  'bureau d’études',
  'entrepôt',
  'site énergie',
  'chantier',
] as const

export const siteTypeSchema = z.enum(SITE_TYPES)
export type SiteType = z.infer<typeof siteTypeSchema>

export const technologyMaturitySchema = z.enum(['legacy', 'mature', 'emerging', 'PoC'])
export type TechnologyMaturity = z.infer<typeof technologyMaturitySchema>

// #2617.1 — RETENU : les six catégories métier demandées par Simon
// (recrutement · appel d'offres · marché public · nomination · budget ·
// historique) n'étaient PAS toutes exprimables ici — `appel_offres` et
// `marche_public` manquaient, fondus jusqu'ici dans `budget`. Un appel
// d'offres PRIVÉ et un marché PUBLIC (une collectivité, une administration)
// n'ont ni le même acheteur ni le même calendrier. Les neuf genres existants
// restent : une valeur déjà écrite en base (`accounts.raw_analysis`,
// `signal_history.signal_type`) ne se retire jamais du contrat qui la valide
// (doctrine « on archive, on ne supprime pas »).
export const signalKindSchema = z.enum([
  'nomination',
  'budget',
  'projet',
  'incident',
  'regulation',
  'acquisition',
  'partenariat',
  'restructuration',
  'recrutement',
  'appel_offres',
  'marche_public',
  // #2952 (#2305.6/.7/.11/.12) — LAU-FINAL-046 nomme onze natures de signal ;
  // quatre en manquaient encore ici. `restructuration`/`budget`/`projet`
  // étaient des libellés voisins, pas ces quatre-là (git grep exhaustif du
  // 18/09/2026, confirmé le 25/09/2026).
  'transformation',
  'demenagement',
  'investissement',
  'organisation',
  // #3206.6 (partiel, épopée #3240) — cinq natures que `bellum_signals.py` ne
  // produisait pas encore : levée de fonds, technologie observée, contact et
  // recours externe (sous-traitance déjà en place). `appel_offres` figurait
  // déjà ici (ajouté pour une autre source) sans que ce prompt l'émette.
  'levee_fonds',
  'technologie',
  'contact',
  'recours_externe',
  // F2 (Louis 29/10/2026) — « élargir, c'est le même lot » : un signal d'écosystème (label, appartenance à un
  // annuaire) qui change de nature selon qu'il est frais (`discoverSignalTypeSchema`) ou relu de l'historique
  // (`signal_history.signal_type` → ici) est un piège à diagnostic. `signal_type` est un `text` sans CHECK
  // (migration 1787952416309, re-mesuré) : aucune contrainte SQL à élargir avant.
  'ecosystem',
])
export type SignalKind = z.infer<typeof signalKindSchema>

export const contractTypeSchema = z.enum(['regie', 'forfait', 'TMA', 'centre de services', 'consulting', 'inconnu'])
export type ContractType = z.infer<typeof contractTypeSchema>

export const goNoGoSchema = z.enum(['GO', 'NO-GO', 'CONDITIONNEL'])
export type GoNoGo = z.infer<typeof goNoGoSchema>

export const channelSchema = z.enum(['linkedin', 'email', 'phone', 'event', 'meeting', 'content'])
export type Channel = z.infer<typeof channelSchema>

export const dataFreshnessSchema = z.enum(['recent', 'old', 'undated'])
export type DataFreshness = z.infer<typeof dataFreshnessSchema>

export const effortSchema = z.enum(['faible', 'moyen', 'important'])
export type Effort = z.infer<typeof effortSchema>

export const probabilitySchema = z.enum(['haute', 'moyenne', 'basse'])
export type Probability = z.infer<typeof probabilitySchema>

export const riskImpactSchema = z.enum(['critique', 'important', 'modere'])
export type RiskImpact = z.infer<typeof riskImpactSchema>
