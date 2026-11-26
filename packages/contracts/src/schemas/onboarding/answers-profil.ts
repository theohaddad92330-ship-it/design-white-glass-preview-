import { z } from 'zod'
import { PROFILE_ANSWER_MAX_MULTI } from './limits.js'

/**
 * Profil progressif — les 30 questions de la restitution V2 (§21-30).
 *
 * Toutes optionnelles, comme le Temps 2 : le questionnaire ne bloque JAMAIS,
 * chaque question se passe, et un client plus ancien qui ne les envoie pas
 * reste valide. Le catalogue, l'ordre et la logique conditionnelle vivent dans
 * `profile-questionnaire.ts` (côté web) — ici, seules les FORMES.
 */
export const PROFILE_ANSWER_FIELDS = {
  user_role: z.string().nullable().optional(),
  role_tenure: z.string().nullable().optional(),
  industry_tenure: z.string().nullable().optional(),
  individual_goal: z.string().nullable().optional(),
  // #2052.1 — champ UNIQUE, sans unité ni période ni source : ses propres
  // choix mélangent des RDV et des comptes (`profile-questionnaire.ts`,
  // `'0-2 RDV'` à côté de `'6+ comptes'`). REMPLACÉ en lecture par les
  // objectifs NOMMÉS de `esn_objectives` (`answers-objectifs.ts`), mais
  // CONSERVÉ tel quel (add-only, GA-11/GA-12) : on archive, on ne supprime pas.
  monthly_target: z.string().nullable().optional(),
  company_age: z.string().nullable().optional(),
  company_size: z.string().nullable().optional(),
  consultants_on_mission: z.string().nullable().optional(),
  consultants_in_pipe: z.string().nullable().optional(),
  team_overlap: z.string().nullable().optional(),
  ramp_up_capacity: z.string().nullable().optional(),
  avg_deal_size: z.string().nullable().optional(),
  target_margin: z.string().nullable().optional(),
  portfolio_size: z.string().nullable().optional(),
  accounts_relationship_status: z.string().nullable().optional(),
  weekly_calls: z.string().nullable().optional(),
  weekly_emails: z.string().nullable().optional(),
  weekly_linkedin: z.string().nullable().optional(),
  proactivity_level: z.string().nullable().optional(),
  public_sector_practice: z.string().nullable().optional(),
  regulated_sector_readiness: z.string().nullable().optional(),
  partner_relationship: z.string().nullable().optional(),
  go_to_market_channels: z.array(z.string()).optional(),
  sales_routine: z.array(z.string()).optional(),
  sales_blockers: z.array(z.string()).optional(),
  tooling: z.array(z.string()).optional(),
  shared_data_scope: z.array(z.string()).optional(),
  // #2056 — appels d'offres (bloc AO). Catalogue et logique de branchement
  // dans `profile-questionnaire.ts` — ici, seules les FORMES.
  rfp_platforms_used: z.array(z.string()).optional(),
  rfp_referencing_status: z.string().nullable().optional(),
  rfp_lot_allocation: z.string().nullable().optional(),
  rfp_response_templates: z.string().nullable().optional(),
  rfp_volume: z.string().nullable().optional(),
  rfp_volume_period: z.string().nullable().optional(),
  rfp_outcomes: z.array(z.string()).optional(),
  rfp_go_no_go_process: z.string().nullable().optional(),
  rfp_document_readiness: z.string().nullable().optional(),
  // #2057 — contenu.
  content_active_profile: z.array(z.string()).optional(),
  content_audience_size: z.string().nullable().optional(),
  content_visible_expertise: z.array(z.string()).optional(),
  content_reactions: z.string().nullable().optional(),
  content_conversations_generated: z.string().nullable().optional(),
  content_funnel_stages_reached: z.array(z.string()).optional(),
  // #2032.10 — les fonctions réellement exercées, suivi de `user_role`.
  role_functions_practiced: z.array(z.string()).optional(),
  // #2036.9 — l'ambition territoriale déclarée, distincte de `geo_zones`
  // (Temps 1) : ne jamais fusionner les deux (#2036.10, garde GA-338).
  growth_target_zones: z.array(z.string()).optional(),
  // #2015.7 — la filiation déclarée : un groupe, une filiale, ou indépendante.
  // `establishment_count` (prefill Pappers) ne le dit pas — un nombre
  // d'établissements ne dit pas qui détient qui.
  company_group_structure: z.string().nullable().optional(),
  // #2056.11 — l'économie du dossier : un MONTANT nommé, jamais un taux.
  rfp_deal_value: z.string().nullable().optional(),
  // #2057.10 — l'owner : existe-t-il un porteur nommé sur chaque dossier ?
  rfp_owner_assignment: z.string().nullable().optional(),
  // #2053.3 — le coût d'intercontrat, DISTINCT de `available_consultants_band`
  // (un effectif, pas un coût — voir le commentaire de ce champ dans
  // `answers-maturite-effectif.ts`). Un MONTANT mensuel, jamais un pourcentage :
  // un pourcentage exigerait un dénominateur (coût du banc) qu'on n'a pas —
  // exactement l'extrapolation que #2053.8 interdit.
  intercontrat_cost: z.string().nullable().optional(),
  // #2053.4 — la visibilité DÉCLARÉE sur le délai d'encaissement : le suit-il
  // aujourd'hui, et où ? Nomme l'écran existant (`/missions/encaissements`,
  // `modules/factoring`) plutôt que d'en rouvrir un second (GA-26).
  payment_delay_visibility: z.string().nullable().optional(),
  // #2053.4 — le délai d'encaissement moyen DÉCLARÉ, en bande. Posée
  // uniquement quand `payment_delay_visibility` dit qu'il est suivi quelque
  // part (`tracksPaymentDelay`, `profile-questionnaire.ts`) : forcer une
  // bande chiffrée à qui vient de dire « je ne le suis pas » ou « je ne sais
  // pas » fabriquerait une fausse précision (#2027, #2053.8).
  payment_delay_band: z.string().nullable().optional(),
  // #2067.2 — décision Louis du 18/09/2026 : avec combien de partenaires (ESN,
  // cabinets, rangs 1) la personne travaille RÉELLEMENT aujourd'hui, réguliers
  // puis ponctuels. Posées uniquement derrière une porte partenaire
  // (`worksThroughPartners`, `profile-questionnaire.ts`) ; `partner_relationship`
  // plus haut dit la NATURE de la relation, jamais un nombre. Ajoutées EN FIN.
  partners_regular_count: z.string().nullable().optional(),
  partners_occasional_count: z.string().nullable().optional(),
  // #2058.2 / #2058.10 — les DEUX derniers points qui tenaient #2058 ouverte :
  // les moments acceptés pour solliciter la personne (plages horaires, jours,
  // moments à éviter), et le niveau de détail attendu de ses réponses (court
  // et dense, ou développé). Une préférence DÉCLARÉE, jamais une règle
  // d'envoi — le copilote prépare, il ne programme rien. Ajoutées EN FIN.
  contact_windows: z.array(z.string()).optional(),
  detail_level: z.string().nullable().optional(),
}
