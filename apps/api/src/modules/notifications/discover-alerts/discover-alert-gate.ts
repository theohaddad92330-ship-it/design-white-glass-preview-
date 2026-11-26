/**
 * LES DEUX VERROUS D'OPÉRATEUR DES ALERTES DE DÉCOUVRIR — 15/09/2026,
 * décision 7 de Louis.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `DISCOVER_ALERT_DISPATCH_ENABLED` — L'INTERRUPTEUR, ÉTEINT PAR DÉFAUT
 * ─────────────────────────────────────────────────────────────────────────────
 * L'envoi sortant est un arrêt de ce dépôt ; la décision du 15/09 l'ouvre pour
 * les canaux d'alerte de Découvrir, et pour eux seuls. Mais la base légale du
 * consentement de ses destinataires n'est pas encore posée (c'est l'une des
 * pièces juridiques en cours). Le code est donc là, branché et testé, et **rien
 * ne tourne tant qu'un humain n'a pas posé la variable**.
 *
 * Absente, ou différente de `true` / `1`, elle vaut ÉTEINT — et « éteint »
 * signifie ici zéro lecture de base, zéro appel réseau, chemin identique à
 * celui d'avant ce lot. Même forme que `VITE_PRODUCT_TRACKER_ENABLED`, l'autre
 * interrupteur du dépôt qui commande une décision d'opérateur plutôt qu'une
 * capacité technique. L'inverse — `*_DISABLED`, allumé par défaut — aurait été
 * le mauvais sens : un kill-switch protège d'une capacité qui déraille, un
 * interrupteur comme celui-ci attend une décision qui n'est pas prise.
 *
 * ⚠️ Elle s'allume sur `true` ou `1`, et sur RIEN d'autre. Une variable qui
 * s'allume sur « toute valeur non vide » s'allume par accident — un
 * `...=false` littéral suffirait à ouvrir l'envoi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 2. `DISCOVER_ALERT_RECIPIENT_ALLOWLIST` — LA LISTE BORNÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il doit être impossible qu'un essai parte à tout le monde. Hors production,
 * une liste ABSENTE n'est pas « aucune restriction » : c'est « on ne sait pas à
 * qui on a le droit d'écrire », donc **personne**. C'est le refus par défaut.
 *
 * En production, la liste est facultative : le verrou y est l'interrupteur, posé
 * par l'opérateur en connaissance de cause. Posée quand même, elle borne aussi.
 *
 * Les entrées sont des adresses e-mail ou des numéros au format international,
 * séparés par des virgules ou des retours à la ligne. La comparaison ignore la
 * casse et l'espacement — un espace n'est pas une décision, et refuser
 * quelqu'un qui EST sur la liste à cause de sa mise en forme rendrait la liste
 * inutilisable, donc contournée.
 */

/** Le jeton d'injection des deux verrous. */
export const DISCOVER_ALERT_GATE = Symbol('DISCOVER_ALERT_GATE')

/** Ce que le reste du module a le droit de demander à ces deux verrous. */
export type DiscoverAlertGate = {
  /** L'opérateur a-t-il posé l'interrupteur ? `false` = rien ne tourne. */
  readonly enabled: boolean
  /** Ce destinataire a-t-il le droit de recevoir, dans CET environnement ? */
  allows(recipient: string): boolean
}

/** Les deux seules valeurs qui allument. */
const TRUTHY = new Set(['true', '1'])

/**
 * L'environnement, tel que les trois services le nomment déjà
 * (`SENTRY_ENVIRONMENT`, avec `NODE_ENV` en repli — même ordre que
 * `health.controller.ts` et `provider-cost.service.ts`). Inconnu = PAS
 * production : la prudence va du côté qui n'envoie pas.
 */
function isProduction(env: Record<string, string | undefined>): boolean {
  const value = (env['SENTRY_ENVIRONMENT'] ?? env['NODE_ENV'] ?? '').trim().toLowerCase()
  return value === 'production'
}

/**
 * La forme comparable d'un destinataire : minuscules, et tout ce qui n'est
 * qu'une mise en forme retiré (espaces, points de séparation, parenthèses,
 * tirets). `+33 6 12 34 56 78` et `+33612345678` sont la même personne ; une
 * liste qui ne le sait pas refuse celui qui y est inscrit.
 *
 * ⚠️ Le point n'est PAS retiré des adresses : `a.b@x.fr` et `ab@x.fr` sont deux
 * adresses distinctes pour la plupart des serveurs. Le nettoyage des séparateurs
 * ne s'applique donc qu'à ce qui ne contient pas d'arobase.
 */
function comparable(raw: string): string {
  const value = raw.trim().toLowerCase()
  if (value.includes('@')) return value.replace(/\s+/g, '')
  return value.replace(/[\s().-]/g, '')
}

function parseAllowlist(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? '')
      .split(/[,\n]/)
      .map(entry => comparable(entry))
      .filter(entry => entry.length > 0),
  )
}

export function createDiscoverAlertGate(env: Record<string, string | undefined>): DiscoverAlertGate {
  const enabled = TRUTHY.has((env['DISCOVER_ALERT_DISPATCH_ENABLED'] ?? '').trim().toLowerCase())
  const allowlist = parseAllowlist(env['DISCOVER_ALERT_RECIPIENT_ALLOWLIST'])
  const production = isProduction(env)

  return {
    enabled,
    allows(recipient: string): boolean {
      const value = comparable(recipient ?? '')
      // Un destinataire vide n'est pas un destinataire : il n'y a personne à
      // autoriser, et le laisser passer ferait tenter un envoi sans adresse.
      if (value.length === 0) return false
      if (allowlist.size > 0) return allowlist.has(value)
      return production
    },
  }
}
