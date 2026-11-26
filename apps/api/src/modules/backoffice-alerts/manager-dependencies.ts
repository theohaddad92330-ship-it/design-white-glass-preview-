/**
 * #1676.2 — les dépendances DU MANAGER (à distinguer de `/health`, qui liste
 * les onze dépendances DU PRODUIT, et de `/integrations`, qui liste les
 * connecteurs DU PRODUIT CLIENT — la distinction que l'issue demande
 * explicitement de lever dans le libellé).
 *
 * Trois des six lignes ont leur secret côté API (Stripe, Resend, le webhook
 * Slack des alertes back-office) : ce fichier + son contrôleur les servent.
 * Les trois autres (Supabase, Vercel, GitHub) se testent entièrement côté
 * `dashboard-manager` — voir `apps/dashboard-manager/src/lib/manager-
 * dependencies.ts` — parce que leurs identifiants vivent là (SUPABASE_ANON_KEY
 * de la console, variables Vercel posées par la plateforme elle-même).
 *
 * « Sain n'est jamais déclaré, il est dérivé d'un test réel » : ce module ne
 * publie qu'une PRÉSENCE de configuration (jamais une valeur — la garde
 * `aucun-secret-affiche.test.ts` le vérifie côté écran) ; l'état réel vient
 * TOUJOURS d'un appel effectivement fait, jamais d'une déduction.
 */

export type ApiManagerDependencyId = 'stripe' | 'resend' | 'slack'

export function isApiManagerDependencyId(value: string): value is ApiManagerDependencyId {
  return value === 'stripe' || value === 'resend' || value === 'slack'
}

type DependencyPresence = { id: ApiManagerDependencyId; configured: boolean }

/** Présence seulement — jamais la clé elle-même. Pur : pas de réseau ici. */
export function dependencyPresence(env: {
  stripeSecretKey?: string
  resendApiKey?: string
  slackWebhookUrl?: string
}): DependencyPresence[] {
  return [
    { id: 'stripe', configured: Boolean(env.stripeSecretKey) },
    { id: 'resend', configured: Boolean(env.resendApiKey) },
    { id: 'slack', configured: Boolean(env.slackWebhookUrl) },
  ]
}
