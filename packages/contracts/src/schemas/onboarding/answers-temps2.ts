import { z } from 'zod'
import { ONBOARDING_MAX_MULTI, TEMPS2_MAX_REFERENCES } from './limits.js'

/**
 * Temps 2 — le complément, demandé APRÈS la première analyse terminée.
 *
 * Les cinq sont `.optional()` à dessein : le Temps 2 ne bloque jamais, donc une
 * charge utile qui les omet (un client plus ancien, un utilisateur qui a passé)
 * doit rester valide. Chaque clé a un consommateur RÉEL dans les prompts de
 * l'IA (voir `esnAnswersToProfileData`) — on ne demande rien qu'on ne lise.
 */
export const TEMPS2_ANSWER_FIELDS = {
  decision_maker_personas: z.array(z.string()).optional(),
  avg_sales_cycle: z.string().nullable().optional(),
  avg_tjm: z.string().nullable().optional(),
  client_references: z.array(z.string().max(80)).optional(),
  no_go_sectors: z.array(z.string()).optional(),
}
