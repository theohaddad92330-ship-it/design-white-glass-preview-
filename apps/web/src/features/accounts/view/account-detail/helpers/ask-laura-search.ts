import type { Account } from '@bellum/contracts'

/**
 * #2164.52 (épopée #2937) — « Demander à Laura » depuis le dossier compte doit
 * TRANSMETTRE la question initiale, jamais ouvrir une conversation nue.
 *
 * `account.user_context` PORTE déjà cette question : c'est le contexte libre
 * (ou le résumé du preset structuré) enregistré au lancement de l'analyse
 * (`AnalysisService`, `persistedContext`), et c'est exactement ce que l'écran
 * `/search` relit pour REPRÉCHARGER son propre formulaire (`Search.tsx`,
 * `toInitialContext`). Le réutiliser ici ne l'invente pas une seconde fois — un
 * seul champ, deux lecteurs.
 *
 * `?prompt=` PRÉ-REMPLIT la zone de saisie de `/chat` sans l'envoyer (voir
 * `routes/chat/index.tsx`) : le commercial relit et complète avant d'envoyer,
 * jamais un aveu envoyé pour lui.
 *
 * Un compte SANS contexte enregistré (`user_context` vide ou nul) ne pose
 * aucune question inventée : `prompt` reste absent, et Laura s'ouvre nue comme
 * avant — doctrine « jamais de donnée fictive ».
 */
export function askLauraSearch(account: Pick<Account, 'id' | 'user_context'>): { accountId: string; prompt?: string } {
  return {
    accountId: account.id,
    ...(account.user_context ? { prompt: account.user_context } : {}),
  }
}
