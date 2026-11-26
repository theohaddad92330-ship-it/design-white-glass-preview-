import { declaredSignalFreshness, type DeclaredSignal, type RecentSignal } from '@bellum/contracts'

/**
 * #2634.1 — LinkedIn comme source de signaux d'achat, UNIQUEMENT par une voie
 * autorisée (saisie manuelle, import d'un export déjà possédé par le client,
 * ou un futur connecteur officiel) — jamais un scraping.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA GREFFE SE JOUE À LA LECTURE, JAMAIS EN BASE
 * ─────────────────────────────────────────────────────────────────────────────
 * `accounts.recent_signals` (et `raw_analysis.recent_signals`) sont réécrits
 * INTÉGRALEMENT par le pipeline IA à chaque analyse (voir
 * `signal-history.service.ts`). Y écrire un signal déclaré le condamnerait à
 * disparaître à la prochaine ré-analyse — l'inverse de « on archive, on ne
 * supprime pas ». `accounts.declared_signals` est donc une colonne SÉPARÉE que
 * l'IA ne touche jamais, et ces fonctions PURES la greffent sur la liste
 * détectée à chaque lecture (`AccountsService.findOneForWorkspace`) : toujours
 * à jour, sans jamais dépendre d'un « regreffe après un run » (contrairement à
 * `applyDeclaredPeople`/#1103, qui doit persister DANS le graphe parce que
 * l'organigramme est consommé par une logique de graphe bien plus riche
 * qu'une simple liste).
 */

/**
 * Un signal déclaré prend la forme `RecentSignal` que l'écran sait déjà lire
 * (`BuyingSignals.tsx`, `AccountPdfDocument.tsx`, `accountProvenance.ts`) — le
 * web n'a besoin d'apprendre aucune deuxième forme de signal.
 */
export function toRecentSignal(declared: DeclaredSignal): RecentSignal {
  return {
    id: `declared-${declared.id}`,
    signal: declared.label,
    source: declared.source,
    source_ref: null,
    type: declared.signalType ?? null,
    // La date du DOCUMENT (import) prime sur la date de signal libre — jamais
    // la date du geste de déclaration, qui rajeunirait un export ancien.
    date: declared.documentDate ?? declared.signalDate ?? null,
    sales_implication: null,
    // #3682.6 — la fraîcheur vient de la DATE du fait, jamais du geste de déclaration :
    // un export de 2023 importé en 2026 reste une archive.
    freshness: declaredSignalFreshness(declared.documentDate ?? declared.signalDate ?? null),
    tags: [],
    entry_kind: declared.entryKind,
    declared_at: declared.declaredAt,
    declared_by_name: declared.declaredByName,
    document_date: declared.documentDate ?? null,
  }
}

/**
 * Greffe les signaux DÉCLARÉS en tête de la liste détectée par l'IA.
 *
 * En TÊTE, toujours : un fait qu'un commercial a vu de ses yeux (ou importé
 * depuis un export qu'il possède) prime sur ce que le pipeline a détecté —
 * « une correction humaine gagne toujours ». Aucun signal déclaré = la liste
 * détectée, inchangée, à l'octet près (comportement d'avant ce lot).
 */
export function graftDeclaredSignals(
  recentSignals: readonly RecentSignal[],
  declaredSignals: readonly DeclaredSignal[],
): RecentSignal[] {
  if (declaredSignals.length === 0) return [...recentSignals]
  return [...declaredSignals.map(toRecentSignal), ...recentSignals]
}
