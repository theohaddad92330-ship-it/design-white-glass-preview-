import { z } from 'zod'

/**
 * #3175.1/.2 (épopée #3215) — miroir TS de l'objet `CommercialIntent` à treize
 * champs, produit côté service IA (`apps/ia/app/services/compilers/commercial_intent.py`).
 * Deux langages, une seule liste (GA-26) : `commercial-intent.parity.test.ts`
 * LIT le module Python.
 *
 * ⚠️ L'objet complet (`literal_request`, `primary_entity`) ne traverse JAMAIS
 * vers le modèle ni vers un journal : seule la VUE journalisable
 * (`commercialIntentLogSchema`) est un contrat de transport.
 */
export const COMMERCIAL_INTENT_FIELDS = [
  'literal_request',
  'underlying_decision',
  'expected_outcome',
  'primary_entity',
  'secondary_entities',
  'requested_facets',
  'explicit_exclusions',
  'time_horizon',
  'requested_knowledge_scope',
  'action_level',
  'evidence_requirement',
  'ambiguity_level',
  'commercial_risk',
] as const

export const COMMERCIAL_DECISIONS = [
  'trouver_des_comptes',
  'ouvrir_ou_non_le_compte',
  'choisir_entre_options',
  'positionner_un_consultant',
  'trouver_les_decideurs',
  'comprendre_le_perimetre',
  'preparer_l_approche',
  'actualiser_l_information',
  'suivre_l_affaire',
] as const

export const COMMERCIAL_ACTION_LEVELS = ['lire', 'analyser', 'preparer'] as const
export const COMMERCIAL_EVIDENCE_REQUIREMENTS = ['aucune', 'preuve_d_outil'] as const
export const COMMERCIAL_AMBIGUITY_LEVELS = ['faible', 'moyenne', 'elevee'] as const
export const COMMERCIAL_RISK_LEVELS = ['faible', 'moyen', 'eleve'] as const
export const COMMERCIAL_KNOWLEDGE_SCOPES = ['internal_only'] as const
