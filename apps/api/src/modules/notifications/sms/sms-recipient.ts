import { isQualifiedOutboundConsent } from '@bellum/contracts'

/**
 * QUI A LE DROIT DE RECEVOIR UN SMS — un seul endroit (GA-26), lu à CHAQUE envoi.
 *
 * #4016 L12 (Louis 11/10) : les alertes Découvrir sortent aussi en SMS vers la
 * Belgique, la Suisse et le Luxembourg. Les pays autorisés restent une
 * décision d'opérateur lue de `SMS_ALLOWED_COUNTRY_CODES` ; sans valeur, la
 * France seule — rien ne s'élargit sans clé. Le consentement (daté) et la
 * vérification du numéro se relisent à chaque envoi : l'opposition d'une
 * personne (retrait du numéro, case décochée) l'emporte sur tout ce qui a été
 * décidé avant elle.
 */

const DEFAULT_ALLOWED_COUNTRY_CODES: readonly string[] = ['33']
/**
 * Un indicatif pays tient en 1 à 3 chiffres, et les seuls à UN chiffre sont
 * « 1 » (Amérique du Nord) et « 7 » : « 3 » ou « 4 » seuls couvriraient toute
 * l'Europe d'un coup. Plus long ou plus court n'est pas un indicatif.
 */
const COUNTRY_CODE = /^(?:[17]|[1-9]\d{1,2})$/

export function parseSmsAllowedCountryCodes(raw: string | undefined): string[] {
  const codes = (raw ?? '')
    .split(',')
    .map(code => code.trim().replace(/^\+/, ''))
    .filter(code => COUNTRY_CODE.test(code))
  return codes.length > 0 ? codes : [...DEFAULT_ALLOWED_COUNTRY_CODES]
}

/**
 * Le « + » est exigé : sans lui, « 33612… » pourrait être un numéro national
 * d'un autre pays. Un indicatif ne se devine pas (« un contrat non vérifiable ne
 * se devine pas »).
 */
export function isSmsCountryAllowed(e164: string, allowedCountryCodes: readonly string[]): boolean {
  const phone = (e164 ?? '').trim()
  if (!phone.startsWith('+')) return false
  const digits = phone.slice(1)
  if (!/^\d+$/.test(digits)) return false
  return allowedCountryCodes.some(code => digits.startsWith(code))
}

type SmsRecipientRefusal = 'no_number' | 'not_verified' | 'no_consent' | 'country_not_allowed'

/** `null` = tout est là. Sinon, LE motif du refus (le premier de la chaîne). */
export function smsRecipientRefusal(
  input: {
    phone: string | null | undefined
    verifiedAt: Date | string | null | undefined
    consentAt: Date | string | null | undefined
    /** Le pays du numéro est-il dans la liste de l'opérateur ? (`SmsSender.allowsCountry`) */
    countryAllowed: boolean
  },
  now: Date = new Date(),
): SmsRecipientRefusal | null {
  const phone = (input.phone ?? '').trim()
  if (!phone) return 'no_number'
  if (!input.verifiedAt) return 'not_verified'
  if (!isQualifiedOutboundConsent(input.consentAt, now)) return 'no_consent'
  if (!input.countryAllowed) return 'country_not_allowed'
  return null
}
