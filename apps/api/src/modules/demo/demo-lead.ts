import { emailDomain, isPublicEmailDomain } from '../activities/activity-linking'

/**
 * #2705 — le prospect capté par le formulaire obligatoire du lien de démo
 * (Théo, 22/09/2026). PUR, séparé de l'entité et du service : c'est ici que
 * les vrais défauts se trouvent (une adresse personnelle qui passerait, un
 * doublon mal normalisé), pas dans TypeORM.
 *
 * ⚠️ GA-26 — la liste des domaines personnels EXISTE déjà
 * (`activity-linking.ts:34`, `PUBLIC_EMAIL_DOMAINS`) et sert déjà à ne pas
 * rattacher une activité par un domaine grand public. On la RÉUTILISE ici
 * plutôt que d'en écrire une seconde qui divergerait en trois semaines.
 */

/** La liste fermée « Fonction », mot pour mot (issue #2705). */
export const DEMO_LEAD_JOB_TITLES = [
  'business_developer',
  'manager',
  'agency_director',
  'sales_director',
  'esn_founder',
  'freelance',
  'other',
] as const

export type DemoLeadJobTitle = (typeof DEMO_LEAD_JOB_TITLES)[number]

/** trim + minuscules — la clé de dédoublonnage (« une ligne par e-mail normalisé »). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Une adresse professionnelle : lisible ET dont le domaine n'est pas dans la
 * liste fermée des domaines grand public. Utilisée CÔTÉ SERVEUR — la seule
 * validation qui compte, une validation d'interface seule se contourne depuis
 * la console en trois secondes (issue #2705).
 */
export function isProfessionalEmail(email: string): boolean {
  const domain = emailDomain(normalizeEmail(email))
  if (!domain) return false
  return !isPublicEmailDomain(domain)
}
