/**
 * Un échec d'envoi est-il un ÉCHEC, ou un « je ne sais pas » ?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT QUE CE FICHIER RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le contrat du routeur d'actions déclare `unknown` depuis le premier jour, avec
 * sa justification écrite : « replier un timeout dans `failed` rejouerait une
 * action peut-être déjà faite (double envoi) ; le replier dans `done`
 * annoncerait un succès que personne n'a observé. »
 *
 * Le code faisait exactement ce que le commentaire interdit : `dispatchOne`
 * attrapait TOUTE exception — timeout compris — et rendait `failed`. Aucun
 * `unknown` n'était produit nulle part en production ; le seul qui existait
 * venait d'un mock de test. L'invariant n°6 était déclaré et jamais atteint.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA SEULE QUESTION QUI COMPTE : LA REQUÊTE A-T-ELLE PU PARTIR ?
 * ─────────────────────────────────────────────────────────────────────────────
 * · La connexion n'a jamais été établie (DNS introuvable, port fermé,
 *   certificat refusé) → **rien n'est parti**, c'est un `failed`. On peut
 *   rejouer sans risque.
 * · Le distant a RÉPONDU, fût-ce pour refuser (4xx, 5xx applicatif) → il a
 *   traité la demande, c'est un `failed`.
 * · La requête est partie et la réponse n'est pas revenue (timeout, socket
 *   coupé en vol, abandon) → **on ne sait pas**. C'est le seul cas `unknown`,
 *   et rejouer y est le geste dangereux.
 *
 * Pure et sans dépendance : le calcul qui décide s'il faut rejouer un envoi ne
 * doit pas exiger une base pour être testé.
 */

/** Ce qui indique qu'une requête est PARTIE sans qu'on sache ce qu'elle est devenue. */
const IN_FLIGHT_MARKERS = [
  // Les noms d'erreur du runtime.
  'aborterror',
  'timeouterror',
  // Les codes système : la connexion existait, elle a été coupée en vol.
  'etimedout',
  'econnreset',
  'econnaborted',
  'epipe',
  'socket hang up',
  // Les codes undici (le client HTTP de Node) — tous postérieurs à l'envoi.
  'und_err_headers_timeout',
  'und_err_body_timeout',
  // Le vocabulaire courant, quand l'erreur ne porte qu'un message.
  'timed out',
  'timeout',
] as const

/**
 * Ce qui prouve que RIEN n'est parti. Vérifié en premier, parce que certains de
 * ces messages contiennent aussi le mot « timeout » (`UND_ERR_CONNECT_TIMEOUT`
 * est un délai d'ÉTABLISSEMENT : la connexion n'a jamais abouti, donc aucune
 * requête n'a pu être appliquée par le distant).
 */
const NEVER_LEFT_MARKERS = [
  'econnrefused',
  'enotfound',
  'eai_again',
  'und_err_connect_timeout',
  'certificate',
  'cert_',
  'self signed',
  'unable to verify',
] as const

/**
 * Les deux issues, sous forme de liste.
 *
 * Elles voyagent jusqu'en base — `import_sessions.resume_outcome` les porte
 * depuis le 29/08/2026, parce qu'une reprise d'import doit savoir si la ligne
 * sur laquelle elle s'est arrêtée est rejouable. Une contrainte `CHECK` se
 * garde contre une ÉNUMÉRATION (GA-12), pas contre un type union : la liste
 * vit donc ici, à côté du calcul qui la produit, et le type en est dérivé —
 * deux endroits qui la déclareraient divergeraient au premier ajout.
 */
export const DISPATCH_FAILURE_OUTCOMES = ['failed', 'unknown'] as const
export type DispatchFailureOutcome = (typeof DISPATCH_FAILURE_OUTCOMES)[number]

/**
 * `unknown` quand la requête est partie sans réponse, `failed` sinon.
 *
 * Prend l'erreur telle qu'elle arrive dans un `catch` : une `Error`, un objet
 * portant `code`/`name`, ou n'importe quoi d'autre. Ce qu'on ne reconnaît pas
 * vaut `failed` — le défaut prudent est celui qui autorise un rejeu, parce que
 * classer trop largement en `unknown` bloquerait des reprises légitimes et
 * laisserait des actions en suspens pour toujours.
 */
export function dispatchFailureOutcome(error: unknown): DispatchFailureOutcome {
  const haystack = [
    (error as { name?: unknown })?.name,
    (error as { code?: unknown })?.code,
    (error as { message?: unknown })?.message,
    (error as { cause?: { code?: unknown } })?.cause?.code,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase()

  if (haystack.length === 0) return 'failed'
  if (NEVER_LEFT_MARKERS.some(marker => haystack.includes(marker))) return 'failed'
  return IN_FLIGHT_MARKERS.some(marker => haystack.includes(marker)) ? 'unknown' : 'failed'
}
