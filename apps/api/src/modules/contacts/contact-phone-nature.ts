import { phoneNatureFromProviderType, resolvePhoneNature, type PhoneNature } from '@bellum/contracts'
import { normalizePhone } from './contact-identity'

type ProviderPhone = { number: string; type?: string | null }

/**
 * #4178.1 — la nature à ÉCRIRE avec un numéro que le fournisseur vient de
 * rendre. Le numéro est comparé à `phone_numbers[]` (même profil) : la nature
 * vient du TYPE de ligne que le fournisseur déclare, jamais du format ni du
 * préfixe. Sans entrée correspondante, `unknown` (« nature non vérifiée »).
 */
export function providerPhoneNature(phone: string, providerPhones: readonly ProviderPhone[] | undefined): PhoneNature {
  const key = normalizePhone(phone)
  const natures = (providerPhones ?? [])
    .filter(entry => key !== '' && normalizePhone(entry.number) === key)
    .map(entry => phoneNatureFromProviderType(entry.type))
  return resolvePhoneNature(natures).nature
}
