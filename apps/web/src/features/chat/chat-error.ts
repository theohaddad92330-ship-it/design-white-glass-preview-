import { chatQuotaRefusalSchema, type ChatQuotaLimitSource } from '@bellum/contracts'
import { ApiError, sessionIsDead } from '@/lib/api-error'
import { isNetworkFailure } from '@/lib/api-origin'

/**
 * Ce qu'on affiche dans le fil quand un tour de copilote n'aboutit pas.
 *
 * Une seule phrase — « Erreur de connexion au service IA » — couvrait TOUS les
 * échecs, y compris ceux que le serveur avait pris la peine d'expliquer. Le
 * plafond quotidien (« Plafond du copilote atteint (50 messages sur 24 h) »)
 * s'affichait donc comme une panne réseau : l'utilisateur relançait, retombait
 * sur la même phrase, et n'avait aucun moyen d'apprendre qu'il avait
 * simplement atteint sa borne.
 *
 * La règle est donc : quand le serveur DIT pourquoi il refuse (4xx), on le
 * répète tel quel ; quand il tombe (5xx, réseau coupé, réponse illisible), on
 * garde la phrase générique — « Internal server error » n'apprend rien à
 * personne et ne doit jamais atterrir dans le fil.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1770 — TROIS FAMILLES SUR QUATRE DISAIENT LA MÊME PHRASE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un client a écrit « erreur ??? », et il avait raison de mettre trois points
 * d'interrogation. Mesuré sur son rapport : une avalanche de 401 (sa session
 * était morte) puis un `POST /ia/chat` en « Failed to fetch » après 15,5 s. Les
 * deux tombaient sur « Erreur de connexion au service IA. Réessaie. » — une
 * phrase qui l'envoyait relancer un tour qui ne POUVAIT pas aboutir.
 *
 * 401/403 étaient exclus à dessein, au motif que « la session morte est traitée
 * ailleurs ». Vérifié : l'ailleurs n'affiche RIEN. `clear()` met `user` à `null`
 * et aucune route produit ne surveille cet état — l'écran reste monté, chaque
 * appel rend 401, et la seule chose que la personne lit est une panne réseau.
 * Tant que ce traitement global n'existe pas, le fil est le seul endroit où on
 * peut le lui dire, et se taire coûte plus que d'être au mauvais endroit.
 *
 * Une panne de TRANSPORT (`TypeError`) mérite sa propre phrase pour une raison
 * qui n'est pas cosmétique : la requête n'est peut-être jamais partie. Le dire
 * (« rien n'a été envoyé ») est ce qui permet de réessayer sans crainte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `quotaNote` — CE QUE LE PLAFOND COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré avant d'être supposé : **aucun écran n'affiche « il te reste N
 * messages »**. Ce refus est donc le seul endroit du produit où la personne
 * apprend qu'une borne existe — et depuis le 30/08/2026, la borne ne compte
 * plus la même chose : répondre à une question de précision de Laura ne
 * consomme rien. Une règle qu'on applique sans la dire rend le plafond magique.
 *
 * Elle est passée par l'appelant plutôt qu'écrite dans le message du serveur
 * parce que l'API n'a pas de langue : ses refus sont en français, alors que
 * l'interface est FR **et** EN. Le chiffre reste au serveur (lui seul connaît
 * le plafond configuré), la règle vit dans les traductions.
 */
export type ChatErrorTexts = {
  /** Ce qu'on dit quand on ne sait pas — jamais le message brut du serveur. */
  fallback: string
  /** La connexion a lâché : la requête n'est peut-être jamais partie. */
  networkLost: string
  /** La session est morte : relancer le tour ne peut pas aboutir. */
  sessionExpired: string
  /** Ce que le plafond compte — passé par l'appelant, l'API n'a pas de langue. */
  quotaNote?: string
  /**
   * #1957.8 → .10 — le refus AU PLAFOND, dit par l'appelant.
   *
   * Le serveur rend le plafond et l'INSTANT de réouverture (`chatQuotaRefusalSchema`) ;
   * seule la surface connaît la langue et le fuseau de l'écran, et sait si elle
   * rend un lien. Absent, ou corps sans le code du plafond (autre 429, API
   * d'avant) : la phrase du serveur, comme avant.
   *
   * `limitSource` (décision Louis 13/09 batch 13 — plafond selon le plan) : le
   * plan ou le plafond de sécurité de l'opérateur ; absent sur une API d'avant.
   */
  quotaReached?: (refusal: { limit: number; reopensAt: Date | null; limitSource?: ChatQuotaLimitSource }) => string
  /**
   * #1960.13 — LE MESSAGE D'UN INCIDENT DÉCLARÉ PAR UN OPÉRATEUR, ou rien.
   *
   * Décision de Louis du 16/09/2026 : « incident connu » n'apparaît que si
   * quelqu'un a posé le drapeau (une bannière `kind: 'incident'`,
   * `declaredIncidentMessage`). Rien ici ne le déduit d'un code d'erreur — et
   * ça se voit dans la SIGNATURE : c'est une chaîne que l'appelant apporte, pas
   * un calcul fait sur `error`.
   *
   * Absent (le cas normal, et le seul tant qu'aucun opérateur n'a rien
   * déclaré) : chaque refus reste ce qu'il était, à l'octet près.
   */
  knownIncident?: string
}

export function chatErrorMessage(error: unknown, texts: ChatErrorTexts): string {
  /**
   * #1960.13 — l'incident DÉCLARÉ ne décore que les refus qui disent « ça a
   * cassé chez nous » : le repli générique, le 5xx, la connexion perdue.
   *
   * Il ne décore NI le plafond de messages NI la session morte, et ce n'est pas
   * un détail : ces deux-là sont un produit qui fonctionne et qui refuse
   * correctement. Leur coller « incident connu » ferait attendre un
   * rétablissement qui ne viendra pas, et ferait taire quelqu'un qui aurait dû
   * nous écrire.
   */
  const incident = texts.knownIncident?.trim()
  const withIncident = (text: string): string => (incident ? `${incident} ${text}` : text)

  // L'ordre compte, et c'est le seul endroit où il compte. Une panne de
  // transport n'est pas une `ApiError` : testée en second, elle serait retombée
  // sur le repli générique, exactement comme avant.
  if (isNetworkFailure(error)) return withIncident(texts.networkLost)
  if (!(error instanceof ApiError)) return withIncident(texts.fallback)
  if (sessionIsDead(error.status)) return texts.sessionExpired
  if (error.status < 400 || error.status >= 500) return withIncident(texts.fallback)
  const note = texts.quotaNote?.trim()
  const quotaText = error.status === 429 ? quotaReachedText(error.details, texts) : null
  if (quotaText) return note ? `${quotaText} ${note}` : quotaText
  const message = error.message.trim()
  if (message.length === 0) return withIncident(texts.fallback)
  return error.status === 429 && note ? `${message} ${note}` : message
}

/**
 * #2519 — CET ÉCHEC PEUT-IL SE RELANCER D'UN CLIC ?
 *
 * « Quand Laura affiche une erreur de connexion, il faut un bouton pour la
 * relancer. » Le bouton ne s'offre que là où relancer PEUT aboutir :
 *  - une panne de transport, un flux coupé avant sa fin (statut 0), une panne
 *    serveur (5xx — dont les 502/503/504 d'un redéploiement) : oui ;
 *  - une session morte (401/403) : non — relancer rendrait la même 401 ;
 *  - un refus que le serveur a EXPLIQUÉ (4xx, dont le plafond quotidien) : non —
 *    le même clic rendrait le même refus, et un plafond ne se creuse pas en
 *    insistant ;
 *  - un arrêt volontaire (« Arrêter ») : non, ce n'est pas un échec.
 *
 * La même partition que `chatErrorMessage` ci-dessus — la phrase et le bouton
 * ne peuvent pas se contredire.
 */
export function chatFailureIsRetryable(error: unknown): boolean {
  // `DOMException` n'hérite pas d'`Error` partout (jsdom) : on lit le NOM.
  if (typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError') return false
  if (isNetworkFailure(error)) return true
  if (!(error instanceof ApiError)) return true
  if (sessionIsDead(error.status)) return false
  return error.status < 400 || error.status >= 500
}

/** Le texte de l'appelant quand le corps est bien un refus AU PLAFOND — sinon `null`. */
function quotaReachedText(details: unknown, texts: ChatErrorTexts): string | null {
  if (!texts.quotaReached) return null
  const parsed = chatQuotaRefusalSchema.safeParse(details)
  if (!parsed.success) return null
  return texts.quotaReached({
    limit: parsed.data.limit,
    // `null` reste `null` : l'appelant dit « au fil des heures », jamais une heure devinée.
    reopensAt: parsed.data.reopensAt ? new Date(parsed.data.reopensAt) : null,
    ...(parsed.data.limitSource ? { limitSource: parsed.data.limitSource } : {}),
  })
}
