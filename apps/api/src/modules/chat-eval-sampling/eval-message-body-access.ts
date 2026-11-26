/**
 * #2958.98 (DEC-4036 Q5) — L'EXCEPTION NOMMÉE ET DATÉE (décision Louis 19/10/2026) à la
 * doctrine « le CORPS des messages ne sort jamais » (D65 / c39, `c97_rejeu_eval_corps_compte_louis`).
 *
 * Le rejeu d'évaluation (corpus « erreurs production anonymisées », `chat_corpus_sources.py`)
 * PEUT lire le corps des messages d'UN SEUL utilisateur : celui que l'opérateur nomme par son
 * IDENTIFIANT dans `EVAL_MESSAGE_BODY_USER_ID` (le compte de Louis Schlegel — aucun e-mail en
 * dur dans le code). C'est ce qui rend jugeable « un message préparé reste générique ».
 *
 * Tout le reste dit NON : variable absente (no-op strict), valeur qui n'est pas UN identifiant
 * (e-mail, liste, joker), tout autre utilisateur, la salle de démonstration. L'opt-in de
 * l'ESPACE (Réglages › Laura) reste exigé en amont — l'exception ne l'allume pas.
 */
export const EVAL_MESSAGE_BODY_USER_ID_ENV = 'EVAL_MESSAGE_BODY_USER_ID'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function evalMayReadMessageBody(
  userId: string,
  context: { isDemo: boolean },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (context.isDemo) return false
  const allowed = (env[EVAL_MESSAGE_BODY_USER_ID_ENV] ?? '').trim().toLowerCase()
  if (!UUID.test(allowed)) return false
  return userId.trim().toLowerCase() === allowed
}
