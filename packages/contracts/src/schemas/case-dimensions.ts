import type { RelationshipState } from './sales-context.js'

/**
 * #3246 / #3210.3 — les dimensions de similarité à VOCABULAIRE FERMÉ : la
 * stratégie d'approche et le modèle d'achat (lot W9, décision Louis
 * 11/10/2026), puis l'organisation de la décision (lot cloud 14/10).
 *
 * Saisies par un humain sur le REX (cas gagné) et sur l'opportunité perdue ;
 * jamais dérivées, jamais devinées. Une valeur absente d'un côté n'est NI une
 * similitude NI une différence. Les codes voyagent vers la base : la contrainte
 * CHECK de chaque migration (`1796440123457` pour stratégie/modèle d'achat,
 * `20261014060000` pour l'organisation) est écrite AVANT le code qui les
 * écrit (GA-11 / GA-12) et doit rester l'image exacte de ces listes.
 */
export const CASE_STRATEGIES = ['conquete_directe', 'extension_de_compte', 'via_partenaire', 'defense_de_base'] as const
export type CaseStrategy = (typeof CASE_STRATEGIES)[number]

export const CASE_BUYING_MODELS = ['appel_offres', 'accord_cadre', 'referencement', 'gre_a_gre'] as const
export type CaseBuyingModel = (typeof CASE_BUYING_MODELS)[number]

/**
 * #3246 / #3210.3 (lot cloud 14/10) — troisième dimension à VOCABULAIRE FERMÉ :
 * l'organisation de la décision côté client. Tranché sans Louis faute d'un
 * vocabulaire déjà arbitré ailleurs (même situation que `CASE_STRATEGIES` /
 * `CASE_BUYING_MODELS` au lot W9) : la largeur du cercle qui a tranché, pas
 * la position du compte dans un groupe (déjà comparée par `groupRole`) ni un
 * rôle du comité d'achat (`org-graph.ts`, un AUTRE axe). Saisie par un
 * humain sur le REX / l'opportunité perdue, jamais dérivée.
 */
export const CASE_ORGANISATIONS = ['decideur_unique', 'comite_restreint', 'comite_elargi'] as const
export type CaseOrganisation = (typeof CASE_ORGANISATIONS)[number]

export const CASE_STRATEGY_LABELS: Readonly<Record<CaseStrategy, string>> = {
  conquete_directe: 'conquête directe',
  extension_de_compte: 'extension de compte',
  via_partenaire: 'via un partenaire',
  defense_de_base: 'défense de la base installée',
}

export const CASE_BUYING_MODEL_LABELS: Readonly<Record<CaseBuyingModel, string>> = {
  appel_offres: 'appel d’offres',
  accord_cadre: 'accord-cadre',
  referencement: 'référencement',
  gre_a_gre: 'gré à gré',
}

export const CASE_ORGANISATION_LABELS: Readonly<Record<CaseOrganisation, string>> = {
  decideur_unique: 'décideur unique',
  comite_restreint: 'comité restreint',
  comite_elargi: 'comité élargi',
}

/**
 * #3246.relation (décision Louis 16/10/2026) — la RELATION au compte comme
 * dimension de similarité : un stade de la liste FERMÉE déjà arbitrée
 * (`relationshipStateSchema`, 10 stades), SAISI par le commercial dans
 * `relationship_memory.relationStage`, à côté du texte libre
 * `relationship_memory.relation` qui reste — et n'est JAMAIS parsé pour
 * remplir ce champ. Absent = non comparé (sort du dénominateur, jamais 0).
 */
export const CASE_RELATION_LABELS: Readonly<Record<RelationshipState, string>> = {
  froid: 'compte froid',
  connu: 'compte connu',
  linkedin: 'connexion acceptée sur le réseau professionnel',
  dormant: 'relation dormante',
  refere: 'compte référé',
  ancien_client: 'ancien client',
  rang2: 'en rang 2',
  client_actif: 'client actif',
  besoin_ouvert: 'besoin ouvert',
  partenaire_actif: 'partenaire actif',
}

/**
 * #3246.timing (décision Louis 16/10/2026) — le TIMING comme dimension de
 * similarité : une liste FERMÉE CALCULÉE depuis des dates déjà en base, jamais
 * saisie. L'âge d'une affaire (ouverte : aujourd'hui − détection ; close :
 * clôture − détection) comparé à la durée MÉDIANE des cycles clos de l'espace.
 * Moins de {@link MIN_CLOSED_CYCLES_FOR_TIMING} cycles clos datés, ou une date
 * absente = NON ÉVALUABLE : la dimension sort du dénominateur et se NOMME.
 */
export const CASE_TIMINGS = ['tot', 'dans_le_cycle', 'en_retard'] as const
export type CaseTiming = (typeof CASE_TIMINGS)[number]

export const CASE_TIMING_LABELS: Readonly<Record<CaseTiming, string>> = {
  tot: 'tôt dans le cycle habituel',
  dans_le_cycle: 'dans le cycle habituel',
  en_retard: 'au-delà du cycle habituel',
}

/** Sous ce nombre de cycles clos datés, une médiane n'est pas une mesure : le timing est non évaluable. */
export const MIN_CLOSED_CYCLES_FOR_TIMING = 3
