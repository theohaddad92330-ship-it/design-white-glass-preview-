import type { ExclusionReason, MatchNeed, MatchRun, NextBestMoveOption } from '@bellum/contracts'

/**
 * #2331.4 / #2331.5 / #2331.7 / #2178.11-.18/.20/.21/.38 — LAU-FINAL-072,
 * NO-MATCH ROOT CAUSE ET NEXT-BEST-MOVE.
 *
 * Ce module ne calcule PAS le « pourquoi zéro » en détail (les quinze causes
 * canoniques et l'analyse de sensibilité, #2331.1-.3, sont un autre lot) — il
 * porte les garde-fous que ces deux lots ferment :
 *
 * - #2331.5 / #2178.38 : les DIX arbitrages sont une liste FERMÉE
 *   ({@link NEXT_BEST_MOVE_OPTIONS} côté contrat), et le sous-ensemble proposé
 *   dépend du CONTEXTE (les motifs d'exclusion réellement rencontrés) — jamais
 *   un menu figé. #2178.38 (recette « toute cause possède un geste ») se lit
 *   sur CETTE table : chaque motif d'exclusion mappé a SON arbitrage, et les
 *   quatre de dernier recours couvrent le reste.
 * - #2331.7 (NO-GO) : sur un zéro résultat réel (aucun profil recommandé ni
 *   borderline), la fonction ne rend JAMAIS un tableau vide. `sourcer`,
 *   `recommandation`, `partenaire`, `reverse_market` et `refuser` sont les
 *   arbitrages de dernier recours — toujours disponibles, parce qu'il existe
 *   toujours une décision à prendre même quand aucun motif structuré ne
 *   pointe vers une cause précise.
 * - #2331.4 : {@link assertCriteriaUnchanged} — aucun code de ce lot ne
 *   modifie un besoin. La fonction est PURE (elle ne lit que le résultat d'un
 *   classement déjà produit), et `matching.service.ts` vérifie après coup que
 *   le besoin ressorti d'`execute()` est BYTE-IDENTIQUE à celui qui y est
 *   entré — le point où un futur arbitrage « élargir » qui écrirait le besoin
 *   en silence casserait immédiatement, avec un message qui le nomme.
 * - #2178.21 : le PREMIER élément du tableau rendu est « le bouton principal
 *   adapté à la cause réelle » — le motif le plus fréquent pousse SON
 *   arbitrage en tête (voir le tri ci-dessous), jamais un libellé générique du
 *   type « Relancer le matching ». `MatchDrawer.tsx` (web) rend ce premier
 *   élément en bouton PRIMAIRE, les suivants en secondaires.
 */

// Motifs d'exclusion qui pointent vers un arbitrage précis. `missing_required_skill`
// et `no_skills_recorded` n'ont pas de correspondance directe ici : élargir une
// compétence obligatoire est un accord produit qu'aucun code ne prend seul.
//
// #2178.14 — `contract_mismatch` a migré de `negocier` vers `elargir_contrat` :
// un désaccord de statut contractuel (CDI/freelance) ne se négocie pas comme
// un TJM, il s'élargit — deux gestes distincts pour deux motifs distincts,
// c'est justement ce que #2178.13/.14 nomment séparément.
const REASON_TO_OPTION: Partial<Record<ExclusionReason, NextBestMoveOption>> = {
  rate_out_of_range: 'negocier',
  unavailable_at_start: 'reactiver',
  out_of_zone: 'elargir',
  contract_mismatch: 'elargir_contrat',
  previously_rejected_by_client: 'clarifier',
}

// #2331.7 / #2178.16/.17/.18/.20/.23 — le dernier recours : toujours proposé
// sur un vrai zéro résultat, pour qu'un plateau ne reste jamais sans arbitrage
// nommé. `recommandation` (#2178.16) et `partenaire` (#2178.18) rejoignent
// `sourcer` (#2178.17) : aucun motif d'exclusion ne pointe vers eux avec
// certitude, ce sont des pistes toujours valables plutôt que la réponse à UNE
// cause précise. `refuser` (#2178.20) reste EN DERNIER — c'est le geste qui
// arrête le besoin, jamais celui qu'on propose en premier tant qu'un autre
// arbitrage reste possible.
const FALLBACK_OPTIONS: readonly NextBestMoveOption[] = [
  'sourcer',
  'recommandation',
  'partenaire',
  'reverse_market',
  'refuser',
]

/**
 * `null` = la question ne se pose pas (au moins un profil recommandé ou
 * borderline existe déjà). Sinon, un tableau JAMAIS vide (#2331.7) — voir le
 * docstring du module.
 */
export function nextBestMoveOptions(
  run: Pick<MatchRun, 'recommended' | 'borderline' | 'exclusionCounts' | 'notEvaluable'>,
): NextBestMoveOption[] | null {
  if (run.recommended.length > 0 || run.borderline.length > 0) return null

  const options: NextBestMoveOption[] = []
  const push = (option: NextBestMoveOption): void => {
    if (!options.includes(option)) options.push(option)
  }

  // Le motif le plus fréquent d'abord — c'est le critère le plus limitant.
  const sorted = [...run.exclusionCounts].sort((a, b) => b.count - a.count)
  for (const { reason } of sorted) {
    const option = REASON_TO_OPTION[reason]
    if (option) push(option)
  }
  if (run.notEvaluable.length > 0) push('clarifier')
  for (const option of FALLBACK_OPTIONS) push(option)

  return options
}

/**
 * #2331.4 — NO-GO : lève une erreur EXPLICITE si un critère du besoin diffère
 * entre l'entrée et la sortie d'un classement. Un seul appelant aujourd'hui
 * (`MatchingService.execute`) ; c'est aussi le garde-fou que tout futur code
 * qui modifierait un besoin pour l'arbitrage « élargir » devra traverser AVANT
 * de persister quoi que ce soit.
 */
export function assertCriteriaUnchanged(before: MatchNeed, after: MatchNeed): void {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      'un critère du besoin a été modifié sans accord client explicite (#2331.4) — ' +
        'aucun code de matching ne réécrit un besoin en silence',
    )
  }
}
