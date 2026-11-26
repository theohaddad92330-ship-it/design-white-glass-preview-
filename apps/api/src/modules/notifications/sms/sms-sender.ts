/**
 * LE PORT D'ENVOI DES SMS — #1938.4, décision Louis 13/09 batch 13 (port),
 * branchement 13/09 (fournisseur choisi).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOURNISSEUR : MESSAGEBIRD (BIRD)
 * ─────────────────────────────────────────────────────────────────────────────
 * Choisi par Louis pour le besoin : auth à une seule clé (`Authorization:
 * AccessKey <clé>`), REST simple sans SDK, société néerlandaise → hébergement/
 * traitement UE, tarif à l'usage sans engagement — adapté à un volume faible
 * (3 types d'alerte, opt-in, un SMS à la fois). `agent_docs/env-reference.md`
 * (section « Alertes urgentes par SMS ») documente ce qui reste à l'opérateur :
 * poser `SMS_PROVIDER_API_KEY` pour payer, éventuellement `SMS_SENDER_ID` et
 * `SMS_ALLOWED_COUNTRY_CODES`.
 *
 * `configured: false` reste la promesse « sans clé = no-op strict » : chaque
 * appelant (`SmsChannelService`) s'arrête AVANT toute lecture de base et tout
 * appel réseau tant qu'aucune clé n'est posée.
 *
 * Ce fichier ne journalise JAMAIS la clé, le corps de la réponse fournisseur,
 * ni le numéro : une erreur levée depuis `send()` ne porte qu'un message
 * générique, laissant l'appelant décider de ce qu'il journalise (il masque
 * déjà le numéro — `sms-channel.service.ts`).
 */

/** Le jeton d'injection du port. */
export const SMS_SENDER = Symbol('SMS_SENDER')

import { isSmsCountryAllowed, parseSmsAllowedCountryCodes } from './sms-recipient'

export type SmsSender = {
  /** Un fournisseur est-il réellement branché ? `false` = rien ne part, et
   *  l'appelant ne doit rien lire ni rien tenter. */
  readonly configured: boolean
  /** #4016 L12 — ce pays est-il dans `SMS_ALLOWED_COUNTRY_CODES` ? Répond AVANT tout envoi. */
  allowsCountry(e164: string): boolean
  send(message: { to: string; text: string }): Promise<void>
}

class UnconfiguredSmsSender implements SmsSender {
  readonly configured = false

  allowsCountry(): boolean {
    return false
  }

  send(): Promise<void> {
    return Promise.reject(new Error('Aucun fournisseur SMS n’est branché : cet envoi n’aurait jamais dû être tenté.'))
  }
}

const MESSAGEBIRD_MESSAGES_URL = 'https://rest.messagebird.com/messages'

const DEFAULT_SENDER_ID = 'BellumAI'
/** GSM alphanumérique, tel que tranché : lettres/chiffres ASCII, 11 caractères au plus. */
const VALID_SENDER_ID = /^[A-Za-z0-9]{1,11}$/

/**
 * Le client MessageBird réel. Contrat HTTP vérifié sur la documentation
 * MessageBird (#1938.4) :
 *   POST https://rest.messagebird.com/messages
 *   Authorization: AccessKey <clé> · Content-Type: application/json
 *   { originator, recipients: [numéro SANS le +], body }
 * Succès : 201. Échec : 4xx/5xx, { errors: [{ code, description, parameter }] }.
 */
class MessageBirdSmsSender implements SmsSender {
  readonly configured = true

  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly allowedCountryCodes: readonly string[],
  ) {}

  allowsCountry(e164: string): boolean {
    return isSmsCountryAllowed(e164, this.allowedCountryCodes)
  }

  async send(message: { to: string; text: string }): Promise<void> {
    const digits = message.to.replace(/^\+/, '')

    // Fraude au SMS surtaxé : la route de demande de code est la cible
    // classique — un indicatif hors liste ne déclenche AUCUN appel réseau.
    // #4016 L12 — la liste est celle de l'opérateur (`SMS_ALLOWED_COUNTRY_CODES`,
    // ex. « 33,32,41,352 » pour FR/BE/CH/LU), validée à la lecture.
    if (!this.allowsCountry(message.to)) {
      throw new Error('SMS : indicatif pays non autorisé — aucun envoi tenté auprès du fournisseur.')
    }

    const response = await fetch(MESSAGEBIRD_MESSAGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `AccessKey ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        originator: this.senderId,
        recipients: [digits],
        body: message.text,
      }),
    })

    if (!response.ok) {
      throw new Error(`SMS : le fournisseur a refusé l’envoi (HTTP ${response.status}).`)
    }
  }
}

function resolveSenderId(raw: string | undefined, warn: (message: string) => void): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_SENDER_ID
  if (VALID_SENDER_ID.test(value)) return value
  warn('SMS : SMS_SENDER_ID invalide (11 caractères alphanumériques GSM au plus attendus) — retombé sur "BellumAI".')
  return DEFAULT_SENDER_ID
}

/**
 * Le port, tel que l'environnement le permet. `SMS_PROVIDER_API_KEY` (trim)
 * non vide → le vrai client MessageBird, `configured: true`. Absente → le port
 * inerte d'avant, sans aucun avertissement (il n'y a plus rien à signaler :
 * poser la clé branche désormais réellement le canal).
 */
export function createSmsSender(env: Record<string, string | undefined>, warn: (message: string) => void): SmsSender {
  const apiKey = (env.SMS_PROVIDER_API_KEY ?? '').trim()
  if (!apiKey) {
    return new UnconfiguredSmsSender()
  }

  const senderId = resolveSenderId(env.SMS_SENDER_ID, warn)
  const allowedCountryCodes = parseSmsAllowedCountryCodes(env.SMS_ALLOWED_COUNTRY_CODES)
  return new MessageBirdSmsSender(apiKey, senderId, allowedCountryCodes)
}
