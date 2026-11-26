import type { SimilarityHeadline } from '@bellum/contracts'

/**
 * #1576 / #1632 — CE QUE LA CARTE ÉCRIT, ET UNE SEULE CHOSE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE ÇA CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les trois cartes portaient la MÊME phrase — « Proposé à partir du secteur de
 * tes comptes récents ». Deux causes, mesurées en production le 08/09/2026 : les
 * quatre suggestions venaient du même compte d'amorce (corrigé côté serveur), et
 * le profil vendeur était vide, si bien qu'aucun des trois critères ne pouvait
 * matcher et que la carte retombait sur l'aveu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ORDRE, ET POURQUOI IL EST CELUI-LÀ
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. `twin`     — une mission a été SIGNÉE sur le compte nommé. La plus forte :
 *                  elle ne dit pas « ça te ressemble », elle dit « tu as déjà
 *                  vendu là ».
 *  2. `tech`     — au moins trois technologies communes discriminantes, observées
 *                  des deux côtés.
 *  3. `criteria` — le profil vendeur est recoupé : le comportement d'AVANT ce
 *                  lot, inchangé. Plus fort qu'une provenance, parce qu'il parle
 *                  de ce que CE vendeur cherche.
 *  4. `sector`   — la PROVENANCE, nommée : cette suggestion a été découverte à
 *                  partir du secteur registre de ce compte-là.
 *  5. `seed`     — l'aveu d'origine, INCHANGÉ. Il ne reste atteignable que pour
 *                  une réponse d'API antérieure au champ (arbitrage de Louis du
 *                  08/09/2026 : « la raison NOMME toujours le compte de
 *                  référence » l'emporte sur « l'aveu n'est pas modifié », parce
 *                  que la provenance est aussi VRAIE que l'aveu et plus utile).
 *
 * ⚠️ Une seule raison est rendue. Quand une raison NOMME un compte, la ligne des
 * critères du profil (`describeSimilarReasons`) ne s'affiche pas : « une seule
 * raison principale par suggestion » (#1632).
 */
export type SimilarHeadlineDisplay =
  | { kind: 'twin'; account: string }
  | { kind: 'tech'; account: string; technologies: string[] }
  | { kind: 'criteria' }
  | { kind: 'sector'; account: string }
  | { kind: 'seed' }

/**
 * @param headline      ce que le serveur a pu prouver (absent d'une API antérieure)
 * @param profileMatched au moins un critère du profil vendeur a matché
 */
export function describeSimilarHeadline(
  headline: SimilarityHeadline | undefined,
  profileMatched: boolean,
): SimilarHeadlineDisplay {
  const account = headline?.referenceAccount?.trim()

  if (account && headline?.kind === 'twin') return { kind: 'twin', account }
  if (account && headline?.kind === 'tech' && (headline.technologies?.length ?? 0) > 0) {
    return { kind: 'tech', account, technologies: [...headline.technologies!] }
  }
  if (profileMatched) return { kind: 'criteria' }
  if (account && headline?.kind === 'sector') return { kind: 'sector', account }
  return { kind: 'seed' }
}

/** Les raisons qui NOMMENT un compte : elles remplacent la ligne des critères,
 *  elles ne s'y ajoutent pas. */
export function headlineNamesAnAccount(display: SimilarHeadlineDisplay): boolean {
  return display.kind === 'twin' || display.kind === 'tech' || display.kind === 'sector'
}
