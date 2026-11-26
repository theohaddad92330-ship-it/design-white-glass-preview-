import type { ClientHealth } from '../admin/client-health'

/**
 * Ce que le module FOURNIT à ses services, sous forme de jetons — même
 * discipline que `business-metrics/module-tokens.ts` (#1645), pour la MÊME
 * raison : GA-07 (`module-boundaries.spec.ts`) est un cliquet AU PLAFOND
 * (253/254 imports, 124/124 fichiers au 09/09/2026). Le passage des 5 minutes
 * n'a pas besoin du service de sécurité ni du service de verrous, il a besoin
 * de « donne-moi les anomalies » et « exécute ceci une seule fois » — la
 * composition se fait dans `backoffice-alerts.module.ts` (hors périmètre de
 * GA-07), et `backoffice-alerts.service.ts` ne connaît que la FORME de ce
 * qu'il reçoit.
 */

/** Le jeton de la lecture de sécurité (#1671.3). */
export const SECURITY_JOURNAL = 'BACKOFFICE_ALERTS_SECURITY_JOURNAL'

type SecurityAnomaly = { type: string; actorEmail: string; detail: string }

/** Ce que `BackofficeAccessJournalService#etatSecurite` rend, réduit à ce dont
 *  ce module a besoin — pas la forme complète de `EtatSecurite`. */
export type SecurityJournalReader = (fenetreJours: number) => Promise<{ anomalies: readonly SecurityAnomaly[] }>

/**
 * #1946.22 — le jeton de la santé des espaces clients (décision Louis 13/09,
 * batch 12). La dérivation vit dans `AdminClientHealthService` (#1652) et ne
 * se recopie pas ici (GA-26) ; ce service ne connaît que la FORME de ce qu'il
 * reçoit, la composition vit dans `backoffice-alerts.module.ts` (GA-07).
 */
export const CLIENT_HEALTH_READER = 'BACKOFFICE_ALERTS_CLIENT_HEALTH_READER'

/** Une ligne par espace : son identifiant, son nom, sa santé — rien d'autre n'est lu. */
export type ClientHealthReader = (
  now: Date,
) => Promise<{ rows: readonly { workspaceId: string; name: string; health: ClientHealth }[] }>

/** Le jeton du verrou. Voir le docblock de tête. */
export const SINGLETON_LOCK = 'BACKOFFICE_ALERTS_SINGLETON_LOCK'

/**
 * « Exécute ceci une seule fois, quel que soit le nombre de répliques. »
 *
 * Sans verrou disponible (pas de `REDIS_URL`), l'implémentation fournie
 * exécute quand même : c'est le comportement du dépôt en développement, et
 * `dispatch()` reste de toute façon dédupliqué par sujet sur 1 h.
 */
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
