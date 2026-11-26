import {
  DISCOVER_QUICK_PASS_MAX_ACCOUNTS,
  buildDiscoverQuickPassEntry,
  type DiscoverQuickPassEntry,
  type DiscoverQuickPassResult,
} from '@bellum/contracts'
import { discoverAccessLevel } from './discover-access-level'
import type { DiscoverCandidate } from './discover-types'

/**
 * #2630.1 — LA PASSE RAPIDE, côté écran : ce qui transforme vingt candidats
 * déjà à l'écran en vingt verdicts, SANS un seul appel réseau.
 *
 * La décision de Louis dit « rapide ». Une passe qui relancerait une collecte
 * par compte mettrait des minutes et coûterait des crédits ; celle-ci relit ce
 * que la recherche a déjà ramené et se calcule pendant le rendu. C'est aussi ce
 * qui la rend HONNÊTE : elle ne peut rien inventer, puisqu'elle n'appelle rien.
 *
 * Tout le jugement vit dans le contrat partagé
 * (`packages/contracts/src/schemas/discover-quick-pass.ts`) — ce fichier ne fait
 * que TRADUIRE un `DiscoverCandidate` en entrée de ce contrat. Deux règles y
 * sont recopiables à l'infini si on les laisse ici, et c'est pourquoi elles n'y
 * sont pas : le seuil qui choisit un mot, et l'ordre qui tranche le verdict.
 */

/**
 * #3597.3 — LE VERDICT D'UN COMPTE, pour le badge de sa ligne (décision Louis
 * 04/10/2026 : plus de panneau séparé). Le calcul est EXACTEMENT celui de la
 * passe sur vingt comptes ci-dessous — elle appelle cette fonction, il n'y a
 * pas deux jugements (GA-26).
 */
export function discoverQuickPassEntry(candidate: DiscoverCandidate): DiscoverQuickPassEntry {
  return buildDiscoverQuickPassEntry({
    siren: candidate.siren,
    name: candidate.name,
    // Le dénominateur RÉEL du candidat, jamais 100 : c'est lui qui rend
    // « 62/70 » possible et « 88 % » impossible.
    interest: { score: candidate.score, scoreMax: candidate.scoreMax },
    // La dérivation UNIQUE du dépôt (#2646.1, GA-26) — pas une seconde ici.
    access: { level: discoverAccessLevel(candidate) },
    // ⚠️ `signalsSearched` est ce qui distingue « interrogé, rien trouvé »
    // (une mesure) de « pas interrogé » (une ignorance). Sans lui,
    // `signals: []` serait lu comme « aucun signal » — la faute exacte que
    // GA-18 / GA-19 interdisent.
    signal: { searched: candidate.signalsSearched === true, count: candidate.signals.length },
    // Clé ABSENTE = la collecte des personnes n'a pas eu lieu ; tableau VIDE
    // = elle a eu lieu et n'a nommé personne. Deux faits opposés.
    namedContact: { count: candidate.people ? candidate.people.length : null },
  })
}

/**
 * Les vingt comptes passés en revue.
 *
 * `candidates` est DÉJÀ filtrée et triée par le tri actif de l'écran : on prend
 * les vingt PREMIERS, on n'en reclasse aucun.
 */
export function discoverQuickPass(
  candidates: readonly DiscoverCandidate[],
  reviewedAt: string,
): DiscoverQuickPassResult {
  return {
    reviewedAt,
    entries: candidates.slice(0, DISCOVER_QUICK_PASS_MAX_ACCOUNTS).map(discoverQuickPassEntry),
  }
}
