import { HttpException, ServiceUnavailableException } from '@nestjs/common'
import {
  connectorErrorAction,
  connectorErrorStatus,
  type ConnectorErrorBody,
  type ConnectorErrorCode,
} from '@bellum/contracts'
import { isThrottleError } from './util/concurrency'
import { looksLikeMissingScope } from './util/oauth-scopes'

/**
 * Le seul endroit du serveur où l'échec d'un connecteur prend sa forme.
 *
 * Avant ce fichier, chaque module avait la sienne : `files_scope_missing`,
 * `crm_missing_scope`, `agenda_provider_api_disabled`, `mailbox_unavailable` —
 * et Google Drive, lui, n'avait rien du tout et rendait un 500 générique. Quatre
 * vocabulaires pour une seule question, dont trois inconnus du navigateur, qui
 * ne lit que `code`.
 *
 * ⚠️ Le `message` ne nomme JAMAIS l'éditeur. C'est la règle produit du 02/08 :
 * l'application nomme la CAPACITÉ (« ton espace documentaire »), seul l'écran
 * Réglages › Intégrations nomme l'outil. Les champs `provider` et `scopes` sont
 * de la DONNÉE — l'écran des intégrations les rend, les autres écrans ne
 * rendent que `message`.
 */

/** Le fournisseur ne dit pas qu'une API est éteinte de la même façon qu'une panne.
 *  Il le dit en clair, et on le relaie plutôt que de le traduire en « erreur interne ». */
export function looksLikeDisabledProviderApi(message: string): boolean {
  return /has not been used in project|it is disabled|accessNotConfigured|SERVICE_DISABLED|API .* not enabled/i.test(
    message,
  )
}

/**
 * Le fournisseur dit-il « cette AUTORISATION n'existe plus » ? — #1836
 *
 * ⚠️ La distinction qui fait tout le travail : un jeton d'ACCÈS périmé est la
 * situation NORMALE — il se renouvelle tout seul soixante fois par jour, et
 * l'annoncer « reconnecte » enverrait réparer une liaison en parfait état. Ce
 * qui est mort ici, c'est le GRANT : le consentement retiré, le mot de passe
 * changé, l'application désinstallée, le jeton de rafraîchissement révoqué.
 *
 * Le motif ne matche donc JAMAIS un « expired » nu : il exige que le mot porte
 * sur le grant, le refresh token ou l'authentification elle-même. Un témoin de
 * `Google access token expired` vit dans la spec pour tenir cette frontière.
 */
export function looksLikeExpiredAuthorization(message: string): boolean {
  return /invalid_grant|BAD_AUTH_REFRESH_TOKEN|refresh[ _]token (?:is |has )?(?:invalid|expired|revoked)|(?:refresh )?token has (?:been |expired)|(?:grant|consent|authorization|authorisation|authentication) (?:has been |was |is )?(?:expired|revoked|invalid)|expired access\/refresh token|AADSTS(?:700082|700003|50173)/i.test(
    message,
  )
}

type ConnectorFailureInput = {
  code: ConnectorErrorCode
  /** `google`, `microsoft`, `hubspot`… — de la donnée, pas du texte d'écran. */
  provider: string
  /** La capacité qui a échoué (`documents`, `mail`, `calendar`, `crm`). */
  capability?: string | null
  /** Les portées manquantes, NOMMÉES. Ignorées pour tout code autre que `scope_missing`. */
  scopes?: readonly string[]
  /** Le message d'écran, en français, qui ne nomme jamais l'éditeur. */
  message: string
}

export function connectorErrorBody(input: ConnectorFailureInput): ConnectorErrorBody {
  const status = connectorErrorStatus(input.code)
  return {
    statusCode: status,
    error: status === 429 ? 'Too Many Requests' : 'Service Unavailable',
    code: input.code,
    // Miroir volontaire : `code` pour le navigateur, `reason` pour les journaux
    // et les alertes posées depuis PR #936. Les faire diverger rouvrirait le trou.
    reason: input.code,
    provider: input.provider,
    capability: input.capability ?? null,
    // Une portée n'est nommée que quand il en manque une. Inventer une portée
    // pour une panne réseau enverrait reconnecter un outil qui va très bien.
    scopes: input.code === 'scope_missing' ? [...(input.scopes ?? [])] : [],
    message: input.message,
  }
}

/**
 * L'exception à lever depuis un contrôleur ou un service de connecteur.
 *
 * Reste une `ServiceUnavailableException` pour les 503 — c'est la classe que les
 * modules levaient déjà, et en changer aurait cassé des gardes qui vérifient le
 * TYPE de l'exception sans rien apporter : le corps est identique.
 */
export function connectorFailure(input: ConnectorFailureInput): HttpException {
  const body = connectorErrorBody(input)
  return body.statusCode === 503 ? new ServiceUnavailableException(body) : new HttpException(body, body.statusCode)
}

/**
 * Le raccourci du cas qui a coûté trois pannes : une portée qui manque.
 *
 * `scopes` n'est pas optionnel ici, et c'est délibéré : un `scope_missing` sans
 * portée nommée est exactement l'erreur d'avant — elle dit qu'il manque quelque
 * chose sans dire quoi, et personne ne peut agir dessus.
 */
export function scopeMissing(input: {
  provider: string
  capability: string
  scopes: readonly string[]
  message: string
}): HttpException {
  return connectorFailure({ ...input, code: 'scope_missing' })
}

/**
 * Traduit l'échec BRUT d'un fournisseur en code stable.
 *
 * L'ordre des tests est l'ordre d'irréversibilité : ce qui ne repassera jamais
 * tout seul passe avant ce qui se rattrape. Une portée manquante annoncée comme
 * « réessaie dans un moment » fait perdre une journée à quelqu'un qui attend.
 */
export function classifyProviderError(error: unknown): ConnectorErrorCode {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (looksLikeDisabledProviderApi(message)) return 'provider_api_disabled'
  // #1836 — AVANT la portée, et ce n'est pas cosmétique : un refus de grant
  // arrive souvent en 401/403, que `looksLikeMissingScope` avale (`forbidden`,
  // `403`). Classé « portée manquante », il enverrait l'opérateur déclarer chez
  // le fournisseur une portée qui y est déjà, pendant que le vrai geste — se
  // reconnecter — reste invisible.
  if (looksLikeExpiredAuthorization(message)) return 'authorization_expired'
  if (looksLikeMissingScope(message)) return 'scope_missing'
  if (isThrottleError(error)) return 'rate_limited'
  return 'provider_unavailable'
}

/**
 * Le message d'écran par défaut d'un code, par capacité.
 *
 * Écrit ici et pas dans chaque module : c'est ce qui garantit qu'une panne
 * d'agenda et une panne de messagerie se lisent de la même façon, et qu'aucune
 * des deux ne nomme l'éditeur.
 */
export function connectorMessage(code: ConnectorErrorCode, capabilityLabel: string): string {
  switch (code) {
    case 'not_connected':
      return `${capabilityLabel} n'est pas encore connecté. ${connectorErrorAction(code)}`
    case 'scope_missing':
      return `Je n'ai pas le droit de regarder ${capabilityLabel}. ${connectorErrorAction(code)}`
    case 'provider_api_disabled':
      return `L'accès à ${capabilityLabel} est éteint côté fournisseur. ${connectorErrorAction(code)}`
    case 'provider_unavailable':
      return `${capabilityLabel} n'a pas répondu. ${connectorErrorAction(code)}`
    case 'rate_limited':
      return `${capabilityLabel} a reçu trop de demandes d'un coup. ${connectorErrorAction(code)}`
    // #1836 — « est bien connecté, MAIS » : la phrase doit tenir les deux bouts,
    // sinon elle contredit l'écran Intégrations, qui montre la ligne connectée.
    case 'authorization_expired':
      return `${capabilityLabel} est bien connecté, mais son autorisation a expiré. ${connectorErrorAction(code)}`
  }
}

/**
 * Le raccourci du cas de #1836 : l'autorisation d'un connecteur est morte.
 *
 * Existe pour la même raison que `scopeMissing` — cinq services levaient chacun
 * leur `new ServiceUnavailableException('… token expired and cannot be
 * refreshed')`, une phrase de développeur en anglais SANS `code`. Le navigateur
 * ne lit que `code` : les cinq se rendaient donc à l'écran en « panne », avec le
 * chemin de réparation RETIRÉ au motif qu'une panne ne se répare pas dans
 * Intégrations. Le statut ne change pas (503) ; ce qui change est que la réponse
 * porte enfin le geste.
 *
 * Aucune portée n'est acceptée ici, et c'est délibéré : ce n'est pas une portée
 * qui manque, c'est l'autorisation entière qui est morte.
 */
export function authorizationExpired(input: {
  provider: string
  capability?: string | null
  /** La CAPACITÉ, telle qu'elle se lit (« ton CRM », « ta messagerie »). Jamais l'éditeur. */
  capabilityLabel: string
}): HttpException {
  return connectorFailure({
    code: 'authorization_expired',
    provider: input.provider,
    capability: input.capability ?? null,
    message: connectorMessage('authorization_expired', input.capabilityLabel),
  })
}
