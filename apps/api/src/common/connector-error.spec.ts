import { HttpException } from '@nestjs/common'
import { CONNECTOR_ERROR_CODES, connectorErrorSchema } from '@bellum/contracts'
import {
  authorizationExpired,
  classifyProviderError,
  connectorErrorBody,
  connectorFailure,
  connectorMessage,
  looksLikeDisabledProviderApi,
  looksLikeExpiredAuthorization,
  scopeMissing,
} from './connector-error'
import { isCapacityError } from '../modules/health/client-facing-errors'

/**
 * LA GARDE D'ABORD — BEL-INT-601 PR1.
 *
 * Les trois pannes du 16/08/2026 avaient la même signature : le statut disait
 * « connecté » et la donnée ne venait pas. Ce fichier rejoue les trois messages
 * fournisseur EXACTS relevés dans les logs Railway ce jour-là, et exige de
 * chacun la même réponse : un 503 qui porte `code`, qui NOMME la portée, et
 * qui n'est ni un tableau vide, ni un 500.
 *
 * Les chaînes ci-dessous ne sont pas inventées : elles viennent de
 * `agent_docs/recette-connecteurs-2026-08-16.md`.
 */

/** Le message que Google Cloud a réellement renvoyé, le 16/08, sur le projet 240781671020. */
const CALENDAR_DISABLED =
  'Google Calendar API has not been used in project 240781671020 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=240781671020 then retry.'

/** Le message que HubSpot a réellement renvoyé sur `GET /crm/pipeline/report`. */
const HUBSPOT_MISSING_SCOPE = "HubSpot read deals failed: This app hasn't been granted all required scopes"

/** Le 403 que Drive rend quand la portée fichiers manque. */
const DRIVE_FORBIDDEN = 'Google Drive list files failed: 403 Forbidden — insufficient permission'

describe('les trois pannes du 16/08 ne peuvent plus se reproduire en silence', () => {
  it('cas n°1 — une API éteinte côté fournisseur n’est ni une panne ni une portée', () => {
    // Le piège : « réessaie dans un moment » est faux ici. Personne n'active une
    // API en réessayant ; il faut aller la cocher dans une console.
    expect(classifyProviderError(new Error(CALENDAR_DISABLED))).toBe('provider_api_disabled')
    expect(looksLikeDisabledProviderApi(CALENDAR_DISABLED)).toBe(true)
  })

  it('cas n°2 — une portée manquante rend un 503 qui NOMME le geste, jamais un 500', () => {
    const code = classifyProviderError(new Error(HUBSPOT_MISSING_SCOPE))
    expect(code).toBe('scope_missing')

    const error = connectorFailure({
      code,
      provider: 'hubspot',
      capability: 'crm',
      scopes: ['crm.objects.deals.read', 'crm.objects.companies.read'],
      message: connectorMessage(code, 'ton CRM'),
    })
    expect(error).toBeInstanceOf(HttpException)
    // 503 et pas 500 : le serveur va très bien, c'est l'accès qui manque.
    expect(error.getStatus()).toBe(503)

    const body = connectorErrorSchema.parse(error.getResponse())
    expect(body.code).toBe('scope_missing')
    // Le NOM de la portée, pas « il manque un accès » : c'est ce qui permet à
    // l'opérateur de savoir quoi déclarer chez le fournisseur.
    expect(body.scopes).toEqual(['crm.objects.deals.read', 'crm.objects.companies.read'])
  })

  it('cas n°3 — la recherche documentaire ne rend JAMAIS un tableau vide sur une portée absente', () => {
    // C'était la pire des trois : une erreur se remarque, une liste vide se croit.
    const code = classifyProviderError(new Error(DRIVE_FORBIDDEN))
    expect(code).toBe('scope_missing')

    const body = connectorErrorSchema.parse(
      connectorErrorBody({
        code,
        provider: 'google',
        capability: 'documents',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
        message: connectorMessage(code, 'tes documents'),
      }),
    )
    expect(body.statusCode).toBe(503)
    expect(body.scopes).toHaveLength(1)
  })
})

describe('le contrat d’erreur de connecteur', () => {
  it('porte la même valeur dans `code` et dans `reason`', () => {
    // `code` est ce que le navigateur lit ; `reason` ce que lisent les journaux
    // posés en PR #936. Les faire diverger rouvrirait le trou qu'on vient de
    // boucher — le correctif du 16/08 était invisible à l'écran pour cette
    // raison exacte.
    for (const code of CONNECTOR_ERROR_CODES) {
      const body = connectorErrorBody({ code, provider: 'google', message: 'peu importe' })
      expect(body.reason).toBe(body.code)
    }
  })

  it('ne nomme une portée que quand il en manque une', () => {
    // Inventer une portée pour une panne réseau enverrait reconnecter un outil
    // qui va parfaitement bien.
    for (const code of CONNECTOR_ERROR_CODES) {
      const body = connectorErrorBody({
        code,
        provider: 'microsoft',
        scopes: ['Files.Read.All'],
        message: 'peu importe',
      })
      expect(body.scopes).toEqual(code === 'scope_missing' ? ['Files.Read.All'] : [])
    }
  })

  it('met le débit en 429 et tout le reste en 503', () => {
    expect(connectorErrorBody({ code: 'rate_limited', provider: 'google', message: 'x' }).statusCode).toBe(429)
    for (const code of CONNECTOR_ERROR_CODES.filter(c => c !== 'rate_limited')) {
      expect(connectorErrorBody({ code, provider: 'google', message: 'x' }).statusCode).toBe(503)
    }
  })

  it('ne nomme jamais l’éditeur dans le message d’écran', () => {
    // Règle produit du 02/08 : l'application nomme la CAPACITÉ, seul l'écran
    // Réglages › Intégrations nomme l'outil. `provider` et `scopes` sont de la
    // donnée que cet écran-là rend ; `message` est lu partout.
    const editors = /google|microsoft|hubspot|salesforce|pipedrive|attio|notion|outlook|gmail|slack|teams/i
    for (const code of CONNECTOR_ERROR_CODES) {
      expect(connectorMessage(code, 'ton espace documentaire')).not.toMatch(editors)
    }
  })

  it('classe l’irréversible avant le rattrapable', () => {
    // Un message qui porte À LA FOIS un refus de portée et une mention de débit
    // doit sortir en `scope_missing` : le débit se rattrape, la portée non.
    expect(classifyProviderError(new Error('403 forbidden — rate limit also mentioned'))).toBe('scope_missing')
    expect(classifyProviderError(new Error('Too many concurrent requests for user'))).toBe('rate_limited')
    expect(classifyProviderError(new Error('socket hang up'))).toBe('provider_unavailable')
  })

  it('exige une portée nommée pour un `scope_missing`', () => {
    // Le raccourci `scopeMissing` rend le champ obligatoire par son type. Ce
    // test garde le comportement : un `scope_missing` sans portée est l'erreur
    // d'avant — elle dit qu'il manque quelque chose sans dire quoi.
    const body = connectorErrorSchema.parse(
      scopeMissing({
        provider: 'microsoft',
        capability: 'documents',
        scopes: ['Files.Read.All'],
        message: connectorMessage('scope_missing', 'ton espace documentaire'),
      }).getResponse(),
    )
    expect(body.scopes).toEqual(['Files.Read.All'])
  })
})

/**
 * #1836 — UNE AUTORISATION MORTE N'EST PAS UNE PANNE DU PRODUIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT, MESURÉ SUR `/pilotage`
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /crm/pipeline/report` rendait un **503 nu** :
 * `new ServiceUnavailableException('CRM token expired and cannot be refreshed')`
 * — une phrase de développeur, en anglais, SANS `code`. Le navigateur ne lit que
 * `code` : l'écran retombait donc sur « panne », affichait « ton CRM n'a pas
 * répondu » et RETIRAIT le lien vers Intégrations, au motif qu'une panne ne se
 * répare pas là-bas.
 *
 * Or la connexion existait, et elle était morte. Le geste existait : reconnecter.
 * C'est la distinction FAIL (défaut du produit) contre BLOCKED (configuration),
 * et elle était rendue à l'envers — l'utilisateur attendait que « ça revienne »
 * devant quelque chose qui ne revient jamais tout seul.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SIXIÈME CODE, ET PAS UN DES CINQ
 * ─────────────────────────────────────────────────────────────────────────────
 * `not_connected` dit « il n'y a rien à réparer, il y a quelque chose à
 * brancher » — faux : la ligne existe, et l'écran Intégrations la montre bien
 * connectée. Rejouer ce mensonge est exactement la panne du 16/08 (« connecté »
 * d'un côté, erreur de l'autre). `scope_missing` NOMME des portées, et en
 * inventer pour un consentement retiré envoie déclarer chez le fournisseur
 * quelque chose qui y est déjà. `provider_unavailable` dit « réessaie », ce qui
 * est le mensonge d'origine.
 *
 * `client-facing-errors.ts` avait écrit d'avance le critère qui tranche : « le
 * chemin nominal était-il OUVERT ? ». Ici il ne l'était pas — c'est une
 * CAPACITÉ, pas un incident. Le mot `authorization_expired` n'est pas inventé
 * non plus : c'est celui de `capabilityStateValues` et de `routine-executors`
 * pour exactement cette situation.
 */
describe('#1836 — une autorisation morte se dit, et elle ouvre un chemin', () => {
  /** Ce que HubSpot rend quand le consentement a été retiré côté portail. */
  const REVOKED_GRANT = 'HubSpot token refresh failed: {"status":"BAD_AUTH_REFRESH_TOKEN","message":"invalid_grant"}'

  it('classe un consentement retiré en `authorization_expired`, jamais en panne', () => {
    // C'est le cœur du défaut : « réessaie dans un moment » pour quelque chose
    // qui ne repassera pas sans l'utilisateur.
    expect(classifyProviderError(new Error(REVOKED_GRANT))).toBe('authorization_expired')
    expect(looksLikeExpiredAuthorization(REVOKED_GRANT)).toBe(true)
  })

  it('reconnaît les formes que les quatre fournisseurs OAuth emploient', () => {
    for (const raw of [
      'invalid_grant',
      'Salesforce token refresh failed: expired access/refresh token',
      'Microsoft token refresh failed: AADSTS700082 refresh token has expired due to inactivity',
      'The refresh token is invalid',
      'Google token refresh failed: Token has been revoked.',
    ]) {
      expect(`${raw} → ${classifyProviderError(new Error(raw))}`).toBe(`${raw} → authorization_expired`)
    }
  })

  it('n’attrape PAS ce qu’elle ne vise pas — les témoins voisins', () => {
    // La garde trop gourmande est le défaut symétrique. Un jeton d'ACCÈS périmé
    // est la situation NORMALE : il se renouvelle tout seul, et l'annoncer
    // « reconnecte » enverrait réparer une liaison en parfait état.
    for (const [raw, expected] of [
      ['Google access token expired', 'provider_unavailable'],
      ['socket hang up', 'provider_unavailable'],
      ['HubSpot read deals failed: This app hasn’t been granted all required scopes', 'scope_missing'],
      ['Too many concurrent requests for user', 'rate_limited'],
      [CALENDAR_DISABLED, 'provider_api_disabled'],
    ] as const) {
      expect(`${raw} → ${classifyProviderError(new Error(raw))}`).toBe(`${raw} → ${expected}`)
    }
    expect(looksLikeExpiredAuthorization('Google access token expired')).toBe(false)
  })

  it('rend un 503 qui porte le code, la capacité, et AUCUNE portée inventée', () => {
    const body = connectorErrorSchema.parse(
      authorizationExpired({ provider: 'hubspot', capability: 'crm', capabilityLabel: 'ton CRM' }).getResponse(),
    )
    expect(body.statusCode).toBe(503)
    expect(body.code).toBe('authorization_expired')
    expect(body.capability).toBe('crm')
    // Une portée inventée enverrait déclarer chez le fournisseur ce qui y est déjà.
    expect(body.scopes).toEqual([])
  })

  it('dit le GESTE dans le message, et nomme la capacité — jamais l’éditeur', () => {
    const body = connectorErrorSchema.parse(
      authorizationExpired({ provider: 'hubspot', capability: 'crm', capabilityLabel: 'ton CRM' }).getResponse(),
    )
    expect(body.message).toContain('ton CRM')
    expect(body.message.toLowerCase()).toContain('reconnecte')
    expect(body.message).not.toMatch(/hubspot/i)
    // Et surtout : plus une phrase de développeur en anglais.
    expect(body.message).not.toContain('cannot be refreshed')
  })

  it('compte comme une CAPACITÉ, pas comme un incident', () => {
    // Le critère est écrit dans `client-facing-errors.ts` : le chemin nominal
    // n'était pas ouvert. Un consentement retiré noyé dans les incidents ferait
    // chercher une panne qui n'existe pas.
    expect(isCapacityError('authorization_expired')).toBe(true)
  })
})
