'use client'

import Script from 'next/script'

/**
 * Mesure d'audience du site — Plausible.
 *
 * DEUX conditions, et il faut les DEUX : sa variable d'environnement
 * (`NEXT_PUBLIC_PLAUSIBLE_DOMAIN`) **et** le consentement du visiteur. Le
 * consentement est porté par `<AnalyticsConsentGate>` dans le layout : ce
 * composant ne se monte pas tant que la réponse n'est pas « oui ».
 *
 * ⚠️ L'ancienne version de ce commentaire disait « sans cookie ni donnée
 * personnelle, donc pas de bandeau de consentement à poser ». La bannière
 * existait pourtant déjà, et la page `/cookies` promettait le contraire mot pour
 * mot. Arbitrage de Louis du 28/08/2026 : le consentement commande, et cette
 * question-là ne se re-litige pas depuis un commentaire de code.
 *
 * `'use client'` : le consentement vit dans le navigateur du visiteur. Rendu
 * côté serveur, ce script partirait dans le HTML avant que la question soit
 * posée. `NEXT_PUBLIC_*` est inliné au build, donc lisible ici sans perte.
 *
 * Sans domaine configuré : NO-OP STRICT — aucun script, aucune requête. Le site
 * se comporte exactement comme avant.
 *
 * `NEXT_PUBLIC_PLAUSIBLE_SRC` pointe une instance auto-hébergée si besoin ; le
 * défaut est le script officiel, avec le suivi des **liens sortants** — c'est
 * lui qui compte les départs vers l'app et vers le lien de démonstration.
 */
const DEFAULT_SRC = 'https://plausible.io/js/script.outbound-links.js'

export function PlausibleScript() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN?.trim()
  if (!domain) return null

  return <Script defer data-domain={domain} src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC ?? DEFAULT_SRC} />
}
