import { z } from 'zod'

/**
 * Théo O onboarding-couverture (22/10/2026) — les VINGT-SIX clés NEUVES de la V23 (« Précisions de cadrage »).
 *
 * Toutes facultatives (`.optional()`) : un client plus ancien reste valide, et une valeur illisible dégrade en
 * `null` / `[]` — jamais un profil entier illisible pour un mot mal écrit (`null` = pas de réponse, jamais « 0 »).
 * Une colonne par clé sur `esn_profiles` (migration `…V23Answers`, contrainte posée AVANT le code qui l'écrit, GA-11/12).
 * AUCUN plafond de sélection : la V23 retire le plafond des choix multiples, et une troncature silencieuse serait une
 * réponse perdue. Les valeurs sont persistées verbatim (comme toute réponse du catalogue) ; une incertitude garde son
 * libellé (`onboarding-unknown-answers.ts`).
 *
 * ⚠️ Bloc AJOUTÉ EN FIN du schéma composé, comme les précédents.
 */
export const V23_ANSWER_FIELDS = {
  account_access: z.string().nullable().optional().catch(null),
  target_nature: z.array(z.string()).optional().catch([]),
  target_size: z.array(z.string()).optional().catch([]),
  horizon: z.string().nullable().optional().catch(null),
  success_target: z.string().nullable().optional().catch(null),
  language_capabilities: z.array(z.string()).optional().catch([]),
  offer_pitch: z.string().nullable().optional().catch(null),
  priority_expertise: z.array(z.string()).optional().catch([]),
  skill_technos: z.array(z.string()).optional().catch([]),
  activity_nature: z.array(z.string()).optional().catch([]),
  data_sources: z.array(z.string()).optional().catch([]),
  tools: z.array(z.string()).optional().catch([]),
  workflow_pain: z.string().nullable().optional().catch(null),
  delivery_frictions: z.array(z.string()).optional().catch([]),
  autonomy: z.string().nullable().optional().catch(null),
  context_policy: z.string().nullable().optional().catch(null),
  commercial_limits: z.string().nullable().optional().catch(null),
  currency: z.string().nullable().optional().catch(null),
  first_name: z.string().nullable().optional().catch(null),
  scope_level: z.string().nullable().optional().catch(null),
  scope_unit: z.string().nullable().optional().catch(null),
  bench_status: z.string().nullable().optional().catch(null),
  recruiting_priorities: z.array(z.string()).optional().catch([]),
  country_scope: z.array(z.string()).optional().catch([]),
  geography_detail: z.string().nullable().optional().catch(null),
  no_go: z.string().nullable().optional().catch(null),
}
