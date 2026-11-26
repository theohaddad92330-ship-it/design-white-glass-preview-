import { z } from 'zod'

/**
 * Attribution marketing — #2059 (lot L19, ferme le stage `target_market`).
 *
 * « Comment as-tu connu {{brand}} ? » — UNE colonne, ADDITIVE, nullable,
 * FACULTATIVE (`optional: true` côté `Question`, #2059.7) : ni la question ni
 * la valeur ne bloquent jamais le questionnaire.
 *
 * 🔴 DOCTRINE (#2059.8/.9/.10) — cette réponse sert **uniquement** à
 * l'attribution marketing :
 *  - elle n'influence JAMAIS le scoring ni les recommandations ;
 *  - elle n'influence JAMAIS la qualité perçue de l'utilisateur.
 * Même raison que l'interdit des critères protégés (GA-06) : un champ n'a pas
 * besoin d'être multiplié par un poids pour peser — il suffit qu'il soit dans
 * ce qui note. `esnAnswersToProfileData` (`../analysis.ts`) ne lit donc
 * JAMAIS `heard_about_bellum`, et la garde qui le prouve (sait dire NON, lit
 * le vrai fichier, n'attrape pas un champ voisin légitime) vit dans
 * `heard-about-bellum-attribution.guard.test.ts`.
 *
 * ⚠️ GA-44 — « LinkedIn Théo » et « Page BellumAI » sont des CANAUX
 * D'ACQUISITION DE BellumAI (notre propre marque), pas des noms de
 * fournisseur : légitimes ici, à la différence d'un nom d'éditeur tiers qui ne
 * doit jamais apparaître dans l'app.
 */
export const HEARD_ABOUT_BELLUM_OPTIONS = [
  'LinkedIn Théo',
  'Page BellumAI',
  'Recommandation',
  'Événement',
  'Newsletter',
  'Presse',
  'Recherche web',
  'Client ou partenaire',
  'Autre',
] as const

export const ATTRIBUTION_ANSWER_FIELDS = {
  heard_about_bellum: z.string().nullable().optional(),
}
