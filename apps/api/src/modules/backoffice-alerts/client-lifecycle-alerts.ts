/**
 * #1676.1 — les faits PURS de « nouveau_client » et « churn_client », décidés
 * par Louis le 10/09/2026. Jusque-là, le docblock de tête de
 * `backoffice-alerts.service.ts` disait « décision produit non tranchée […]
 * ne pas les coder sans cette décision », et GA-274
 * (`backoffice-alert-triggers-are-wired.spec.ts`) vérifiait que les deux
 * n'avaient AUCUN appelant nulle part. Ce fichier est la décision, en code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION, LITTÉRALEMENT (le fait CONTRACTUEL, pas le fait d'usage)
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `nouveau_client` : le PREMIER PAIEMENT ENCAISSÉ — pas la première analyse
 *    lancée, pas un geste produit.
 *  - `churn_client` : l'ANNULATION d'un abonnement Stripe, OU un ENGAGEMENT
 *    ÉCHU NON RENOUVELÉ pour un client sur facture.
 *
 * La variante « usage » (première analyse / décrochage après N jours sans
 * session) a été explicitement écartée par Louis : elle alerterait plus tôt,
 * mais suppose un seuil de jours choisi au doigt mouillé, et le traceur
 * produit (`VITE_PRODUCT_TRACKER_ENABLED`) reste ÉTEINT — la relecture RGPD de
 * `c64_analytique_produit` est en attente, il n'y a donc rien à lire. Assumé,
 * pas compensé en douce : un espace qui décroche en silence pendant trois mois
 * n'alertera que le jour où il PART (annulation) ou où son engagement expire
 * sans renouvellement — jamais avant.
 *
 * ⚠️ LEVÉ LE 13/09/2026, POUR UN SEUL USAGE — #1946.22, décision Louis batch 12,
 * prise CONTRE la recommandation, relecture juridique RGPD toujours due. Le
 * refus ci-dessus tient pour `nouveau_client` et `churn_client`, qui restent des
 * faits CONTRACTUELS. Il est levé pour UNE alerte opérateur, `espace_a_risque`
 * (`workspace-risk-alert.ts`) : le score de santé MESURÉ d'un espace (#1652)
 * passé sous `CHURN_ALERT_SCORE`, une fois par semaine au plus, jamais vers le
 * client, jamais sur un score « non mesuré ». Ce score ne lit pas le traceur
 * produit : il lit des gestes validés, les connexions, les crédits, les sièges
 * et les incidents — il y a donc bien quelque chose à lire, traceur éteint ou
 * non. Aucune AUTRE alerte d'usage n'est permise : GA-266 la refuse.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES FONCTIONS PURES, DANS LEUR PROPRE FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * Même discipline qu'`operational-alerts.ts`, son voisin : le service FETCH,
 * ce fichier DÉCIDE — testable sans base, sans horloge cachée (`now` n'est lu
 * qu'à l'appel, jamais ici).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SIGNATURE D'UNE RÉSILIATION STRIPE, ET POURQUOI ELLE EST FIABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `CreditsService#handleWebhookEvent` (cas `customer.subscription.deleted`)
 * est le SEUL endroit du dépôt qui écrit
 * `{ plan: 'trial', accounts_limit: 0, enrichment_credits: 0, extra_seats: 0,
 * topup_analyses: 0 }` sur une ligne `subscriptions` — vérifié en cherchant
 * (`grep -n "plan: 'trial'"`), pas supposé. Depuis la migration `NoFreeTrial`
 * (02/09/2026), un compte tout neuf reçoit `plan: 'decouverte'`, JAMAIS
 * `'trial'` : les deux ne se confondent plus. `resetElapsedMonthlyQuotas`
 * exclut explicitement `trial` de son renouvellement mensuel — cette ligne ne
 * bouge donc plus une fois résiliée, sauf reprise d'un nouvel abonnement (qui
 * change `plan` et sort aussitôt de la signature).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE FENÊTRE ÉTROITE, ET PAS UNE RÉSOLUTION
 * ─────────────────────────────────────────────────────────────────────────────
 * `nouveau_client` et `churn_client` (branche Stripe) sont des FAITS ponctuels,
 * pas des ÉTATS : rien ne les « résout ». Sans fenêtre de fraîcheur, un fait
 * resterait détectable indéfiniment et la dé-duplication d'1 h de `dispatch()`
 * (`ANTI_REPEAT_MS`, `backoffice-alert-dispatch.ts`) le renverrait toutes les
 * heures, pour toujours. C'est la fenêtre — pas une résolution — qui fait
 * sortir le fait de la détection avant que l'anti-répétition n'autorise un
 * second envoi. Trois fois la cadence du passage de 5 minutes : de quoi
 * absorber UN passage manqué (verrou contesté, redéploiement) sans perdre le
 * fait, tout en restant largement sous l'heure de dé-duplication — c'est ce
 * qui garantit qu'un abonnement annulé puis réactivé puis réannulé LE MÊME
 * JOUR n'envoie la phrase qu'une fois (voir `backoffice-alerts.service.spec.ts`).
 *
 * L'engagement échu non renouvelé (branche facture) est, lui, un véritable
 * ÉTAT — voir `checkManualEngagementChurn` dans `backoffice-alerts.service.ts`
 * pour sa résolution.
 */
export const RECENT_FACT_WINDOW_MS = 15 * 60 * 1000

/**
 * Un `grant_plan` né d'un CHECKOUT (nouvel abonnement) plutôt que d'un
 * `subscription.updated` (changement de palier sur un abonnement DÉJÀ actif,
 * via le portail Stripe). Les deux écrivent la même `kind` de ledger, seule la
 * `reason` les distingue : voir `credits.service.ts#handleWebhookEvent`, les
 * deux littéraux `(checkout ${event.id})` / `(subscription.updated ${sub.id})`.
 * Un changement de palier n'est pas un nouveau client.
 */
export function isNewSubscriptionGrant(reason: string | null): boolean {
  if (!reason) return false
  return reason.startsWith('plan:') && reason.includes('(checkout ')
}

/** Le palier vendu, extrait de la même `reason` — jamais recalculé ailleurs. */
export function parsePlanFromCheckoutReason(reason: string | null): string | null {
  const match = reason?.match(/^plan:([a-z_]+) \(checkout /)
  return match?.[1] ?? null
}

/**
 * Les colonnes `subscriptions` dont dépend la signature de résiliation —
 * jamais l'entité TypeORM entière : ce fichier ne connaît pas la base.
 */
export interface SubscriptionChurnRow {
  billing_mode: string
  plan: string
  accounts_limit: number
  enrichment_credits: number
  extra_seats: number
  topup_analyses: number
  stripe_subscription_id: string | null
}

/** Voir « LA SIGNATURE D'UNE RÉSILIATION STRIPE » ci-dessus — EXACTEMENT cette
 *  combinaison, jamais une approximation (un `plan: 'decouverte'` à zéro est
 *  un compte tout neuf, pas une résiliation). */
export function isCancelledStripeSubscription(row: SubscriptionChurnRow): boolean {
  return (
    row.billing_mode === 'stripe' &&
    row.plan === 'trial' &&
    row.accounts_limit === 0 &&
    row.enrichment_credits === 0 &&
    row.extra_seats === 0 &&
    row.topup_analyses === 0 &&
    row.stripe_subscription_id !== null
  )
}
